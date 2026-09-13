import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeCatalog } from "./model-match.js";

export const catalogSource = "https://models.dev/catalog.json";
export const catalogRefreshMs = 6 * 60 * 60 * 1000;
const cachePath = join(process.env.MODIVUE_DATA_DIR || fileURLToPath(new URL("../../.local/", import.meta.url)), "model-catalog.json");
let snapshot = null;
let pending = null;
let lastError = null;

try {
  const saved = JSON.parse(await readFile(cachePath, "utf8"));
  if (saved.sourceUrl === catalogSource && saved.formatVersion === 1 && Array.isArray(saved.models) && saved.models.length && Number.isFinite(Date.parse(saved.syncedAt))) snapshot = saved;
} catch (error) {
  if (error.code !== "ENOENT") lastError = "无法读取上次下载的模型目录";
}

export function catalogState() {
  const stale = !snapshot || Boolean(lastError) || Date.now() - Date.parse(snapshot.syncedAt) >= catalogRefreshMs;
  return { ...snapshot, source: "models.dev", sourceUrl: catalogSource, status: !snapshot ? "unavailable" : stale ? "stale" : "ready",
    stale, error: lastError, refreshIntervalMs: catalogRefreshMs, models: snapshot?.models || [], syncedAt: snapshot?.syncedAt || null };
}

export async function syncCatalog({ force = false, fetchImpl = globalThis.fetch } = {}) {
  if (pending) return pending;
  if (!force && !catalogState().stale) return catalogState();
  pending = (async () => {
    try {
      const headers = { Accept: "application/json" };
      if (snapshot?.etag) headers["If-None-Match"] = snapshot.etag;
      const response = await fetchImpl(catalogSource, { headers, signal: AbortSignal.timeout(20000) });
      const syncedAt = new Date().toISOString();
      let next;
      if (response.status === 304 && snapshot) next = { ...snapshot, syncedAt };
      else {
        if (!response.ok) throw new Error("models.dev HTTP " + response.status);
        const models = normalizeCatalog(await response.json());
        next = { formatVersion: 1, sourceUrl: catalogSource, models, syncedAt,
          etag: response.headers.get("etag"), upstreamModifiedAt: response.headers.get("last-modified") };
      }
      await mkdir(dirname(cachePath), { recursive: true });
      await writeFile(cachePath + ".tmp", JSON.stringify(next));
      await rename(cachePath + ".tmp", cachePath);
      snapshot = next;
      lastError = null;
    } catch (error) { lastError = error.cause?.code || error.message; }
    return catalogState();
  })();
  try { return await pending; } finally { pending = null; }
}
