import test from "node:test";
import assert from "node:assert/strict";
import { deepSeekValue } from "../../backend/pricing.mjs";

const row = {
  provider: "deepseek", model: "deepseek-flash", cache: "hit",
  promptTokens: 1_000_000, completionTokens: 1_000_000, cachedTokens: 500_000,
};
const at = (startedAt, overrides) => deepSeekValue({ ...row, startedAt, ...overrides });
test("DeepSeek equivalent value uses local peak hours, holiday/weekend and tariff tiers", () => {
  assert.equal(at("2026-11-19T00:59:59Z"), 4.51);
  assert.equal(at("2026-11-19T01:00:00Z"), 9.02);
  assert.equal(at("2026-11-19T04:00:00Z"), 4.51);
  assert.equal(at("2026-11-19T06:00:00Z"), 9.02);
  assert.equal(at("2026-11-19T10:00:00Z"), 4.51);
  assert.equal(at("2026-11-21T01:00:00Z"), 4.51);
  assert.equal(at("2026-10-01T02:00:00Z"), 4.51);
  assert.equal(at("2027-06-09T02:00:00Z"), 4.51);
  assert.equal(at("2026-11-19T01:00:00Z", { model: "deepseek-v4-pro" }), 31.65);
  assert.equal(at("2026-11-19T01:00:00Z", { provider: "aliyun", model: "another-model" }), 9.02);
});
test("unreported tokens and unknown DeepSeek models are not silently assigned zero", () => {
  assert.equal(at("2026-11-19T01:00:00Z", { cachedTokens: null }), null);
  assert.equal(at("2026-11-19T01:00:00Z", { model: "unknown" }), null);
  assert.equal(at("2026-11-19T01:00:00Z", { cache: "local", cachedTokens: null }), 0);
});
