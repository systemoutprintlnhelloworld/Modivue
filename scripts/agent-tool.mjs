import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const [name, ...args] = process.argv.slice(2);
const config = JSON.parse(readFileSync(new URL("../agent-tools/config.json", import.meta.url), "utf8"));
const tool = config[name];

if (!tool) {
  console.error("用法: node scripts/agent-tool.mjs <smart-search|fast-context|cunzhi> [参数]");
  process.exit(2);
}

const secrets = JSON.parse(readFileSync(new URL("../.local/agent-tools.secrets.json", import.meta.url), "utf8"));
const env = { ...process.env, ...tool.env, ...secrets[name] };
if (name === "smart-search") {
  env.SMART_SEARCH_CONFIG_DIR = `${root}.local/smart-search`;
}
const child = spawn(tool.command === "node" ? process.execPath : tool.command, [...tool.args, ...args], {
  cwd: root,
  env,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(`${name}: ${error.code}. 请先运行 node scripts/install-agent-tools.mjs。`);
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal === "SIGINT" ? 130 : 143);
});
