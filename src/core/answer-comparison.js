// Compare answer presentation without erasing signs, decimals or explanations.
export function comparableAnswer(value, expected) {
  const normalize = input => String(input ?? "").normalize("NFKC").trim()
    .replace(/^```(?:text|txt)?\s*\n?([\s\S]*?)\n?```$/i, "$1")
    .replace(/^(?:最终答案|答案|answer)\s*:\s*/i, "")
    .replace(/^\*\*([\s\S]*?)\*\*$/, "$1").trim()
    .replace(/[。.!！]\s*$/, "").trim();
  const actual = normalize(value), target = normalize(expected);
  if (!actual || !target) return false;
  if (actual === target) return true;
  // Common count suffixes are presentation for a unitless integer answer.
  // A signed answer or a decimal must never match after punctuation removal.
  return /^\d+$/.test(target) && actual.replace(/\s*(?:个|颗|枚|次)$/, "").trim() === target;
}
