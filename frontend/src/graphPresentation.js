/** Group opposite directions into one visual link while retaining every evidence record. */
export function groupRelationships(relations) {
  const groups = new Map();
  for (const item of relations) {
    const key = JSON.stringify([item.subject.itemText, item.object.itemText].sort());
    if (!groups.has(key)) groups.set(key, { ...item, records: [] });
    groups.get(key).records.push(item);
  }
  return [...groups.values()];
}

/** Same literal names share a display node, never a claim of resolved identity. */
export function relationshipGraph(relations = [], entities = [], text = "") {
  const nodes = new Map();
  function add(name, entity = null) {
    if (!name) return;
    if (!nodes.has(name))
      nodes.set(name, {
        id: name,
        name,
        label: entity?.label || "",
        evidence: [],
        count: 0,
        facts: [],
      });
    const node = nodes.get(name);
    if (entity) {
      node.label ||= entity.label;
      node.count += entity.spans?.length || 0;
      for (const span of entity.spans || []) {
        const chars = Array.from(text);
        let start = span.start,
          end = span.end;
        while (start > 0 && !/[。！？\n]/u.test(chars[start - 1])) start--;
        while (end < chars.length && !/[。！？\n]/u.test(chars[end])) end++;
        const evidence = chars
          .slice(start, Math.min(end + 1, chars.length))
          .join("");
        if (evidence && !node.evidence.includes(evidence))
          node.evidence.push(evidence);
      }
    }
  }
  entities
    .filter((item) => item.label === "PERSON")
    .forEach((item) => add(item.itemText, item));
  for (const relation of relations) {
    for (const endpoint of [relation.subject, relation.object]) {
      const name = endpoint?.itemText;
      add(name);
      if (
        nodes.has(name) &&
        !nodes.get(name).evidence.includes(relation.itemText)
      )
        nodes.get(name).evidence.push(relation.itemText);
    }
    const subject = nodes.get(relation.subject?.itemText),
      object = nodes.get(relation.object?.itemText);
    if (subject && object) {
      subject.facts.push({
        text: `${relation.label} → ${relation.object.itemText}`,
        itemId: relation.itemId,
      });
      object.facts.push({
        text: `${relation.label} ← ${relation.subject.itemText}`,
        itemId: relation.itemId,
      });
    }
  }
  for (const item of entities.filter((item) => item.label !== "PERSON"))
    if (nodes.has(item.itemText)) add(item.itemText, item);
  return {
    nodes: [...nodes.values()],
    edges: relations.filter(
      (item) =>
        nodes.has(item.subject?.itemText) && nodes.has(item.object?.itemText),
    ),
  };
}

/** Undated events stay visible; date labels never imply a guessed year. */
export function eventTime(item) {
  const value = (item.roles?.time || [])
    .map((entry) => entry.itemText)
    .join("、");
  const match = value.match(
    /(\d{4})(?:年|-|\/)(\d{1,2})(?:月|-|\/)(\d{1,2})日?/u,
  );
  if (!match) return { value: value || "时间未标明", timestamp: null };
  const [, y, m, d] = match.map(Number),
    date = new Date(Date.UTC(y, m - 1, d));
  return {
    value,
    timestamp:
      date.getUTCFullYear() === y &&
      date.getUTCMonth() === m - 1 &&
      date.getUTCDate() === d
        ? date.getTime()
        : null,
  };
}

/** One neighbouring sentence on each side, sliced from original code points. */
export function eventContext(text, item) {
  const chars = Array.from(text || ""),
    span = item.spans?.[0];
  if (!span) return item.itemText;
  let start = span.start,
    end = span.end,
    boundaries = 0;
  while (start > 0 && boundaries < 2) {
    start--;
    if (/[。！？\n]/u.test(chars[start])) boundaries++;
  }
  if (boundaries === 2) start++;
  boundaries = 0;
  while (end < chars.length && boundaries < 2) {
    if (/[。！？\n]/u.test(chars[end])) boundaries++;
    end++;
  }
  return chars.slice(start, end).join("");
}
