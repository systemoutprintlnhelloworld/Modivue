export const calibrationWire = wire => wire === "chat.completions" ? "chat" : wire;

export function calibrationRecords(archive) {
  return [...(archive?.references || []), ...Object.entries(archive?.models || {}).map(([model, record]) => ({ model, ...record }))];
}

export function calibrationReference(archive, input, purpose) {
  const key = value => String(value || "").split("/").at(-1).toLowerCase().replaceAll(".", "-");
  const names = [input.canonicalModelId, input.observedModel].map(key);
  return calibrationRecords(archive).find(record => {
    if (!names.includes(key(record.model))) return false;
    if (record.wireApi && calibrationWire(record.wireApi) !== calibrationWire(input.wireApi)) return false;
    // Thinking strength is deliberately not part of benchmark identity for
    // every method except Juice.  Public and probability/distribution
    // references are shared by model + protocol; Juice remains strict because
    // its value is explicitly tied to the requested reasoning budget.
    if (purpose === "juice" && record.reasoningEffort !== (input.reasoningEffort || null)) return false;
    if (purpose === "juice") return Boolean(record.juice);
    return Boolean(record.probability) && (purpose === "probability" ? !record.probability.method : record.probability.method === purpose);
  }) || null;
}
