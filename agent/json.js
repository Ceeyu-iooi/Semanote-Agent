import { requireValue } from "./contract.js";

/** Validate duplicate object keys, finite numbers and nesting before the native parser builds data. */
export function parseStrictJson(source) {
  let cursor = 0,
    nodes = 0;
  const whitespace = () => {
    while (/\s/.test(source[cursor] || "") && cursor < source.length) cursor++;
  };
  function string() {
    const start = cursor++;
    let escaped = false;
    while (cursor < source.length) {
      const char = source[cursor++];
      if (char === '"' && !escaped)
        return JSON.parse(source.slice(start, cursor));
      if (char === "\\" && !escaped) escaped = true;
      else escaped = false;
    }
    requireValue(false, "invalidJson");
  }
  function value(depth) {
    requireValue(depth <= 64 && ++nodes <= 100000, "jsonLimit");
    whitespace();
    const char = source[cursor];
    if (char === '"') {
      string();
      return;
    }
    if (char === "{") {
      cursor++;
      whitespace();
      const keys = new Set();
      if (source[cursor] === "}") {
        cursor++;
        return;
      }
      for (;;) {
        requireValue(source[cursor] === '"', "invalidJson");
        const key = string();
        requireValue(!keys.has(key), "duplicateJsonKey");
        keys.add(key);
        whitespace();
        requireValue(source[cursor++] === ":", "invalidJson");
        value(depth + 1);
        whitespace();
        if (source[cursor] === "}") {
          cursor++;
          break;
        }
        requireValue(source[cursor++] === ",", "invalidJson");
        whitespace();
      }
      return;
    }
    if (char === "[") {
      cursor++;
      whitespace();
      if (source[cursor] === "]") {
        cursor++;
        return;
      }
      for (;;) {
        value(depth + 1);
        whitespace();
        if (source[cursor] === "]") {
          cursor++;
          break;
        }
        requireValue(source[cursor++] === ",", "invalidJson");
      }
      return;
    }
    const start = cursor;
    while (cursor < source.length && !/[\s,\]}]/.test(source[cursor])) cursor++;
    requireValue(cursor > start, "invalidJson");
    const scalar = JSON.parse(source.slice(start, cursor));
    requireValue(
      typeof scalar !== "number" || Number.isFinite(scalar),
      "invalidJsonNumber",
    );
  }
  try {
    value(0);
    whitespace();
    requireValue(cursor === source.length, "invalidJson");
    return JSON.parse(source);
  } catch (error) {
    throw Object.assign(new Error("JSON 数据未通过校验。"), {
      code: error.code || "invalidJson",
    });
  }
}
