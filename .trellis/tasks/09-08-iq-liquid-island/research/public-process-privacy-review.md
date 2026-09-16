# Research: 发布前开发过程文件隐私审查

- Query: 哪些开发过程文件可同步到公开 GitHub，哪些应排除或先脱敏？
- Scope: internal；只读审查 .trellis、.agents、.codex、.spec-workflow、agent-tools。只写本研究目录，无 Git 操作。
- Date: 2026-09-17

## Findings

### 可直接纳入的候选

下列清单未发现已知密钥形态、真实凭据赋值或私人 provider URL。它是基于当前文件的候选，不是对后续并发变更的保证。公开来源包括 GitHub、linux.do 方法链接、工具官方文档及示例域名，不应当作私人渠道误删。

- `.agents/skills/` 的八个技能链接均为有效相对链接，指向仓库 `agent-tools/skills/`，没有绝对路径链接。
- `.codex/hooks.json` 的 command 使用仓库相对路径；可纳入。
- `.codex/hooks/session-start.py:48,68,75,82` 的 `/Users/` 命中属于 Windows 路径归一化例子，不包含本机用户名，不必删除。
- `.spec-workflow/` 当前只有 templates 与 user-templates 中的 11 个文件，其 approvals/archive/specs/steering 当前没有文件。
- 发现 `.trellis` 后端 logging/quality 规范仍是模板，属于质量事实，不是隐私阻塞。

### 当前必须排除

| 路径 | 原因 |
| --- | --- |
| `.trellis/.developer` | 本机开发者身份状态，不属于公开项目规范 |
| `.trellis/.runtime/` | 会话/活动任务运行态，未读取内容 |
| `.trellis/workspace/` | 用户会话索引与日志；`popbomb/journal-1.md:16` 有实际后台 PID、端口、运行配置，其他行有运行用例 ID |
| `.codex/config.toml` | 用户明确指定不读；宿主个人配置，不能整体上传 |
| `agent-tools/config.json` | 个人工具配置，未读取 |
| `agent-tools/benchmark/` | 原始数据可能含真实请求与渠道，未读取 |
| `agent-tools/node_modules/` | 安装产物，不属于源码 |
| `.local/` 与任何实际凭据文件 | 不在审查范围，不应上传 |

### 先脱敏或保留本地的精确文件

| 文件 | 证据与处理 |
| --- | --- |
| `agent-tools/codex-mcp.toml` | 第 5、13、20 行含机主绝对路径，第 19–20 行绑定 Homebrew 版本及 npm 缓存路径；建议保留本地，公开可移植示例另行处理 |
| `agent-tools/README.md` | 第 72 行含本机项目绝对路径；改为 PROJECT_DIR 示例后可纳入，其余审查未见凭据 |
| `agent-tools/WORKFLOW.md` | 第 67、106 行含本机项目绝对路径；同上 |
| `.trellis/tasks/09-08-iq-liquid-island/implement.md` | 第 46–47 行等有真实 PID/端口及用例产物 ID；保留修复结论、验证类型/结果，去除实际进程和本机运行定位细节后再公开 |
| `.trellis/tasks/09-08-iq-liquid-island/task.json` | `notes` 与 `meta` 中大量真实 UI run ID、会话名、执行会话 ID、用户本地状态；只保留任务定义与公开 release/commit 引用，或暂不纳入 |

无需把已公开 GitHub Actions run ID、公开提交 SHA 当秘密；它们和本机运行 ID 不同。构建结果数字不是凭据。上表对本地进程等数据使用保守公开边界。

### 已审候选精确路径清单

