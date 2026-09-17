# 本地代理与 API

桌面端端口由应用动态分配；浏览器开发模式默认使用 4173。

[返回 README](../README.md#开始使用) · [功能索引](features/README.md)

> [!NOTE]
> 下文示例中的 `http://127.0.0.1:4173` 是浏览器开发模式（`npm run dev`）的地址。桌面端使用动态端口。
> 桌面端地址可在设置中的「本地代理」查看。

## 让 Agent 经过代理

启动服务时显式配置上游：

```bash
MODIVUE_OPENAI_UPSTREAM=https://api.openai.com \
MODIVUE_ANTHROPIC_UPSTREAM=https://api.anthropic.com \
npm run dev
```

然后把 coding agent 的 Base URL 分别指向：

```text
OpenAI 协议     http://127.0.0.1:4173/proxy/openai/v1
Anthropic 协议  http://127.0.0.1:4173/proxy/anthropic/v1
```

每次流式调用都会写入平台数据目录中的 SQLite。数据库只保存 Key 的不可逆短指纹，不保存明文。

## 支持的协议

代理支持以下三种协议的流式响应，所有字段保留原始 JSON：

| 协议 | 缓存字段 |
|---|---|
| OpenAI Chat Completions | `usage.prompt_tokens_details.cached_tokens` |
| OpenAI Responses | `usage.input_tokens_details.cached_tokens` |
| Anthropic Messages | `usage.cache_read_input_tokens` |

TTFT 从请求发出开始计时，到首个有效文本或工具事件到达时结束。

## 多渠道路由

用 `MODIVUE_UPSTREAMS` 配置多个上游。协议下的键是路由 ID，必须匹配 `[A-Za-z0-9_-]+`；值是对应的 Base URL：

```bash
MODIVUE_UPSTREAMS='{"openai":{"team-a":"https://openai-a.example/v1"},"anthropic":{"team-b":"https://anthropic-b.example"}}' \
MODIVUE_OPENAI_UPSTREAM=https://api.openai.com \
npm run dev
```

| 路由 | 路径 |
|---|---|
| 默认路由 | `/proxy/openai/v1/...` |
| 命名路由 | `/proxy/openai/team-a/v1/...` |

Anthropic 的路径规则相同，查询参数原样转发。旧的两个环境变量继续作为 `default` 路由；与 JSON 中同名时，环境变量优先。

## 主动探测目标

服务会读取已配置且有独立 API Key 的 Claude Code / Codex 连接作为探测目标。探测目标也可通过 `MODIVUE_OPENAI_UPSTREAM`、`MODIVUE_PROBE_OPENAI_KEY`、`MODIVUE_PROBE_OPENAI_MODEL`（可选 `MODIVUE_PROBE_OPENAI_API`），以及对应的 `MODIVUE_ANTHROPIC_UPSTREAM`、`MODIVUE_PROBE_ANTHROPIC_KEY`、`MODIVUE_PROBE_ANTHROPIC_MODEL` 补充。

探测的频率和上限见 [费用与余额](features/cost.md#控制主动探测的花费)。

## 本地接口

| 接口 | 用途 |
|---|---|
| `GET /api/summary` | 聚合指标 |
| `GET /api/samples?model=模型名&baseUrl=渠道地址&keyGroup=密钥指纹` | 请求明细 |
| `GET /api/config` | 按协议分组的路由 ID 与规范化 Base URL |
| `GET /api/agents` | Agent 会话与适配能力 |
| `GET /api/agent-sessions?includeEnded=1` | 包含已结束会话的历史 |
| `POST /api/probe` | 手动触发一次探测，遵守每日上限 |
| `GET /api/quality/evaluators` | 已注册的评测器 |

## 模型目录

服务启动时从 [Models.dev catalog.json](https://models.dev/catalog.json) 同步模型目录，之后每 6 小时检查一次，保存 ETag、上游修改时间和本地同步时间。返回 `304` 时只刷新同步时间；下载或解析失败时保留上次成功的目录并标记为陈旧。网络不可用时界面标记"未同步"，保留原始模型名。


## CC Switch 与已打开的会话

默认代理每次请求重新读取对应的 CCS 当前渠道，并同时使用该条记录的地址与 Key。无效配置、歧义或递归路由会被拒绝，不回退到旧渠道。命名路由和内部核验保留指定目标。

这不等于自动接管 Agent。CCS 将 Base URL 写成远程地址时，请求可以绕过 Modivue；已经加载的 Codex app-server 会话还可能保留旧连接。界面读取到新配置，不能证明该会话的请求已经切换。重启 Modivue 也不能更新另一个进程的连接。

要让后续 CCS 切换生效，必须先让 Agent 始终连接 Modivue 默认代理，CCS 中继续保存真实上游。迁移现有会话前应确认活动状态与连接它的客户端，不应为单个会话停止整个共享 app-server。本版本没有自动改写 Agent 配置；桌面端重启后本机端口也可能改变。

## 核对实际转发

在日志中清除旧渠道筛选，等待下一次普通请求结束。展开记录，确认 `measurement.source` 等于 `observation`；此时 `base_url` 和 `key_group` 才是实际出站请求的地址与 Key 分组。`probe` 和 `codex-rollout` 不是普通代理转发证据。`/api/config` 显示的是配置，不是请求轨迹。

`GET /api/samples` 可查询相同记录。日志为空可能是尚未请求、请求未结束、直连绕过，或路由选择阶段被拒绝，不能仅凭空日志判断原因。
