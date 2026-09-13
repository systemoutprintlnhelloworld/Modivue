import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const launcher = fileURLToPath(new URL("./agent-tool.mjs", import.meta.url));
const chromeExecutable = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const localPlaywrightCli = join(root, "agent-tools/node_modules/@playwright/mcp/cli.js");
const npxCacheRoot = join(process.env.HOME ?? "", ".npm/_npx");
const cachedPlaywrightCli = existsSync(npxCacheRoot)
  ? readdirSync(npxCacheRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(npxCacheRoot, entry.name, "node_modules/@playwright/mcp/cli.js"))
    .filter(existsSync)
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)[0]
  : undefined;
const playwrightCli = existsSync(localPlaywrightCli) ? localPlaywrightCli : cachedPlaywrightCli;
if (!playwrightCli) {
  throw new Error("未找到已安装的 @playwright/mcp。请先安装该包，再运行此配置脚本。");
}
const playwrightArgs = [playwrightCli, "--browser", "chrome", "--executable-path", chromeExecutable];
const edits = [
  ["mcp_servers.fast-context.command", process.execPath],
  ["mcp_servers.fast-context.args", [launcher, "fast-context"]],
  ["mcp_servers.fast-context.startup_timeout_sec", 60],
  ["mcp_servers.fast-context.tools.fast_context_search.approval_mode", "approve"],
  ["mcp_servers.cunzhi.command", process.execPath],
  ["mcp_servers.cunzhi.args", [launcher, "cunzhi"]],
  ["mcp_servers.cunzhi.tools.zhi.approval_mode", "approve"],
].map(([keyPath, value]) => ({ keyPath, value, mergeStrategy: "replace" }));

if (process.argv.includes("--preview")) {
  console.log(JSON.stringify({
    edits,
    playwright: {
      when_registered: "修改已注册服务器",
      command: process.execPath,
      args: playwrightArgs,
      startup_timeout_sec: 60,
      default_tools_approval_mode: "approve",
    },
    secrets: "不修改 env 或密钥文件",
  }, null, 2));
  process.exit(0);
}

const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
  cwd: root,
  stdio: ["pipe", "pipe", "inherit"],
});
const closed = new Promise((resolve) => child.once("close", resolve));
const reader = createInterface({ input: child.stdout });
const lines = reader[Symbol.asyncIterator]();
let sequence = 0;

async function request(method, params) {
  const id = ++sequence;
  child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
  for (;;) {
    const { value, done } = await lines.next();
    if (done) throw new Error("Codex 配置服务已退出，请检查上方错误。");
    const response = JSON.parse(value);
    if (response.id !== id) continue;
    if (response.error) throw new Error(response.error.message);
    return response.result;
  }
}

try {
  await once(child, "spawn");
  await request("initialize", { clientInfo: { name: "modivue-mcp-config", version: "1.0.0" } });
  child.stdin.write(`${JSON.stringify({ method: "initialized" })}\n`);
  const { config } = await request("config/read", { includeLayers: false });
  const applicable = edits.filter(({ keyPath }) =>
    !keyPath.startsWith("mcp_servers.playwright.") || config.mcp_servers?.playwright,
  );
  if (config.mcp_servers?.playwright) {
    applicable.push(
      { keyPath: "mcp_servers.playwright.command", value: process.execPath, mergeStrategy: "replace" },
      { keyPath: "mcp_servers.playwright.args", value: playwrightArgs, mergeStrategy: "replace" },
      { keyPath: "mcp_servers.playwright.startup_timeout_sec", value: 60, mergeStrategy: "replace" },
      { keyPath: "mcp_servers.playwright.default_tools_approval_mode", value: "approve", mergeStrategy: "replace" },
    );
  }
  // 逐项修改字段，保留服务器已有的 env、密钥和其他配置。
  await request("config/batchWrite", { edits: applicable });
  console.log("MCP 配置已写入。已注册的 Playwright 使用系统 Chrome。");
  console.log("已允许 Fast Context 搜索、寸止交互，以及已注册的 Playwright 工具调用。");
  console.log("请重新加载 Codex 会话，再验证 MCP 调用。");
} finally {
  reader.close();
  child.stdin.end();
  child.kill();
  await closed;
}
