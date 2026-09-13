import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { extractKey } from "../agent-tools/node_modules/fast-context-mcp/src/extract-key.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const secretsPath = join(root, ".local", "agent-tools.secrets.json");
const secrets = JSON.parse(readFileSync(secretsPath, "utf8"));
const result = await extractKey();

if (!result.api_key) {
  throw new Error(result.error || "未从 Devin 数据库提取到 Fast Context 密钥。");
}

secrets["fast-context"] = {
  ...secrets["fast-context"],
  WINDSURF_API_KEY: result.api_key,
};
writeFileSync(secretsPath, `${JSON.stringify(secrets, null, 2)}\n`);
console.log(`Fast Context 密钥已同步，长度 ${result.api_key.length}，来源 ${result.db_path}。`);
