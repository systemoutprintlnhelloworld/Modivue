import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { calibrationPath } from "./calibration.mjs";
import { normalizeBaseUrl } from "./identity.mjs";

const path = join(dirname(calibrationPath), "trusted-providers.json");
let writes = Promise.resolve();
async function readProviders() {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
}
const publicProvider = ({ id, baseUrl, wireApi, apiKey }) => ({ id, baseUrl, wireApi, credentialConfigured: Boolean(apiKey) });
export async function listTrustedProviders() { return (await readProviders()).map(publicProvider); }
export async function trustedProviderCredentials() { return (await readProviders()).map(provider => ({ ...provider })); }

export function saveTrustedProvider(input) {
  const job = writes.then(async () => {
    const baseUrl = normalizeBaseUrl(input.baseUrl);
    const url = new URL(baseUrl);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) throw new TypeError("请填写有效的可信 API 地址");
    const wireApi = input.wireApi || "chat";
    if (!["chat", "responses", "messages"].includes(wireApi)) throw new TypeError("请选择受支持的 API 协议");
    const providers = await readProviders();
    const current = providers.find(provider => provider.baseUrl === baseUrl && (provider.id === input.providerId || provider.wireApi === wireApi));
    const apiKey = typeof input.apiKey === "string" && input.apiKey.trim() ? input.apiKey.trim() : current?.apiKey;
    if (!apiKey) throw new TypeError("请填写 API Key");
    if (apiKey.length > 8192 || /[\r\n]/.test(apiKey)) throw new TypeError("API Key 格式无效");
    const provider = { id: current?.id || randomUUID(), baseUrl, wireApi, apiKey };
    const next = [...providers.filter(item => item.id !== provider.id), provider];
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(next), { mode: 0o600, flag: "wx" });
    await rename(temporary, path);
    return publicProvider(provider);
  });
  writes = job.catch(() => {});
  return job;
}

export async function resolveTrustedProvider(input) {
  if (input.apiKey?.trim()) return input;
  const providers = await readProviders();
  const baseUrl = input.baseUrl ? normalizeBaseUrl(input.baseUrl) : null;
  const provider = providers.find(item => item.id === input.providerId && (!baseUrl || item.baseUrl === baseUrl));
  if (!provider) throw new TypeError("请选择已保存的可信供应商或填写 API Key");
  return { ...provider, ...input, apiKey: provider.apiKey };
}
