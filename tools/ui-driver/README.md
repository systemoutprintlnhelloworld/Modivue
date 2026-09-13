# macOS 宿主验证

Swift 驱动使用系统 AXUIElement 和 CGEvent。通过 Herdr 普通 shell pane 运行：

```sh
npm run runtime:test
npm run ui:test:web
npm run ui:inspect
npm run ui:test:hover
npm run ui:test:drag
npm run ui:test:menu
npm run ui:test
```

`scripts/host-test.mjs` 只接受固定任务，在当前 Herdr workspace 使用本项目 `ui-runner` 或 `runtime` pane。没有对应 pane 时创建独立测试 tab。开始前取得独占提交锁并检查前台进程是 shell，每个 pane 一次只运行一个任务。若提交进程被强制结束，先核实对应 pane 已空闲，再清理 `.ui-artifacts/<pane标签>.lock`；不要在宿主任务运行时清理锁。

结果保存在 `.ui-artifacts/<时间戳>-<任务>/`。`result.json` 才是完成依据；命令回显和 `pane run` 返回不代表通过。PASS、FAIL、UNTESTED 分别退出 0、1、77。超时后读取 pane 和任务目录，不重复提交运行中的任务。

| 任务 | 验证内容 |
| --- | --- |
| runtime | 动态端口、受控 Responses SSE、真实代理、SQLite、聚合 API；独立测试数据库 |
| web | 系统 Chrome 验证数值、设置保存、三条悬停指标、JS 异常和截图；不调用付费模型 |
| inspect | 构建启动原生应用，发现其子进程端口，保存窗口、AX、截图及只读 API 响应 |
| hover | 关闭测试实例详情，移动自己的浮窗到独立位置，检查三项指标、10 次悬停/离开循环，再点击打开详情 |
| drag | 比较详情标题栏、详情内容区和灵动岛顶部拖动前后的真实窗口坐标 |
| menu | 右键实际菜单栏图标，查找可见退出项，点击并确认进程结束 |
| ui | 顺序运行原生 hover、drag、menu；只关闭测试自己启动的实例 |

macOS 要求的辅助功能、屏幕录制或截图访问授权由用户完成，不自动批准系统弹窗或修改 TCC。图标被菜单栏管理器隐藏、出现权限弹窗或其他实例遮挡时，不能把截图当作产品验收证据。截图需实际视觉审阅，文件存在不代表合格。

本机使用 Ice 时，菜单测试通过其可访问的扩展栏展开 Modivue 图标，测试完成后恢复折叠状态；不会修改 Ice 配置。其他隐藏方式未适配时返回 UNTESTED。

原生测试读取本机真实 Agent 配置和观测历史，不生成生产样本。测试实例通过 `MODIVUE_UI_ARTIFACTS` 暂停周期探测，不修改用户设置。`runtime` 和 `web` 使用独立数据库及受控上游，示例 60% 缓存率不属于提供方测量。测试实例记录 WebKit 实际布局用于鼠标定位，鼠标事件仍由 CGEvent 发出；锁屏时返回 UNTESTED。

独立驱动用法：

```sh
swiftc tools/ui-driver/main.swift -o dist/ui-driver -framework AppKit -framework ApplicationServices
dist/ui-driver permissions
dist/ui-driver launch /绝对路径/Modivue.app
dist/ui-driver windows <pid>
dist/ui-driver elements <pid>
dist/ui-driver move <x> <y>
dist/ui-driver click <x> <y>
dist/ui-driver right-click <x> <y>
dist/ui-driver drag <x1> <y1> <x2> <y2>
dist/ui-driver screenshot /绝对路径/capture.png
```

坐标采用 macOS 全局左上原点的显示点坐标。AX path 来自当次 elements 输出；界面改变后重新查询，再执行 press/menu/raise/position。

参考：[Herdr CLI](https://herdr.dev/docs/cli-reference/)、[OpenAI Computer Use](https://developers.openai.com/codex/app/computer-use)。长期 XCUITest suite 尚未建立；当前直接通过真实 AppKit 窗口和 AX/CGEvent 验证。
