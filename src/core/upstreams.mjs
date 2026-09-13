import { normalizeBaseUrl, upstreamEndpoint } from "./identity.mjs";

const protocols = ["openai", "anthropic"];
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
export const routeIdPattern = /^[A-Za-z0-9_-]+$/;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizedRoute(routeId, baseUrl) {
  if (!routeIdPattern.test(routeId)) throw new TypeError(`上游路由 ID 格式无效: ${routeId}`);
  if (typeof baseUrl !== "string" || !baseUrl.trim()) throw new TypeError(`上游路由 ${routeId} 缺少 Base URL`);
  return normalizeBaseUrl(baseUrl);
}

export function upstreamRoutes(env = process.env) {
  const maps = { openai: new Map(), anthropic: new Map() };
  if (env.MODIVUE_UPSTREAMS) {
    let input;
    try { input = JSON.parse(env.MODIVUE_UPSTREAMS); }
    catch { throw new TypeError("MODIVUE_UPSTREAMS 必须是有效 JSON"); }
    if (!isRecord(input)) throw new TypeError("MODIVUE_UPSTREAMS 必须是对象");
    for (const protocol of Object.keys(input)) {
      if (!protocols.includes(protocol)) throw new TypeError(`不支持的上游协议: ${protocol}`);
      if (!isRecord(input[protocol])) throw new TypeError(`MODIVUE_UPSTREAMS.${protocol} 必须是路由对象`);
      for (const [routeId, baseUrl] of Object.entries(input[protocol])) {
        maps[protocol].set(routeId, normalizedRoute(routeId, baseUrl));
      }
    }
  }

  if (env.MODIVUE_OPENAI_UPSTREAM) maps.openai.set("default", normalizedRoute("default", env.MODIVUE_OPENAI_UPSTREAM));
  if (env.MODIVUE_ANTHROPIC_UPSTREAM) maps.anthropic.set("default", normalizedRoute("default", env.MODIVUE_ANTHROPIC_UPSTREAM));
  return Object.fromEntries(protocols.map((protocol) => [protocol,
    Object.fromEntries([...maps[protocol]].sort(([left], [right]) => left.localeCompare(right))) ]));
}

function parseProxyPath(pathname, routes) {
  const match = pathname.match(/^\/proxy\/(openai|anthropic)\/(.+)$/);
  if (!match) return null;
  const [, protocol, tail] = match;
  let routeId = "default";
  let suffix;

  // A configured route called "v1" is addressed as /proxy/<protocol>/v1/v1/....
  if ((tail === "v1/v1" || tail.startsWith("v1/v1/")) && Object.hasOwn(routes[protocol], "v1")) {
    routeId = "v1";
    suffix = tail.slice(2);
  } else if (tail === "v1" || tail.startsWith("v1/")) {
    suffix = `/${tail}`;
  } else {
    const separator = tail.indexOf("/");
    if (separator < 1) throw new TypeError("代理路径缺少 /v1");
    routeId = tail.slice(0, separator);
    if (!routeIdPattern.test(routeId)) throw new TypeError(`上游路由 ID 格式无效: ${routeId}`);
    suffix = tail.slice(separator);
    if (suffix !== "/v1" && !suffix.startsWith("/v1/")) throw new TypeError("代理路径必须以 /v1 开始");
  }
  return { protocol, routeId, suffix };
}

export function resolveProxyRoute(pathname, search = "", env = process.env) {
  const routes = upstreamRoutes(env);
  const parsed = parseProxyPath(pathname, routes);
  if (!parsed) return null;
  const baseUrl = routes[parsed.protocol][parsed.routeId] || null;
  return { ...parsed, baseUrl,
    upstreamUrl: baseUrl ? upstreamEndpoint(baseUrl, parsed.suffix + search) : null };
}

export function unpackLocalProxyBaseUrl(value, expectedProtocol, env = process.env) {
  let proxyBaseUrl;
  let url;
  try {
    proxyBaseUrl = normalizeBaseUrl(value);
    url = new URL(proxyBaseUrl);
  } catch { return null; }
  if (!localHosts.has(url.hostname) || !url.pathname.startsWith("/proxy/")) return null;

  try {
    const route = resolveProxyRoute(url.pathname, "", env);
    if (!route || route.protocol !== expectedProtocol || !route.baseUrl) {
      return { proxyBaseUrl, baseUrl: proxyBaseUrl, resolved: false };
    }
    return { proxyBaseUrl, baseUrl: route.baseUrl, protocol: route.protocol,
      routeId: route.routeId, resolved: true };
  } catch {
    return { proxyBaseUrl, baseUrl: proxyBaseUrl, resolved: false };
  }
}
