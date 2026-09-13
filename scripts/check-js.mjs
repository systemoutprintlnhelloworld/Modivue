import { readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
const paths = ["server.mjs", "app.js"];
for (const folder of ["src/core", "cli"]) {
  for (const file of await readdir(folder)) if (/\.(?:mjs|js)$/.test(file)) paths.push(join(folder, file));
}
for (const path of paths) execFileSync(process.execPath, ["--check", path], { stdio: "inherit" });
