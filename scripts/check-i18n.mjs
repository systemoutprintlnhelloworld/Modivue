import { readFile } from "node:fs/promises";

const files = ["app.js", "index.html", "styles.css", "src/core/preferences.js"];
const [catalog, ...sources] = await Promise.all([
  readFile("src/core/i18n.js", "utf8"),
  ...files.map(file => readFile(file, "utf8"))
]);
const keyBlock = catalog.slice(catalog.indexOf("const english ="), catalog.indexOf("};", catalog.indexOf("const english =")));
const keys = new Set([...keyBlock.matchAll(/"((?:\\.|[^"\\])*)"\s*:/g)].map(match => match[1]));
const ignored = new Set(["svg", "CSS", "HTML", "JSON", "API", "USD", "Cache", "TTFT"]);
const missing = new Map();
for (let index = 0; index < sources.length; index += 1) {
  const file = files[index];
  // Dynamic UI copy must go through translate(). This check intentionally
  // ignores template prose that is not marked for translation yet.
  for (const match of sources[index].matchAll(/translate\(\s*["'`]([^"'`\n]+)["'`]\s*\)/g)) {
    const value = match[1].trim();
    if (ignored.has(value) || keys.has(value)) continue;
    const line = sources[index].slice(0, match.index).split("\n").length;
    missing.set(`${file}:${line}:${value}`, { file, line, value });
  }
}
if (missing.size) {
  console.error(`发现 ${missing.size} 条未登记 i18n 文案：`);
  for (const item of missing.values()) console.error(`- ${item.file}:${item.line} ${item.value}`);
  process.exitCode = 1;
} else console.log("i18n scan passed: all static Chinese strings are registered");
