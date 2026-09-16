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

TTFT 只从首个有效文本或工具事件开始计时。

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

服务会读取已配置且有独立 API Key 的 Claude Code / Codex 连接作为探测目标。探测目标也可通过 `MODIVUE_PROBE_OPENAI_BASE_URL`、`MODIVUE_PROBE_OPENAI_API_KEY`、`MODIVUE_PROBE_ANTHROPIC_BASE_URL` 和 `MODIVUE_PROBE_ANTHROPIC_API_KEY` 补充。

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
