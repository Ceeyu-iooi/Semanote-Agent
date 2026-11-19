import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { ApiError } from "./data.mjs";
import { deepSeekValue, pricingSource } from "./pricing.mjs";

const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" });
const usageFields = ["promptTokens", "completionTokens", "cachedTokens"];
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const byTime = (a,b) => (b.startedAt || "").localeCompare(a.startedAt || "");
function groups(rows, key) {
  const result = new Map();
  for (const row of rows) {
    const value = key(row);
    if (!value) continue;
    if (!result.has(value)) result.set(value, []);
    result.get(value).push(row);
  }
  return result;
}
function usage(rows) {
  const remote = rows.filter((row) => row.cache !== "local");
  const result = { remoteCalls: remote.length, localHits: rows.length - remote.length };
  const known = remote.every((row) => count(row.promptTokens) && count(row.completionTokens));
  for (const field of usageFields)
    result[field] = known && remote.every((row) => count(row[field])) ? remote.reduce((sum, row) => sum + row[field], 0) : null;
  return result;
}
function dateOf(row) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(row.startedAt)) return row.startedAt;
  const stamp = Date.parse(row.startedAt);
  return Number.isFinite(stamp) ? dayFormat.format(stamp) : null;
}
export function modelLogs(runtimeRoot) {
  const directory = resolve(runtimeRoot, "model-logs"), files = new Map(), runningFiles = new Set();
  let snapshot, expiry = 0, loading;
  async function readRows() {
    let names;
    try { names = await readdir(directory); }
    catch (error) {
      if (error.code === "ENOENT") return { rows: [], unreadableCount: 0 };
      throw new ApiError(500, "logsUnavailable", "调用记录暂不可读。");
    }
    const current = new Set(names.filter((name) => /^[a-f0-9-]{36}\.json$/.test(name)));
    for (const name of files.keys()) if (!current.has(name)) { files.delete(name); runningFiles.delete(name); }
    const pending = [...current].filter((name) => !files.has(name) || runningFiles.has(name));
    let unreadableCount = 0;
    for (let offset = 0; offset < pending.length; offset += 32) {
      await Promise.all(pending.slice(offset, offset + 32).map(async (name) => {
        const path = resolve(directory, name);
        try {
          if ((await stat(path)).size > 65536) throw new Error();
          const row = JSON.parse(await readFile(path, "utf8"));
          if (!row || typeof row.startedAt !== "string") throw new Error();
          // Older logs labeled any network call a miss, including positive prefix usage.
          if (row.cache !== "local") row.cache = count(row.cachedTokens) ? (row.cachedTokens > 0 ? "hit" : "miss") : "unknown";
          files.set(name, row);
          if (row.state === "running") runningFiles.add(name);
          else runningFiles.delete(name);
        } catch { unreadableCount++; files.delete(name); runningFiles.delete(name); }
      }));
    }
    return { rows: [...files.values()].sort(byTime), unreadableCount };
  }
  async function records() {
    if (Date.now() < expiry && snapshot) return snapshot;
    loading ??= readRows().then((value) => {
      expiry = Date.now() + 1000;
      return snapshot = value;
    }).finally(() => { loading = null; });
    return loading;
  }
  return async function list(filters) {
    const { rows, unreadableCount } = await records();
    const fields = ["provider","model","state","cache"];
    const filtered = rows.filter((row) => fields.every((key) => !filters[key] || filters[key] === row[key] ||
      (key === "cache" && filters.cache === "remote" && row.cache !== "local")) &&
      (!filters.query || [row.id, row.jobId, row.model].join("").includes(filters.query)));
    const [page,size] = [Math.max(1, Number.parseInt(filters.page) || 1), Math.min(100, Math.max(1, Number.parseInt(filters.size) || 30))];
    const summary = { calls: 0, localHits: 0, failures: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0,
      durationMs: 0, unknownUsage: 0, unknownCacheUsage: 0, equivalentApiValue: 0, unpricedCalls: 0, pricingSource };
    for (const row of filtered) {
      if (row.state === "failed") summary.failures++;
      if (count(row.durationMs)) summary.durationMs += row.durationMs;
      if (row.cache === "local") { summary.localHits++; continue; }
      summary.calls++;
      if (!count(row.promptTokens) || !count(row.completionTokens)) summary.unknownUsage++;
      if (!count(row.cachedTokens)) summary.unknownCacheUsage++;
      for (const field of usageFields) if (count(row[field])) summary[field] += row[field];
      const value = deepSeekValue(row);
      if (value === null) summary.unpricedCalls++;
      else summary.equivalentApiValue += value;
    }
    if (summary.calls && summary.calls === summary.unpricedCalls) summary.equivalentApiValue = null;
    const taskSeries = [...groups(filtered, (row) => row.jobId || null)].slice(0, 50).map(([jobId, group]) => ({ jobId, startedAt: group[0].startedAt, ...usage(group) }));
    const dailySeries = [...groups(filtered, dateOf)].sort(([a],[b]) => a.localeCompare(b)).map(([date, group]) => ({ date, ...usage(group) }));
    const table = filters.sort === "duration" ? [...filtered].sort((a,b) => (b.durationMs || 0) - (a.durationMs || 0)) : filtered;
    const options = (key) => [...new Set(rows.map((row) => row[key]).filter(Boolean))].sort();
    return { rows: table.slice((page - 1) * size, page * size), total: filtered.length, page, size, summary,
      providers: options("provider"), models: options("model"), unreadableCount, taskSeries, dailySeries };
  };
}
