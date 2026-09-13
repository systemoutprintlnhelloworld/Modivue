import { createHash } from "node:crypto";
import { modelIdentity } from "./model-identity.js";

export function credentialGroup(credential) {
  return credential ? createHash("sha256").update(credential).digest("hex").slice(0, 12) : "anonymous";
}

export function keyGroup(request) {
  const headers = new Headers(request.headers);
  const bearer = headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return credentialGroup(bearer || headers.get("x-api-key") || headers.get("x-goog-api-key"));
}

export function normalizeBaseUrl(value) {
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new TypeError("Base URL 必须是无凭据、查询参数或片段的 HTTP(S) 地址");
  }
  return url.origin + url.pathname.replace(/\/+$/, "");
}

export function upstreamEndpoint(baseUrl, suffix) {
  const base = normalizeBaseUrl(baseUrl);
  const path = suffix.replace(/^\/+/, "");
  return base + "/" + (base.endsWith("/v1") && path.startsWith("v1/") ? path.slice(3) : path);
}

export function observationKey(value) {
  return modelIdentity({ ...value, baseUrl: normalizeBaseUrl(value.baseUrl) });
}
