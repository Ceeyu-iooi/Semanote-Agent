import { entityNames, taskNames } from "./api.js";

/** Derive dashboard values from the same server snapshot shown elsewhere. */
export function dashboardModel(documents = [], jobs = [], statistics = null) {
  const active = documents.filter((item) => !item.archived);
  const rows = Object.entries(statistics?.itemCounts || {})
    .map(([key, value]) => ({ key, name: taskNames[key] || key, value }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
  const entities = Object.entries(statistics?.entityLabels || {})
    .map(([key, value]) => ({ key, name: entityNames[key] || key, value }))
    .sort((a, b) => b.value - a.value);
  return {
    activeCount: active.length,
    recent: active.slice(0, 4),
    savedCount: statistics?.savedCount ?? 0,
    running: jobs.filter((job) => ["queued", "running"].includes(job.state)).length,
    failed: jobs.filter((job) => ["failed", "partialFailure", "interrupted"].includes(job.state)).length,
    rows,
    maximum: Math.max(1, ...rows.map((item) => item.value)),
    entities,
    entityTotal: entities.reduce((sum, item) => sum + item.value, 0),
  };
}
