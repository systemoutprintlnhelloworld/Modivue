import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const repository = "hanlinwenyuan/hlwy-ai-checker";
const cachePath = join(process.env.MODIVUE_DATA_DIR || join(homedir(), "Library", "Application Support", "Modivue"), "public-baselines.json");
const bundled = JSON.parse(await readFile(new URL("../data/hlwy-baselines.json", import.meta.url), "utf8"));
let registry = bundled;
let syncJob;
let lastError = null;

export function validatePublicBaseline(data) {
  const item = Array.isArray(data) ? data[0] : data;
  if (!item || typeof item.model !== "string" || !Array.isArray(item.distribution) || item.distribution.length !== 355
    || !item.distribution.every((p) => Number.isFinite(p) && p >= 0 && p <= 1)
    || Math.abs(item.distribution.reduce((sum, p) => sum + p, 0) - 1) > 1e-6
    || !Number.isInteger(item.stats?.mode) || item.stats.mode < 1 || item.stats.mode > 355
    || !Number.isFinite(Date.parse(item.timestamp))) throw new TypeError("HLWY 基准格式无效");
  return item;
}

try {
  const cached = JSON.parse(await readFile(cachePath, "utf8"));
  if (Array.isArray(cached.files) && cached.files.length) {
    cached.files.forEach((file) => validatePublicBaseline(file.data));
    registry = cached;
  }
} catch (error) { if (error.code !== "ENOENT") lastError = "公共基准缓存无效，使用随应用附带的上游数据"; }

export function publicBaselineFor(input) {
  const names = [input.canonicalModelId, input.observedModel].filter(Boolean).map((name) => name.split("/").at(-1));
  const file = registry.files.find((file) => names.includes(validatePublicBaseline(file.data).model.split("/").at(-1)));
  return file ? { ...validatePublicBaseline(file.data), source: file.source, fetchedAt: registry.fetchedAt } : null;
}

export function publicBaselineCandidates() {
  return registry.files.map((file) => ({ ...validatePublicBaseline(file.data), source: file.source, fetchedAt: registry.fetchedAt }));
}

export function publicBaselineState() {
  return { source: registry.source, fetchedAt: registry.fetchedAt, error: lastError, syncing: Boolean(syncJob),
    models: registry.files.map((file) => { const item = validatePublicBaseline(file.data); return { model: item.model, publishedAt: item.timestamp }; }) };
}

export async function syncPublicBaselines() {
  if (syncJob) return syncJob;
  syncJob = (async () => {
    try {
      const response = await fetch(`https://api.github.com/repos/${repository}/contents/baselines?ref=main`, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
      const entries = await response.json();
      if (!Array.isArray(entries)) throw new Error("GitHub 基准目录无效");
      const files = [];
      for (const entry of entries.filter((entry) => entry.type === "file" && /^[a-zA-Z0-9._-]+\.json$/.test(entry.name))) {
        const source = `https://raw.githubusercontent.com/${repository}/main/baselines/${entry.name}`;
        const response = await fetch(source, { signal: AbortSignal.timeout(12000) });
        if (!response.ok) throw new Error(`基准下载 HTTP ${response.status}`);
        const data = await response.json(); validatePublicBaseline(data);
        files.push({ source, revision: entry.sha, data });
      }
      if (!files.length) throw new Error("上游没有可用基准");
      const next = { source: `https://github.com/${repository}`, fetchedAt: new Date().toISOString(), files };
      await mkdir(dirname(cachePath), { recursive: true });
      await writeFile(cachePath + ".tmp", JSON.stringify(next));
      await rename(cachePath + ".tmp", cachePath);
      registry = next; lastError = null;
    } catch (error) { lastError = error.message; }
    return publicBaselineState();
  })();
  try { return await syncJob; } finally { syncJob = null; }
}