```text
.agents/skills/caveman
.agents/skills/domain-modeling
.agents/skills/engineering-principles
.agents/skills/grill-with-docs
.agents/skills/grilling
.agents/skills/ponytail
.agents/skills/smart-search-cli
.agents/skills/trellis-before-dev/SKILL.md
.agents/skills/trellis-brainstorm/SKILL.md
.agents/skills/trellis-break-loop/SKILL.md
.agents/skills/trellis-channel/SKILL.md
.agents/skills/trellis-channel/references/command-reference.md
.agents/skills/trellis-channel/references/forum.md
.agents/skills/trellis-channel/references/progress-debugging.md
.agents/skills/trellis-channel/references/workers.md
.agents/skills/trellis-channel/references/workflows.md
.agents/skills/trellis-check/SKILL.md
.agents/skills/trellis-continue/SKILL.md
.agents/skills/trellis-finish-work/SKILL.md
.agents/skills/trellis-meta/SKILL.md
.agents/skills/trellis-meta/references/customize-local/add-project-local-conventions.md
.agents/skills/trellis-meta/references/customize-local/change-agents.md
.agents/skills/trellis-meta/references/customize-local/change-context-loading.md
.agents/skills/trellis-meta/references/customize-local/change-hooks.md
.agents/skills/trellis-meta/references/customize-local/change-skills-or-commands.md
.agents/skills/trellis-meta/references/customize-local/change-spec-structure.md
.agents/skills/trellis-meta/references/customize-local/change-task-lifecycle.md
.agents/skills/trellis-meta/references/customize-local/change-workflow.md
.agents/skills/trellis-meta/references/customize-local/overview.md
.agents/skills/trellis-meta/references/local-architecture/bundled-skills.md
.agents/skills/trellis-meta/references/local-architecture/context-injection.md
.agents/skills/trellis-meta/references/local-architecture/generated-files.md
.agents/skills/trellis-meta/references/local-architecture/multi-agent-channel.md
.agents/skills/trellis-meta/references/local-architecture/overview.md
.agents/skills/trellis-meta/references/local-architecture/spec-system.md
.agents/skills/trellis-meta/references/local-architecture/task-system.md
.agents/skills/trellis-meta/references/local-architecture/workflow.md
.agents/skills/trellis-meta/references/local-architecture/workspace-memory.md
.agents/skills/trellis-meta/references/platform-files/agents.md
.agents/skills/trellis-meta/references/platform-files/hooks-and-settings.md
.agents/skills/trellis-meta/references/platform-files/overview.md
.agents/skills/trellis-meta/references/platform-files/platform-map.md
.agents/skills/trellis-meta/references/platform-files/skills-and-commands.md
.agents/skills/trellis-session-insight/SKILL.md
.agents/skills/trellis-session-insight/references/cli-quick-reference.md
.agents/skills/trellis-session-insight/references/triggering-patterns.md
.agents/skills/trellis-spec-bootstrap/SKILL.md
.agents/skills/trellis-spec-bootstrap/references/mcp-setup.md
.agents/skills/trellis-spec-bootstrap/references/repository-analysis.md
.agents/skills/trellis-spec-bootstrap/references/spec-task-planning.md
.agents/skills/trellis-spec-bootstrap/references/spec-writing.md
.agents/skills/trellis-start/SKILL.md
.agents/skills/trellis-update-spec/SKILL.md
.agents/skills/unslop
.codex/agents/trellis-check.toml
.codex/agents/trellis-implement.toml
.codex/agents/trellis-research.toml
.codex/hooks.json
.codex/hooks/inject-subagent-context.py
.codex/hooks/inject-workflow-state.py
.codex/hooks/session-start.py
.spec-workflow/templates/design-template.md
.spec-workflow/templates/product-template.md
.spec-workflow/templates/requirements-template.md
.spec-workflow/templates/structure-template.md
.spec-workflow/templates/tasks-template.md
.spec-workflow/templates/tech-template.md
.spec-workflow/user-templates/README.md
.spec-workflow/user-templates/design-template.md
.spec-workflow/user-templates/structure-template.md
.spec-workflow/user-templates/tasks-template.md
.spec-workflow/user-templates/tech-template.md
.trellis/.gitignore
.trellis/.template-hashes.json
.trellis/.version
.trellis/agents/check.md
.trellis/agents/implement.md
.trellis/config.yaml
.trellis/scripts/__init__.py
.trellis/scripts/add_session.py
.trellis/scripts/common/__init__.py
.trellis/scripts/common/active_task.py
.trellis/scripts/common/cli_adapter.py
.trellis/scripts/common/config.py
.trellis/scripts/common/developer.py
.trellis/scripts/common/git.py
.trellis/scripts/common/git_context.py
.trellis/scripts/common/io.py
.trellis/scripts/common/log.py
.trellis/scripts/common/packages_context.py
.trellis/scripts/common/paths.py
.trellis/scripts/common/safe_commit.py
.trellis/scripts/common/session_context.py
.trellis/scripts/common/task_context.py
.trellis/scripts/common/task_queue.py
.trellis/scripts/common/task_store.py
.trellis/scripts/common/task_utils.py
.trellis/scripts/common/tasks.py
.trellis/scripts/common/trellis_config.py
.trellis/scripts/common/types.py
.trellis/scripts/common/workflow_phase.py
.trellis/scripts/get_context.py
.trellis/scripts/get_developer.py
.trellis/scripts/hooks/linear_sync.py
.trellis/scripts/init_developer.py
.trellis/scripts/task.py
.trellis/spec/backend/database-guidelines.md
.trellis/spec/backend/directory-structure.md
.trellis/spec/backend/error-handling.md
.trellis/spec/backend/index.md
.trellis/spec/backend/logging-guidelines.md
.trellis/spec/backend/monitoring-contracts.md
.trellis/spec/backend/quality-guidelines.md
.trellis/spec/frontend/component-guidelines.md
.trellis/spec/frontend/directory-structure.md
.trellis/spec/frontend/hook-guidelines.md
.trellis/spec/frontend/index.md
.trellis/spec/frontend/quality-guidelines.md
.trellis/spec/frontend/state-management.md
.trellis/spec/frontend/type-safety.md
.trellis/spec/guides/code-reuse-thinking-guide.md
.trellis/spec/guides/cross-layer-thinking-guide.md
.trellis/spec/guides/index.md
.trellis/spec/modivue.md
.trellis/tasks/00-bootstrap-guidelines/prd.md
.trellis/tasks/00-bootstrap-guidelines/task.json
.trellis/tasks/09-07-monitoring/design.md
.trellis/tasks/09-07-monitoring/implement.md
.trellis/tasks/09-07-monitoring/prd.md
.trellis/tasks/09-07-monitoring/requirements.md
.trellis/tasks/09-07-monitoring/task.json
.trellis/tasks/09-08-iq-liquid-island/prd.md
.trellis/tasks/09-08-iq-liquid-island/research/ccs-route-observation.md
.trellis/workflow.md
agent-tools/package-lock.json
agent-tools/package.json
agent-tools/skill-sources.json
agent-tools/skills/caveman/SKILL.md
agent-tools/skills/domain-modeling/ADR-FORMAT.md
agent-tools/skills/domain-modeling/CONTEXT-FORMAT.md
agent-tools/skills/domain-modeling/SKILL.md
agent-tools/skills/engineering-principles/SKILL.md
agent-tools/skills/grill-with-docs/SKILL.md
agent-tools/skills/grilling/SKILL.md
agent-tools/skills/ponytail/SKILL.md
agent-tools/skills/smart-search-cli/SKILL.md
agent-tools/skills/stop-that-shit/SKILL.md
agent-tools/skills/unslop/SKILL.md
agent-tools/trellis-project.md
```

## Related specs

- `AGENTS.md`：不得发送凭据；公开非私有过程文档，保留现有改动。
- `.trellis/workflow.md:36-96`：任务与 workspace 日志分工、`.runtime/sessions/` 为运行态。
- `.trellis/spec/backend/logging-guidelines.md` 与 `quality-guidelines.md`：当前模板，未提供额外脱敏规范。

## External references

无外部查询。本审查以本地文件为证据。

## Caveats / Not Found

- 未读取真实 config、secrets、benchmark 或数据库。
- 未执行 Git 命令，因此不判定哪些候选已 tracked；由主会话与实际暂存清单交叉核对。
- `implement.jsonl`、`check.jsonl` 不在公开候选清单，研究角色不加载其上下文。主会话须自行检查后决定。
- 仅进行一次有界路径、URL host、已知 token/authorization/credential assignment 与本机路径扫描。无命中不等于数学证明无秘密；图片、归档、源码和建议文件夹由主会话负责。
- 只输出路径/行号/类别，没有输出疑似 credential 值。本研究文件本身不含所发现的实际 PID、端口或运行 ID，适合公开。
