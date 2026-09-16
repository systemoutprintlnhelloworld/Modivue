#!/usr/bin/env bash
# 从 lobe-icons（MIT；品牌商标归各自所有者）下载 README 用的工具图标
#   docs/media/icons/dark/*.png   深色主题用（浅色图形）
#   docs/media/icons/light/*.png  浅色主题用（深色图形）
# 图标名以 https://lobehub.com/icons 为准；下载失败的会列出来，去该站搜索后改右侧名称。
set -u
BASE="https://unpkg.com/@lobehub/icons-static-png@latest"
ICONS=(   # 本地名=lobe-icons 名
  "claudecode=claudecode-color" "codex=codex-color" "gemini=gemini-color"
  "qwen=qwen-color" "opencode=opencode" "claude=claude-color" "openai=openai"
  "openrouter=openrouter" "newapi=newapi-color"
)
fail=()
for theme in dark light; do
  mkdir -p "docs/media/icons/$theme"
  for pair in "${ICONS[@]}"; do
    n="${pair%%=*}"; r="${pair#*=}"
    out="docs/media/icons/$theme/$n.png"
    curl -fsSL "$BASE/$theme/$r.png" -o "$out" && echo "✓ $theme/$n" || { rm -f "$out"; fail+=("$theme/$n←$r"); }
  done
done
[ ${#fail[@]} -gt 0 ] && printf '✗ 需手动补充:\n  %s\n' "${fail[@]}"
exit 0
