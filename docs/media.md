# 素材清单

<!-- 本页供维护者替换 README 与功能文档中的图片使用 -->

所有截图和录屏都使用**演示数据**，发布前逐项检查：

- 不出现真实渠道域名、供应商名称、Key 指纹和真实余额；
- 没有截图工具水印；
- 没有文字选中高亮，不是滚动拼接的长图；
- 同一组图片尺寸一致。

## README

| 位置 | 文件 | 规格 | 内容 |
|---|---|---|---|
| 顶部横幅 | `docs/assets/video.gif` | 2:1，无缝循环 | 品牌动图 |
| 横幅静态图（可选） | `docs/assets/hero-banner.png` | 1280×640 | 横幅首帧，用作 Social preview 和减少动效时的替代图 |
| 主演示 | `docs/assets/main-demo.gif` | 宽 1200 左右 | 极简态 → 移入展开 → 悬停单环详情 → 移开收回 |
| 交互总览 | `docs/assets/interaction-overview.jpg` | 16:9 | 各状态总览；需把 "IQ" 改为"模型核验"并补上余额环 |

## 功能宫格缩略图（16:9）

| 文件 | 内容 | 对应文档 |
|---|---|---|
| `docs/assets/features/overview.png` | 概览页：筛选栏、活跃模型、趋势图 | [overview.md](features/overview.md) |
| `docs/assets/features/island.png` | 灵动岛专注态与详情卡片 | [island.md](features/island.md) |
| `docs/assets/features/agents.png` | Agent 列表：已打开 / 待命 | [agents.md](features/agents.md) |
| `docs/assets/features/verification.png` | 核验方法选择或核验报告 | [verification.md](features/verification.md) |
| `docs/assets/features/cost.png` | 核验费用与供应商余额 | [cost.md](features/cost.md) |
| `docs/assets/features/calibration.png` | 可信 API 对照或校准档案导入 | [calibration.md](features/calibration.md) |
| `docs/assets/features/settings.png` | 设置页（检测或通知分类） | [settings.md](features/settings.md) |
| `docs/assets/features/layout.png` | 拖动区块的录屏（GIF） | [overview.md#布局](features/overview.md#布局) |
| `docs/assets/features/cli.png` | 终端中 `status` / `watch` 的输出 | [cli.md](features/cli.md) |

替换为 PNG 或 GIF 后，同步修改 README 中的文件扩展名。

## 功能文档内的截图

功能文档中的截图直接引用 `docs/assets/features/`；后续替换同名文件即可。
