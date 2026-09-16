# 本地代理与 Agent 接入

桌面应用会自动选择一个可用的本机端口。下文的 `4173` 是 `npm run dev` 的默认端口，不是桌面端固定端口。不要在未启动开发服务时直接把 Agent 指向它。CLI 默认读取共享数据库，无需查找端口。

## 启动代理

在项目根目录安装依赖后，显式配置上游：

```bash
MODIVUE_OPENAI_UPSTREAM=https://api.openai.com \
MODIVUE_ANTHROPIC_UPSTREAM=https://api.anthropic.com \
npm run dev
```

按协议配置 Agent 的 Base URL，保留对应上游的凭据：

| 协议 | 开发服务地址 |
| --- | --- |
| OpenAI Chat Completions / Responses | `http://127.0.0.1:4173/proxy/openai/v1` |
| Anthropic Messages | `http://127.0.0.1:4173/proxy/anthropic/v1` |

服务只监听 `127.0.0.1`。`MODIVUE_PORT` 可指定开发端口，改动后同步更新 Agent 的 Base URL。代理会将请求和鉴权信息发送给配置的上游。

## 多渠道路由

`MODIVUE_UPSTREAMS` 按协议声明命名路由。路由 ID 必须匹配 `[A-Za-z0-9_-]+`。

```bash
MODIVUE_UPSTREAMS='{"openai":{"team-a":"https://openai-a.example/v1"},"anthropic":{"team-b":"https://anthropic-b.example"}}' \
MODIVUE_OPENAI_UPSTREAM=https://api.openai.com \
npm run dev
```

默认路由使用 `/proxy/openai/v1/...`，命名路由使用 `/proxy/openai/team-a/v1/...`；Anthropic 规则相同。查询参数会转发。两个单独的上游环境变量声明 `default` 路由，并优先于 JSON 中同名路由。

Agent 指向本机代理时，探测器会解析固定路由的真实上游，并保留 `proxyBaseUrl`。这不等于自动接管 Agent 配置；Modivue 不会替用户改写 Base URL。

默认路径 `/proxy/openai/v1/...` 和 `/proxy/anthropic/v1/...` 支持按 Agent 当前配置转发：

- 请求携带 `x-modivue-agent: codex`、`x-modivue-agent: claude-code` 或已登记的 Agent ID 时，只选该 Agent 的配置。CC Switch 存在该 Agent 的当前渠道时，从这一条记录同时读取地址和 Key；否则使用 Agent 配置。
- 没有 Agent 标识时，先按请求 Key 匹配 Agent 身份；再查 CC Switch 的对应当前渠道。没有身份时，同协议下唯一的 CCS 当前渠道也可选中，因此持有旧 Key 的普通 Codex 请求可以跟随切换，不必加请求头。
- 有候选渠道但存在歧义、无效地址或自循环时返回 `503`。CCS 当前记录即使 JSON/TOML 无法解析、缺少地址或 Key，仍算动态候选并拒绝转发，不使用旧 Agent 配置替代；余额列表跳过这些不可查询的记录。完全没有动态候选时，才使用显式固定上游和请求凭据。内部 `modivue-probe` 请求保留指定的检测路由，不能自动转到另一个核验目标。
- Agent 配置缺失、格式错误、缺少 Key、匹配不唯一，或配置仍指向 Modivue 代理时，动态转发返回 `503`，不回退到旧上游。命名路由仍以 `MODIVUE_UPSTREAMS` 为准。

CC Switch 切换当前渠道后，经过 Modivue 默认代理的下一次请求会按上述规则读取新地址和 Key，无需重启 Modivue。CCS 渠道按所属 Agent 和协议隔离；Gemini 不参与 OpenAI 路由。Codex 的自定义 provider 可通过 `requires_openai_auth = true` 使用 `auth.json` 中的 `OPENAI_API_KEY`；订阅 OAuth 不在该转发支持范围。

> [!IMPORTANT]
> 请求必须实际经过 Modivue 才能被转发和采样。若 CC Switch 把 Agent Base URL 改成真实上游，Agent 可能绕过 Modivue；程序不会改写 CC Switch 的文件。要持续采样，请让 Agent 的请求仍指向 Modivue 默认代理地址。多个当前配置无法唯一确定时不会猜测渠道。

### Codex 启动示例

让 CC Switch 继续维护磁盘上的真实 provider 地址和 Key，只在本次 Codex 启动时覆盖代理地址及标识：

```bash
codex \
  -c 'model_providers.PROVIDER_ID.base_url="http://127.0.0.1:4173/proxy/openai/v1"' \
  -c 'model_providers.PROVIDER_ID.http_headers={"x-modivue-agent"="codex"}'
```

