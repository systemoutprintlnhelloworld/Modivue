#!/usr/bin/env python3
"""
Modivue README 素材生成器
  banner   1280x640 社交预览图（Settings → Social preview）
  frame    统一截图外观：留白、圆角、阴影、同宽，供 README 两栏表格使用
  grid     多图拼版（Release 说明、社区帖用）
  carousel 淡入淡出轮播（GIF / WebP / MP4），用于没有录屏条件的补充演示

依赖: pip install pillow   （MP4 需要系统 ffmpeg）
示例:
  python scripts/readme_assets.py banner -o docs/media/social-preview.png
  python scripts/readme_assets.py frame raw/*.png --outdir docs/media/0.4.1
  python scripts/readme_assets.py grid raw/*.png --labels "概览,悬浮详情,..." -o docs/media/0.4.1/gallery.png
"""
import argparse, math, os, shutil, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# ---- 品牌色（取自 Modivue 界面） ----
BG      = (22, 24, 35)
BG2     = (30, 32, 48)
CARD    = (37, 40, 58)
STROKE  = (58, 62, 86)
TEXT    = (230, 233, 245)
MUTED   = (146, 152, 178)
ACCENT  = (122, 162, 247)
RINGS = {                      # 由外到内
    "verify":  (139, 203, 127),
    "cache":   (232, 115, 122),
    "ttft":    (167, 116, 232),
    "balance": (79, 209, 176),
}

FONT_CANDIDATES = {
    "bold": [
        "/System/Library/Fonts/PingFang.ttc",
        "C:/Windows/Fonts/msyhbd.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    ],
    "regular": [
        "/System/Library/Fonts/PingFang.ttc",
        "C:/Windows/Fonts/msyh.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    ],
}

def font(kind, size, override=None):
    for p in ([override] if override else []) + FONT_CANDIDATES[kind]:
        if p and os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                pass
    print("⚠ 未找到中文字体，用 --font 指定", file=sys.stderr)
    return ImageFont.load_default()

def rounded(im, r):
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, *im.size), r, fill=255)
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)
    return out

