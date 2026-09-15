import { readFile, writeFile, mkdir, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir, platform } from "node:os";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { calibrationRecords, calibrationWire } from "./calibration-reference.js";

const defaultDirectory = platform() === "darwin" ? join(homedir(), "Library", "Application Support", "Modivue")
  : fileURLToPath(new URL("../../.local/", import.meta.url));
const path = process.env.MODIVUE_IQ_CALIBRATION_FILE || join(process.env.MODIVUE_DATA_DIR
  || (process.env.MODIVUE_DB ? dirname(process.env.MODIVUE_DB) : defaultDirectory), "iq-calibration.json");

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function validDistribution(distribution) {
  if (!isRecord(distribution) || !Object.keys(distribution).length) return false;
  const values = Object.values(distribution);
  return Object.keys(distribution).every((answer) => answer.length > 0 && answer.length <= 1000)
    && values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
    && Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) <= 1e-6;
}

function validModel(record) {
  const prompt = (value) => typeof value === "string" && value.trim().length > 0 && value.length <= 2000;
  if (!isRecord(record) || typeof record.revision !== "string" || !/^[a-zA-Z0-9._-]{1,48}$/.test(record.revision)
    || !(record.reasoningEffort === null || typeof record.reasoningEffort === "string")
    || !Number.isSafeInteger(record.maxOutputTokens) || record.maxOutputTokens < 8 || record.maxOutputTokens > 4096) return false;
  if (!record.probability && !record.juice) return false;
  if (record.probability) {
    const p = record.probability;
    if (p.method !== undefined && !["one-token:en:v1", "astra-community:adapted:v1", "meow:empirical:v1"].includes(p.method)) return false;
    if (p.system !== undefined && (typeof p.system !== "string" || p.system.length > 2000)) return false;
    if (p.method && !p.cells?.every(cell => Number.isSafeInteger(cell.sampleCount) && cell.sampleCount >= 10)) return false;
    if (!isRecord(p) || !Array.isArray(p.cells) || !p.cells.length || p.cells.length > 60
      || !p.cells.every((cell) => prompt(cell.prompt) && validDistribution(cell.distribution))
      || !Number.isSafeInteger(p.repetitions) || p.repetitions < (p.method ? 10 : 16) || p.repetitions > 100
      || !(p.temperature === null || Number.isFinite(p.temperature) && p.temperature > 0 && p.temperature <= 2)
      || !(p.maxJsd === null || Number.isFinite(p.maxJsd) && p.maxJsd >= 0 && p.maxJsd <= 1)) return false;
  }
  return !record.juice || isRecord(record.juice) && prompt(record.juice.prompt)
    && Number.isSafeInteger(record.juice.min) && record.juice.min >= 0
    && Number.isSafeInteger(record.juice.max) && record.juice.max >= record.juice.min;
}

function validCandidate(record) {
  return isRecord(record) && (record.reasoningEffort === null || typeof record.reasoningEffort === "string")
    && (!record.juice || isRecord(record.juice) && Number.isSafeInteger(record.juice.min)
      && Number.isSafeInteger(record.juice.max) && record.juice.max >= record.juice.min);
}

export function validateCalibration(payload) {
  if (!isRecord(payload) || !isRecord(payload.models)) throw new TypeError("校准档案必须包含 models 映射");
  if (payload.version !== 2) throw new TypeError("需要 version: 2 校准档案，旧格式没有提示词、采样条件和推理档位，不能用于核验");
  if (typeof payload.source !== "string" || !payload.source.trim() || payload.source.length > 1000) throw new TypeError("校准档案必须填写 source 来源");
  if (!Object.entries(payload.models).length || Object.entries(payload.models).some(([model, record]) => !model.trim() || !validModel(record))) {
    throw new TypeError("校准模型需提供 revision、reasoningEffort、maxOutputTokens；概率探针需提示词、有效分布、16–100 次采样、temperature 和 maxJsd；Juice 需提示词和整数范围");
  }
  const candidates = isRecord(payload.candidates) ? payload.candidates : payload.models;
  if (Object.entries(candidates).some(([model, record]) => !model.trim() || !validCandidate(record))) {
    throw new TypeError("候选模型档案包含无效的 reasoningEffort 或 Juice 范围");
  }
  if (payload.references !== undefined && (!Array.isArray(payload.references) || payload.references.some(record => !record.model?.trim() || !validModel(record)))) throw new TypeError("参考分布档案无效");
  return { version: 2, source: payload.source, updatedAt: payload.updatedAt || null, models: payload.models, candidates, ...(payload.references ? { references: payload.references } : {}) };
}

export async function readCalibration() {
  try { return validateCalibration(JSON.parse(await readFile(path, "utf8"))); } catch (error) { if (error.code !== "ENOENT") throw error; return null; }
}

export async function saveCalibration(payload) {
  const normalized = { ...validateCalibration(payload), updatedAt: new Date().toISOString() };
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(normalized, null, 2) + "\n", { encoding: "utf8", mode: 0o600, flag: "wx" });
    await rename(temporary, path);
  } finally { await unlink(temporary).catch((error) => { if (error.code !== "ENOENT") throw error; }); }
  return normalized;
}

export { path as calibrationPath };

export async function saveCalibrationRecord(model, record) {
  const current = await readCalibration();
  const identity = item => JSON.stringify([item.model, calibrationWire(item.wireApi), item.juice ? item.reasoningEffort : null,
    item.probability?.method || (item.probability ? "probability" : "juice"), item.probability?.cells.map(cell => cell.prompt)]);
  const reference = { model, ...record };
  const unique = new Map([reference, ...calibrationRecords(current)].map(item => [identity(item), item]).reverse());
  return saveCalibration({ version: 2, source: current?.source || record.source,
    models: { ...current?.models, [model]: record }, candidates: current?.candidates, references: [...unique.values()] });
}
