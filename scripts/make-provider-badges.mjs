#!/usr/bin/env node
// 用官方 logo 生成 README 里的 provider 徽章（logo 以 base64 内嵌进 SVG，文件名与原来一致）。
//
// 用法（需要 Node 18+，且能访问 github.com）：
//   node scripts/make-provider-badges.mjs                 # 输出到 docs/assets/badges
//   node scripts/make-provider-badges.mjs out/dir         # 指定输出目录
//   node scripts/make-provider-badges.mjs docs/assets/badges cpa=./my-cpa-logo.png
//
// 最后一种写法用本地文件覆盖某一项（key 为 new-api / sub2api / cpa），
// 适合官方图标换了地址，或你想先把图缩小再内嵌。

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const PROVIDERS = [
  {
    key: 'new-api',
    label: 'New API',
    file: 'provider-new-api.svg',
    src: 'https://github.com/QuantumNous/new-api/raw/main/web/public/logo.png',
  },
  {
    key: 'sub2api',
    label: 'Sub2API',
    file: 'provider-sub2api.svg',
    src: 'https://github.com/Wei-Shaw/sub2api/raw/main/assets/logo.svg',
  },
  {
    key: 'cpa',
    label: 'CPA',
    file: 'provider-cpa.svg',
    // 主仓库 CLIProxyAPI 没有自己的 logo，这里用官方管理中心仓库根目录的 logo.jpg。
    // 发布前请打开确认它确实是你要的图标。
    src: 'https://github.com/router-for-me/Cli-Proxy-API-Management-Center/raw/main/logo.jpg',
  },
];

const args = process.argv.slice(2);
const overrides = Object.fromEntries(
  args.filter((a) => /^[\w-]+=/.test(a)).map((a) => a.split(/=(.*)/s).slice(0, 2)),
);
const outDir = args.find((a) => !/^[\w-]+=/.test(a)) ?? 'docs/assets/badges';

async function load(src) {
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src, { redirect: 'follow' });
    if (!res.ok) throw new Error(`下载失败 ${res.status} ${src}`);
    return Buffer.from(await res.arrayBuffer());
  }
  return readFile(src);
}

function sniffMime(buf) {
  if (buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  const head = buf.subarray(0, 512).toString('utf8').trimStart();
  if (head.startsWith('<svg') || head.startsWith('<?xml') || head.includes('<svg')) return 'image/svg+xml';
  throw new Error('无法识别图片格式（只支持 PNG / JPEG / WebP / SVG）');
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function badge(label, mime, data) {
  // 名称宽度粗略按每字符 8.4px 估算；纯 ASCII 名称足够用。
  const textWidth = Math.ceil(label.length * 8.4);
  const width = 10 + 24 + 10 + textWidth + 14;
  const uri = `data:${mime};base64,${data.toString('base64')}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="40" viewBox="0 0 ${width} 40" role="img" aria-label="${esc(label)}">
  <title>${esc(label)}</title>
  <defs><clipPath id="c"><rect x="10" y="8" width="24" height="24" rx="6"/></clipPath></defs>
  <rect x="0.5" y="0.5" width="${width - 1}" height="39" rx="10" fill="#16181d" stroke="#2a2d34"/>
  <image x="10" y="8" width="24" height="24" clip-path="url(#c)" preserveAspectRatio="xMidYMid meet" xlink:href="${uri}" href="${uri}"/>
  <text x="44" y="25" font-family="-apple-system,'Segoe UI',Helvetica,Arial,sans-serif" font-size="14" font-weight="600" fill="#e6e8ec">${esc(label)}</text>
</svg>
`;
}

await mkdir(outDir, { recursive: true });

let failed = 0;
for (const p of PROVIDERS) {
  const src = overrides[p.key] ?? p.src;
  try {
    const buf = await load(src);
    const mime = sniffMime(buf);
    if (buf.length > 50 * 1024) {
      console.warn(`! ${p.label}: 原图 ${(buf.length / 1024).toFixed(0)} KB，建议先缩到 96px 左右再内嵌（可用 key=本地文件 覆盖）`);
    }
    const out = join(outDir, p.file);
    await writeFile(out, badge(p.label, mime, buf));
    console.log(`✓ ${out}  (${mime}, ${(buf.length / 1024).toFixed(1)} KB)`);
  } catch (err) {
    failed++;
    console.error(`✗ ${p.label}: ${err.message}`);
  }
}
process.exit(failed ? 1 : 0);
