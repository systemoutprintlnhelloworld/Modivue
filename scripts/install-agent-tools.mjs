import { spawnSync } from "node:child_process";
import { accessSync, constants, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const tooling = join(root, "agent-tools");

if (process.argv.includes("--help")) {
  console.log("从普通终端运行: node scripts/install-agent-tools.mjs");
  console.log("安装项目依赖、初始化 Trellis、注册项目 skills 和两个 Codex MCP，安装 Stop That Shit 插件。");
  console.log("密钥保存在 .local/agent-tools.secrets.json。Hook 信任由用户在 Codex /hooks 中完成。");
  process.exit(0);
}

process.chdir(root);
const env = { ...process.env, npm_config_cache: join(root, ".local/npm-cache") };
const run = (command, args) => {
  console.log(`执行: ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { cwd: root, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

JSON.parse(readFileSync(join(root, ".local/agent-tools.secrets.json"), "utf8"));
accessSync("/opt/homebrew/bin/寸止", constants.X_OK);
run("python3", ["--version"]);
run("npm", ["install", "--prefix", tooling, "--save-exact", "--no-audit", "--no-fund", "--fetch-retries=0", "--fetch-timeout=30000"]);
run(process.execPath, [join(root, "scripts/sync-fast-context-key.mjs")]);

// 从记录的来源取得原文件；本地可读快照不作为包下载成功的证据。
const sources = JSON.parse(readFileSync(join(tooling, "skill-sources.json"), "utf8"));
for (const source of sources) {
  const response = await fetch(source.url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${source.path}: HTTP ${response.status}`);
  const content = await response.text();
  const destination = join(tooling, source.path);
  mkdirSync(resolve(destination, ".."), { recursive: true });
  writeFileSync(destination, content);
  console.log(`已下载: ${source.path}`);
}

run(join(tooling, "node_modules/.bin/trellis"), ["init", "--codex", "-u", "popbomb", "-y", "--skip-existing"]);
const projectSpec = join(root, ".trellis/spec/modivue.md");
if (!existsSync(projectSpec)) {
  mkdirSync(resolve(projectSpec, ".."), { recursive: true });
  copyFileSync(join(tooling, "trellis-project.md"), projectSpec);
}

const skillRoot = join(root, ".agents/skills");
mkdirSync(skillRoot, { recursive: true });
for (const entry of readdirSync(join(tooling, "skills"), { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === "stop-that-shit") continue;
  const source = join(tooling, "skills", entry.name);
  const target = join(skillRoot, entry.name);
  if (existsSync(target)) {
    if (lstatSync(target).isSymbolicLink() && resolve(skillRoot, readlinkSync(target)) === source) continue;
    throw new Error(`${target} 已存在，请先检查该技能的来源。`);
  }
  symlinkSync(relative(skillRoot, source), target, "dir");
  console.log(`已注册技能: ${entry.name}`);
}

run(process.execPath, [join(root, "scripts/configure-mcp.mjs")]);
run("codex", ["plugin", "marketplace", "add", "lennney/stop-that-shit", "--ref", "0.2.0"]);
run("codex", ["plugin", "add", "stop-that-shit@stop-that-shit"]);
run(process.execPath, [join(root, "scripts/agent-tool.mjs"), "smart-search", "--version"]);

console.log("安装命令已完成。新建 Codex 会话加载 skills 和 MCP。");
console.log("在 Codex CLI 输入 /hooks，检查并信任 Stop That Shit 的 UserPromptSubmit 和 PreToolUse 命令。");
console.log("在线检索尚需验证，可运行 node scripts/agent-tool.mjs smart-search doctor --format json。");
