export const MODEL_CATALOG_URL = "/api/model-catalog";

export const normalizeModelName = (value) => value == null ? "" : String(value).normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, "");

function similarity(left, right) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    const current = [i];
    for (let j = 1; j <= right.length; j++) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
    previous = current;
  }
  return 1 - previous[right.length] / Math.max(left.length, right.length, 1);
}

function numericSignature(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase()
    .match(/\d+(?:\.\d+)?/g)?.filter((token) => !/^(?:19|20)\d{2}$/.test(token)) || [];
}

function compatibleNumbers(observedName, candidateName) {
  const observed = numericSignature(observedName);
  const candidate = numericSignature(candidateName);
  if (!observed.length || !candidate.length) return true;
  const length = Math.min(2, observed.length, candidate.length);
  return observed.slice(0, length).every((token, index) => token === candidate[index]);
}

function candidateValues(model) {
  const id = String(model.id || "");
  const tail = id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id;
  return [...new Set([id, tail, model.label, ...(model.aliases || [])].filter(Boolean))];
}

function scoreCandidate(observedName, model) {
  observedName = String(observedName ?? "").slice(0, 256);
  const observed = normalizeModelName(observedName);
  if (!observed) return -1;
  let best = -1;
  for (const rawCandidate of candidateValues(model)) {
    const candidate = normalizeModelName(rawCandidate);
    if (!candidate) continue;
    // Exact normalized names also cover dotted and hyphenated versions.
    if (observed !== candidate && !compatibleNumbers(observedName, rawCandidate)) continue;
    let score;
    if (observed === candidate) score = 1;
    else if (candidate.length >= 4 && observed.includes(candidate)) {
      // Relays commonly append dated snapshots or routing labels to a canonical id.
      score = 0.93 + Math.min(0.05, candidate.length / Math.max(observed.length, 1) * 0.05);
    } else if (observed.length >= 4 && candidate.includes(observed)) {
      score = 0.88 + Math.min(0.06, observed.length / Math.max(candidate.length, 1) * 0.06);
    } else score = similarity(observed, candidate);
    best = Math.max(best, score);
  }
  return best;
}

export function matchModelName(observedName, models = [], { provider } = {}) {
  const observed = normalizeModelName(observedName).slice(0, 256);
  if (!observed) return { model: null, confidence: 0, status: "unmatched" };
  const ranked = models.map((model) => ({ model, score: Math.min(1, scoreCandidate(observedName, model)
    + (provider && model.provider === provider ? 0.005 : 0)) }))
    .filter(({ score }) => score >= 0).sort((a, b) => b.score - a.score || a.model.id.localeCompare(b.model.id));
  const best = ranked[0];
  const ambiguous = best?.score >= 0.8 && ranked[1] && !(best.score === 1 && ranked[1].score < 1) && best.score - ranked[1].score < 0.025
    && normalizeModelName(ranked[1].model.id.split("/").at(-1)) !== normalizeModelName(best.model.id.split("/").at(-1));
  const status = ambiguous ? "ambiguous" : best?.score >= 0.8 ? "matched" : "unmatched";
  return { model: status === "matched" ? best.model : null, candidate: best?.model ?? null,
    confidence: Number((best?.score ?? 0).toFixed(3)), status,
    alternatives: ranked.slice(0, 3).map(({ model, score }) => ({ id: model.id, label: model.label, confidence: Number(score.toFixed(3)) })) };
}

export function normalizeCatalog(catalog) {
  if (!catalog?.models || Array.isArray(catalog.models) || !catalog.providers || Array.isArray(catalog.providers)) {
    throw new TypeError("Models.dev catalog 必须包含 models 和 providers 映射");
  }
  const models = Object.entries(catalog.models).map(([id, value]) => {
    if (!value || value.id !== id || typeof value.name !== "string" || !id.includes("/")) throw new TypeError("Models.dev 模型记录格式无效");
    const [provider, ...name] = id.split("/");
    const providerModel = catalog.providers[provider]?.models?.[name.join("/")];
    return { id, label: value.name, provider, aliases: [name.join("/")], family: value.family || null,
      releaseDate: value.release_date || null, updatedAt: value.last_updated || null, links: value.links || [],
      limit: value.limit || null, modalities: value.modalities || null, cost: value.cost || providerModel?.cost || null };
  });
  if (!models.length) throw new TypeError("Models.dev 标准模型目录为空");
  return models;
}

export async function fetchModelCatalog(fetchImpl = globalThis.fetch, endpoint = MODEL_CATALOG_URL) {
  const response = await fetchImpl(endpoint, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`模型目录同步失败: HTTP ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload.models) || !payload.models.length || !payload.syncedAt) throw new Error("本地模型目录格式无效");
  return { ...payload, models: [...new Map(payload.models.map((model) => [model.id, model])).values()] };
}
