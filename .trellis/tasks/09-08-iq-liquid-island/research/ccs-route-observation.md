# Research: CCS 切换后的实际转发观测

- Query: 用户如何确认 CC Switch 切换后下一次请求使用新的 URL 和 Key？
- Scope: internal，源码只读；不读取真实配置、凭据或请求数据。
- Date: 2026-09-17

## Findings

1. GUI 入口是详细窗口左侧「日志」，标题「采集日志」。清除顶部模型、渠道、Key、档位筛选，避免新渠道被旧筛选排除。每行显示请求时间、模型、渠道 host/path、Key 分组、状态；展开可见 Agent、错误、measurement/rawUsage。日志可按渠道、Key 分组和 Agent 搜索。依据：`index.html:27`，`app.js:2213-2229`。隐藏了日志时可在设置「导航标签页」重新勾选，见 `app.js:2277`。页面可见时约 15 秒刷新，见 `app.js:3393-3397`。

2. 判断实际转发必须检查原始 JSON 的 `measurement.source === "observation"`。`codex-rollout` 是读 Agent 的 usage 记录，`probe` 是 Modivue 自己的探测，均不能用于证明普通请求经过动态代理。`GET /api/samples?hours=1&limit=100` 返回 `{samples:[...]}`，字段是 `timestamp`、`agent`、`base_url`、`key_group`、`status`、`measurement.source`。`source=observation` 查询本身只排除 probe，并不排除 rollout，仍须客户端严格检查 source。依据：`src/core/storage.mjs:130-179`、`server.mjs:74-90`。

3. 真正代理样本的 `base_url` 来自当前选定的上游，`key_group` 来自替换鉴权后的实际出站请求头，不是旧入站 Key。分组为 Key 的 SHA-256 前 12 个十六进制字符，未保存明文 Key。切换前后的新样本可比较 URL/分组；只换 URL 时分组可以不变，只换 Key 时 URL 可以不变。依据：`server.mjs:350-375`、`src/core/proxy.mjs:120-126,253-258`、`src/core/identity.mjs:4-11`。时间是请求开始时间，记录在请求结束或出错后落库。

4. 无须新增调试接口。设置「本地代理」可找到本机端口，桌面端不固定为 4173，见 `app.js:2237-2242`、`desktop/ModivueApp.swift:249-263`。可用以下只读命令，PORT 换为本机端口。该命令只查本机记录，不触发模型请求，不输出原始 Key。

```bash
curl --fail --silent --show-error 'http://127.0.0.1:PORT/api/samples?hours=1&limit=100' |
node --input-type=module -e 'let text="";for await(const chunk of process.stdin)text+=chunk;const {samples}=JSON.parse(text);console.table(samples.filter(s=>s.measurement?.source==="observation").map(s=>({time:s.timestamp,agent:s.agent,url:s.base_url,keyGroup:s.key_group,status:s.status})));'
```

CLI `node cli/modivue.mjs watch --interval 5` 会显示聚合模型的 endpoint、key、samples，默认读取桌面共享数据库，但不是逐次转发证据；没有 `logs` 或 `samples` 子命令。`agents --json` 反映检测到的配置/会话；`/api/config` 反映静态上游，也不能代替实际样本。依据：`cli/modivue.mjs:19-56`、`server.mjs:339-343`。

5. 当前不足：没有「刚切换渠道」专门提示，也没有持久化路由选择来源 CCS/Agent/static 或切换前后对照。路由解析阶段的 503 在 `proxyStream` 前返回，没有采集样本；已开始转发的网络错误会保存 error 样本。macOS 桌面子进程 stdout/stderr 被丢弃，不能建议 tail 一个不存在的服务日志。依据：`server.mjs:367-370`、`src/core/proxy.mjs:229-258`、`desktop/ModivueApp.swift:266-267`。已有数据足以确认成功进入代理的完成请求使用了哪个 URL/Key 分组，但不能凭空白日志区分「尚未请求」「仍在流式返回」「直连绕过」和「路由解析拒绝」。

## Related specs

- `.trellis/spec/backend/monitoring-contracts.md:8-17`：每请求动态选择 CCS、实际出站 Key 归因、不自动改写 Agent 配置。
- `docs/proxy.md:35-66`：动态路由条件与代理覆盖边界。

## External references

无外部检索。本次结论以当前源码为准。

## Caveats / Not Found

- 未执行真实 provider 请求、未读取用户真实配置、未做桌面运行验收。
- 没有 dedicated CCS-current-config API；不要将 `/api/agents` 的配置观测误说为已转发。
- task `design.md` 不存在。未读取 implement/check JSONL，遵守 researcher 角色隔离。
- 说明文档按 unslop 规则保留具体字段、入口和边界。
