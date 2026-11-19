// DeepSeek CNY rates, checked 2026-11-19. These are reference prices, not billing records.
export const pricingSource = "https://api-docs.deepseek.com/zh-cn/quick_start/pricing/";
const schedules = {
  "2026": [["01-01","01-03"],["02-15","02-23"],["04-04","04-06"],["05-01","05-05"],["06-19","06-21"],["09-25","09-27"],["10-01","10-07"]],
  "2027": [["01-01","01-03"],["02-05","02-13"],["04-03","04-05"],["05-01","05-05"],["06-09","06-09"],["09-15","09-15"],["10-01","10-07"]],
};
const rates = {
  flash: [0.04, 2, 8],
  pro: [0.30, 9, 27],
};
export function deepSeekValue(row) {
  if (row.cache === "local") return 0;
  const { promptTokens, completionTokens, cachedTokens } = row;
  if (![promptTokens, completionTokens, cachedTokens].every((value) => Number.isSafeInteger(value) && value >= 0) || cachedTokens > promptTokens) return null;
  // Equivalent valuation uses Flash as the reference for other providers.
  const model = row.provider === "deepseek" ? (row.resolvedModel || row.model || "").toLowerCase() : "deepseek-flash";
  const tier = /^deepseek-(?:v4(?:\.1)?-)?flash(?:-|$)/.test(model) ? "flash"
    : /^deepseek-v4-pro(?:-|$)/.test(model) ? "pro" : null;
  if (!tier || typeof row.startedAt !== "string" || !row.startedAt.includes("T")) return null;
  const stamp = Date.parse(row.startedAt);
  if (!Number.isFinite(stamp)) return null;
  const china = new Date(stamp + 8 * 3600000);
  const dates = schedules[china.getUTCFullYear()];
  if (!dates) return null;
  const date = china.toISOString().slice(5, 10), weekday = china.getUTCDay(), hour = china.getUTCHours();
  const peak = weekday > 0 && weekday < 6 && ((hour >= 9 && hour < 12) || (hour >= 14 && hour < 18)) &&
    !dates.some(([start, end]) => date >= start && date <= end);
  const [hit, miss, output] = rates[tier];
  return (cachedTokens * hit + (promptTokens - cachedTokens) * miss + completionTokens * output) * (peak ? 1 : 0.5) / 1e6;
}
