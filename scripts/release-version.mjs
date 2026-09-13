import { readFile } from "node:fs/promises";
const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
if (process.argv[2] !== `v${version}`) throw new Error(`Release tag must be v${version}`);
console.log(`Release version: ${version}`);