将 `PROVIDER_ID` 替换为当前 `config.toml` 中 `model_provider` 的值，将 `4173` 替换为正在运行的 Modivue 端口。不要把覆盖项写回 CC Switch 管理的配置文件。Modivue 与 Codex 需读取同一个 `CODEX_HOME`；项目配置也必须相同。默认桌面服务不知道每次 CLI 的工作目录，项目级 provider 覆盖不能通过这条全局 Agent 标识自动区分。

此方式下，后续请求读取磁盘中的最新 provider 地址和 Key。若 CC Switch 同时改变 provider ID，重新启动 Codex 时须用新的 ID 设置覆盖项。它不会热更新 Codex 已加载的模型或协议等其他设置。

## 指标与查询

TTFT 记录请求发出到首个有效输出内容到达的耗时。空 SSE 事件、思考片段、首个 HTTP 字节和请求总耗时不能代替它。有效文本或工具输出由对应协议解析。

| 协议 | 缓存读取字段 |
| --- | --- |
| Chat Completions | `usage.prompt_tokens_details.cached_tokens` |
| Responses | `usage.input_tokens_details.cached_tokens` |
| Anthropic Messages | `usage.cache_read_input_tokens` |

缺失字段保留为缺失，不能据耗时推断命中。原始 usage、单位与采样条件保存在本机，按模型、渠道、Key 分组、推理档位查询。

| 接口 | 用途 |
| --- | --- |
| `GET /api/config` | 路由 ID 与规范化 Base URL，不返回 Key |
| `GET /api/summary` | 聚合指标 |
| `GET /api/samples` | 逐次请求；可传 `model`、`baseUrl`、`keyGroup`、`reasoningEffort` |
| `GET /api/agents` | 当前会话与适配能力 |
| `GET /api/agent-sessions?includeEnded=1` | 含已结束会话的历史 |
| `GET /api/quality/evaluators` | 已注册核验方法 |

## 核对切换后的实际转发

在详细窗口的「日志」清除旧模型、渠道和 Key 筛选。切换 CC Switch 后，等下一次普通 Agent 请求结束，再比较新记录的时间、渠道和 Key 分组。页面约每 15 秒刷新。

展开记录，确认 `measurement.source` 为 `observation`。此时渠道是实际选中的出站地址，Key 分组是实际出站 Key 的短指纹。只换地址时分组可以不变，只换 Key 时地址可以不变。`codex-rollout` 是本地历史采集，`probe` 是主动探测，都不能证明这次普通 Agent 请求经过代理。

查询 `GET /api/samples?hours=1&limit=100` 也可读取 `timestamp`、`base_url`、`key_group`、`status` 和 `measurement.source`。`source=observation` 查询条件仍可能包含 rollout，需按返回行的 `measurement.source` 严格区分。端口从设置「本地代理」查看，不要假定桌面应用使用 4173。

目前没有独立的渠道切换通知。路由选择阶段返回的 503 不会进入采集日志；日志为空也可能是尚未请求、请求尚未结束或 Agent 直连绕过。`/api/config` 的固定上游配置不能作为实际转发证据。

## 会话识别

Codex 使用本机进程、状态库与 thread writer lock 等证据识别会话和工作状态。Claude Code 可通过 [statusline / hooks](../cli/STATUSLINE-SNIPPET.md) 提供会话心跳、模型与缓存信息。Herdr 是可选的补充证据来源，Modivue 的基本发现不要求 Herdr 运行。

配置存在、进程存在和已获得有效指标是三件事。适配登记不等于每个工具都完成实机验证，当前范围见 [路线图](../ROADMAP.md)。

## 命令行

```bash
node cli/modivue.mjs status
node cli/modivue.mjs watch --interval 5
node cli/modivue.mjs agents --json
node cli/modivue.mjs reports --model MODEL --hours 24 --json
```

通过 `--model`、`--base-url`、`--key-group`、`--reasoning-effort` 筛选目标；`--url http://127.0.0.1:4173` 显式连接开发服务。命令工具的查询不会触发付费检测。

Codex 的内置状态栏不能直接运行外部命令，可用以上 CLI 查询。Claude Code 的状态栏接入见专用说明，不需要替换已有脚本的其他功能。

## 主动采样与费用

主动探测默认开启，仅在目标符合调度条件且凭据可用时请求上游。可在设置中关闭，并配置轮次间隔、请求间隔、每日请求上限和输出 token 上限。每次实际请求都可能消耗提供方额度；手动核验也受预算约束。

本地核验轮次间隔支持 1–1440 分钟。工作中请求间隔是同一轮内部的串行让行时间，不代替轮次间隔。单问题每轮只有一次请求；设置为 5 分钟时，自动下一轮遵守完成后的轮次间隔。远程 BazaarLink 持续计划有独立设置。

请求记录使用 Key 分组指纹归因。保存可信供应商时，Key 会写入本机 `trusted-providers.json`，供后续使用；这不是加密密钥库。不要公开该文件或完整数据目录。