def shadow(size, r, blur=18, alpha=150):
    pad = blur * 2
    sh = Image.new("RGBA", (size[0] + pad * 2, size[1] + pad * 2), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((pad, pad, pad + size[0], pad + size[1]), r, fill=(0, 0, 0, alpha))
    return sh.filter(ImageFilter.GaussianBlur(blur)), pad

def fit(im, box_w, box_h, mode="contain"):
    im = im.convert("RGBA")
    s = (min if mode == "contain" else max)(box_w / im.width, box_h / im.height)
    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    if mode == "cover":
        l, t = (im.width - box_w) // 2, 0          # 截图顶部通常最重要，靠上裁
        im = im.crop((l, t, l + box_w, t + box_h))
    return im

def mix(a, b, t):
    """a 占比 t 的实色混合（ImageDraw 在 RGBA 上不做 alpha 混合）"""
    return tuple(round(a[i] * t + b[i] * (1 - t)) for i in range(3))

def bg_gradient(w, h):
    g = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(g)
    for y in range(h):
        t = y / h
        d.line([(0, y), (w, y)], fill=tuple(round(BG[i] * (1 - t) + BG2[i] * t) for i in range(3)))
    # 角落柔光
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((w * 0.55, -h * 0.5, w * 1.3, h * 0.6), fill=(*ACCENT, 40))
    gd.ellipse((-w * 0.3, h * 0.5, w * 0.35, h * 1.4), fill=(*RINGS["balance"], 28))
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    return Image.alpha_composite(g.convert("RGBA"), glow)

def draw_rings(canvas, cx, cy, R, width, gap, values):
    """values: 与 RINGS 同序的 0~1 进度"""
    ss = 4
    size = (R + width) * 2 * ss
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    c = size // 2
    for i, (name, col) in enumerate(RINGS.items()):
        r = (R - i * (width + gap)) * ss
        box = (c - r, c - r, c + r, c + r)
        d.arc(box, 0, 360, fill=(*col, 55), width=width * ss)
        end = -90 + 360 * values[i]
        d.arc(box, -90, end, fill=(*col, 255), width=width * ss)
        # 圆头
        for ang in (-90, end):
            a = math.radians(ang)
            rr = r - width * ss / 2
            x, y = c + rr * math.cos(a), c + rr * math.sin(a)
            h = width * ss / 2
            d.ellipse((x - h, y - h, x + h, y + h), fill=(*col, 255))
    inner = (R - 4 * (width + gap)) * ss
    d.ellipse((c - inner, c - inner, c + inner, c + inner), fill=(*CARD, 255))
    layer = layer.resize((size // ss, size // ss), Image.LANCZOS)
    canvas.alpha_composite(layer, (cx - layer.width // 2, cy - layer.height // 2))

# ------------------------------------------------------------------ banner
def cmd_banner(a):
    W, H = 1280, 640
    im = bg_gradient(W, H)
    d = ImageDraw.Draw(im)
    d.text((88, 150), "Modivue", font=font("bold", 104, a.font), fill=TEXT)
    d.text((92, 285), a.tagline, font=font("bold", 40, a.font), fill=TEXT)
    d.text((92, 345), a.sub, font=font("regular", 26, a.font), fill=MUTED)
    # 指标胶囊
    x, y = 92, 430
    f = font("regular", 22, a.font)
    ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    pills = []
    for (name, col), label in zip(RINGS.items(), ["模型核验", "Cache 命中", "TTFT", "余额"]):
        tw = d.textlength(label, font=f)
        od.rounded_rectangle((x, y, x + tw + 52, y + 44), 22, fill=(*col, 34), outline=(*col, 150), width=2)
        pills.append((x, col, label))
        x += tw + 66
    im.alpha_composite(ov)
    d = ImageDraw.Draw(im)
    for x, col, label in pills:
        d.ellipse((x + 16, y + 16, x + 28, y + 28), fill=col)
        d.text((x + 38, y + 22), label, font=f, fill=TEXT, anchor="lm")
    d.text((92, 535), a.footer, font=font("regular", 22, a.font), fill=MUTED)
    draw_rings(im, 1010, 320, 190, 22, 12, [0.78, 0.46, 0.63, 0.88])
    im.convert("RGB").save(a.output, optimize=True)
    print("✓", a.output)

# ------------------------------------------------------------------ frame
def cmd_frame(a):
    """给截图加统一的背景留白 + 圆角 + 阴影，输出同宽度，保证 README 两栏表格对齐"""
    os.makedirs(a.outdir, exist_ok=True)
    W = a.width
    for path in a.images:
        im = Image.open(path)
        pad = round(W * 0.06)
        if a.height:                                   # 固定画布高度：同一行两张图严格等高
            H = a.height
            shot = fit(im, W - pad * 2, H - pad * 2, "contain")
        else:
            shot = fit(im, W - pad * 2, a.max_height, "contain")
            H = shot.height + pad * 2
        canvas = bg_gradient(W, H)
        x, y = (W - shot.width) // 2, (H - shot.height) // 2
        sh, sp = shadow(shot.size, 14)
        canvas.alpha_composite(sh, (x - sp, y - sp + 8))
        canvas.alpha_composite(rounded(shot, 14), (x, y))
        out = os.path.join(a.outdir, os.path.splitext(os.path.basename(path))[0] + ".png")
        canvas.convert("RGB").save(out, optimize=True)
        print("✓", out, canvas.size)

# ------------------------------------------------------------------ grid
def cmd_grid(a):
    imgs = [Image.open(p) for p in a.images]
    labels = (a.labels.split(",") if a.labels else [os.path.splitext(os.path.basename(p))[0] for p in a.images])
    cols = a.cols
    rows = math.ceil(len(imgs) / cols)
    cw, ch, gap, pad, lab = a.cell_w, round(a.cell_w * a.ratio), 28, 48, 54
    W = pad * 2 + cols * cw + (cols - 1) * gap
    H = pad * 2 + rows * (ch + lab) + (rows - 1) * gap + (70 if a.title else 0)
    canvas = bg_gradient(W, H)
    d = ImageDraw.Draw(canvas)
    top = pad
    if a.title:
        d.text((pad, pad - 8), a.title, font=font("bold", 36, a.font), fill=TEXT)
        top += 70
    fl = font("regular", 24, a.font)
    fn = font("bold", 18, a.font)
    for i, (im, label) in enumerate(zip(imgs, labels)):
        r, c = divmod(i, cols)
        x = pad + c * (cw + gap)
        y = top + r * (ch + lab + gap)
        sh, sp = shadow((cw, ch), 18)
        canvas.alpha_composite(sh, (x - sp, y - sp + 8))
        card = Image.new("RGBA", (cw, ch), (*CARD, 255))
        shot = fit(im, cw, ch, a.mode)
        card.alpha_composite(shot, ((cw - shot.width) // 2, (ch - shot.height) // 2))
        canvas.alpha_composite(rounded(card, 18), (x, y))
        d.rounded_rectangle((x, y, x + cw, y + ch), 18, outline=STROKE, width=2)
        # 编号 + 标签
        num = f"{i + 1:02d}"
        d.rounded_rectangle((x, y + ch + 14, x + 44, y + ch + 44), 8, fill=mix(ACCENT, BG, 0.25))
        d.text((x + 22, y + ch + 29), num, font=fn, fill=ACCENT, anchor="mm")
        d.text((x + 56, y + ch + 29), label.strip(), font=fl, fill=TEXT, anchor="lm")
    canvas.convert("RGB").save(a.output, optimize=True)
    print("✓", a.output, canvas.size)

# ------------------------------------------------------------------ carousel
def carousel_frames(a):
    imgs = [Image.open(p) for p in a.images]
    labels = (a.labels.split(",") if a.labels else [""] * len(imgs))
    W, H = a.width, round(a.width * 0.625)
    bar = 64
    bw, bh = W - 80, H - bar - 60
    base = bg_gradient(W, H)
    fcap = font("bold", 26, a.font)
    slides = []
    for i, (im, lab) in enumerate(zip(imgs, labels)):
        s = base.copy()
        shot = fit(im, bw, bh, "contain")
        x, y = (W - shot.width) // 2, 30 + (bh - shot.height) // 2
        sh, sp = shadow(shot.size, 16)
        s.alpha_composite(sh, (x - sp, y - sp + 8))
        s.alpha_composite(rounded(shot, 16), (x, y))
        d = ImageDraw.Draw(s)
        cy = H - bar // 2 - 6
        d.text((40, cy), lab.strip(), font=fcap, fill=TEXT, anchor="lm")
        # 进度点
        n = len(imgs)
        for k in range(n):
            px = W - 40 - (n - 1 - k) * 26
            if k == i:
                d.rounded_rectangle((px - 22, cy - 6, px + 6, cy + 6), 6, fill=ACCENT)
            else:
                d.ellipse((px - 6, cy - 6, px + 6, cy + 6), fill=STROKE)
        slides.append(s.convert("RGB"))
    frames, durations = [], []
    fade = a.fade_frames
    for i, s in enumerate(slides):
        frames.append(s); durations.append(a.hold)
        nxt = slides[(i + 1) % len(slides)]
        for k in range(1, fade + 1):
            frames.append(Image.blend(s, nxt, k / (fade + 1))); durations.append(40)
    return frames, durations

def cmd_carousel(a):
    frames, durations = carousel_frames(a)
    ext = os.path.splitext(a.output)[1].lower()
    if ext == ".gif":
        pal = [f.quantize(colors=255, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG) for f in frames]
        pal[0].save(a.output, save_all=True, append_images=pal[1:], duration=durations, loop=0, optimize=True, disposal=1)
    elif ext == ".webp":
        frames[0].save(a.output, save_all=True, append_images=frames[1:], duration=durations, loop=0, quality=88, method=6)
    elif ext == ".mp4":
        if not shutil.which("ffmpeg"):
            sys.exit("需要 ffmpeg")
        with tempfile.TemporaryDirectory() as td:
            lst = os.path.join(td, "list.txt")
            with open(lst, "w") as fh:
                for i, (f, dur) in enumerate(zip(frames, durations)):
                    p = os.path.join(td, f"{i:04d}.png"); f.save(p)
                    fh.write(f"file '{p}'\nduration {dur / 1000}\n")
            subprocess.run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-vf", "fps=25,format=yuv420p",
                            "-c:v", "libx264", "-crf", "20", a.output], check=True)
    else:
        sys.exit("输出扩展名须为 .gif / .webp / .mp4")
    print("✓", a.output, f"{len(frames)} 帧, {os.path.getsize(a.output) / 1e6:.1f} MB")

def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--font", help="自定义字体路径")
    sp = p.add_subparsers(dest="cmd", required=True)

    b = sp.add_parser("banner")
    b.add_argument("-o", "--output", default="docs/media/social-preview.png")
    b.add_argument("--tagline", default="vibe coding 的模型仪表盘")
    b.add_argument("--sub", default="中转站余额 · 缓存命中 · 首字延迟 · 模型核验，悬浮一眼看清")
    b.add_argument("--footer", default="macOS · Windows · CLI   ·   Local-first · Open source")

    fr = sp.add_parser("frame", help="统一截图外观（两栏表格用）")
    fr.add_argument("images", nargs="+")
    fr.add_argument("--width", type=int, default=1200)
    fr.add_argument("--max-height", type=int, default=900)
    fr.add_argument("--height", type=int, help="固定画布高度，例如 800")
    fr.add_argument("--outdir", default="docs/media/framed")

    g = sp.add_parser("grid")
    g.add_argument("images", nargs="+")
    g.add_argument("--labels")
    g.add_argument("--cols", type=int, default=3)
    g.add_argument("--cell-w", type=int, default=520)
    g.add_argument("--ratio", type=float, default=0.62, help="单元格高宽比")
    g.add_argument("--mode", choices=["contain", "cover"], default="cover")
    g.add_argument("--title")
    g.add_argument("-o", "--output", default="docs/media/gallery.png")

    c = sp.add_parser("carousel")
    c.add_argument("images", nargs="+")
    c.add_argument("--labels")
    c.add_argument("--width", type=int, default=1200)
    c.add_argument("--hold", type=int, default=2200, help="每张停留毫秒")
    c.add_argument("--fade-frames", type=int, default=8)
    c.add_argument("-o", "--output", default="docs/media/tour.gif")

    a = p.parse_args()
    if hasattr(a, "output"):
        os.makedirs(os.path.dirname(a.output) or ".", exist_ok=True)
    {"banner": cmd_banner, "frame": cmd_frame, "grid": cmd_grid, "carousel": cmd_carousel}[a.cmd](a)

if __name__ == "__main__":
    main()
