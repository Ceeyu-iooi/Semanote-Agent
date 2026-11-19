import { resolve } from "node:path";
import { readJson, writeJson } from "../tools/lib/project.mjs";
import { ApiError } from "./data.mjs";

export function modelSettings(runtimeRoot) {
  const file = resolve(runtimeRoot, "model-providers.json");
  const defaults = {
    provider: "deepseek",
    providers: [
      { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com", model: "deepseek-flash", apiKey: process.env.DEEPSEEK_API_KEY || "" },
      { id: "aliyun", name: "阿里云百炼", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "deepseek-v4.1-flash", apiKey: "" },
    ].map((item) => ({ ...item, timeoutSeconds: 120, maxOutputTokens: 8192, jsonMode: true })),
  };
  const publicSettings = ({ provider, providers }) => ({ provider, providers: providers.map(({ apiKey, ...item }) => ({ ...item, hasApiKey: Boolean(apiKey?.trim()) })) });
  async function stored() {
    try {
      const data = await readJson(file, defaults);
      if (!Array.isArray(data?.providers)) throw new Error();
      return data;
    } catch { throw new ApiError(500, "settingsUnavailable", "模型设置无法读取。"); }
  }
  let writes = Promise.resolve();
  const invalid = () => { throw new ApiError(400, "invalidModelSettings", "请检查供应商身份、HTTPS 地址、模型和超时/Token 上限。"); };
  async function save(body) {
    if (!Array.isArray(body?.providers) || !body.providers.length || body.providers.length > 20) invalid();
    const previous = await stored(), ids = new Set(), providers = [];
    for (const value of body.providers) {
      const { id, name, baseUrl, model, timeoutSeconds, maxOutputTokens } = value || {};
      if (![id,name,baseUrl,model].every((field) => typeof field === "string")) invalid();
      let url;
      try { url = new URL(baseUrl); } catch { invalid(); }
      if (!/^[a-z][a-z0-9_]{0,39}$/.test(id) || ids.has(id) || !name.trim() || name.length > 80 ||
          url.protocol !== "https:" || url.username || url.password || url.search || url.hash || baseUrl.length > 500 ||
          !/^[A-Za-z0-9_.:/-]{1,120}$/.test(model) || !Number.isInteger(timeoutSeconds) || timeoutSeconds < 10 || timeoutSeconds > 240 ||
          !Number.isInteger(maxOutputTokens) || maxOutputTokens < 512 || maxOutputTokens > 32768) invalid();
      let apiKey = value.apiKey ?? "";
      if (typeof apiKey !== "string" || apiKey.length > 1000 || /\s/.test(apiKey)) invalid();
      const normalizedBase = baseUrl.replace(/\/+$/, ""), old = previous.providers.find((item) => item.id === id);
      if (!apiKey && old?.apiKey) {
        if (normalizedBase !== old.baseUrl.replace(/\/+$/, "")) throw new ApiError(400, "keyRequiredForNewEndpoint", "修改供应商地址时，请重新填写此地址的密钥。");
        apiKey = old.apiKey;
      }
      ids.add(id);
      providers.push({ id, name, baseUrl: normalizedBase, model, apiKey, timeoutSeconds, maxOutputTokens, jsonMode: value.jsonMode !== false });
    }
    if (!ids.has(body.provider)) invalid();
    const next = { provider: body.provider, providers };
    try { await writeJson(file, next); }
    catch { throw new ApiError(500, "settingsUnavailable", "模型设置未保存，请重试。"); }
    return publicSettings(next);
  }
  return {
    async read() { return publicSettings(await stored()); },
    async executionConfig(id) {
      const config = (await stored()).providers.find((item) => item.id === id);
      if (!config) throw new ApiError(400, "unknownProvider", "请先在设置中添加该供应商。");
      if (!config.apiKey?.trim()) throw new ApiError(400, "missingApiKey", "请先在设置中填写该供应商密钥。");
      return config;
    },
    save(body) {
      const result = writes.then(() => save(body));
      writes = result.catch(() => {});
      return result;
    },
  };
}
