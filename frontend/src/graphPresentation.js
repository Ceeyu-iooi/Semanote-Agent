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

/** Try source-relative curve positions; choose the fewest card/label collisions. */
export function routeRelations(nodes, relations, width, height) {
  const labels = [];
  return relations.map((edge) => {
    const from = nodes.find((node) => node.id === edge.subject.itemText),
      to = nodes.find((node) => node.id === edge.object.itemText);
    if (from.id === to.id) {
      const direction = from.x + 340 < width ? 1 : -1;
      const anchor = from.x + (direction > 0 ? 200 : 0),
        x = anchor + direction * 80,
        y = from.y + 70;
      labels.push({ x, y });
      return {
        ...edge,
        x,
        y,
        d: `M${anchor} ${from.y + 30} C${anchor + direction * 150} ${from.y - 30} ${anchor + direction * 150} ${from.y + 170} ${anchor} ${from.y + 110}`,
      };
    }
    const x1 = from.x + 100,
      y1 = from.y + 70,
      x2 = to.x + 100,
      y2 = to.y + 70;
    const dx = x2 - x1,
      dy = y2 - y1,
      length = Math.max(1, Math.hypot(dx, dy));
    const options = [];
    for (const bend of [0, 60, -60, 120, -120, 180, -180, 240, -240]) {
      const cx = (x1 + x2) / 2 - (dy / length) * bend * 2,
        cy = (y1 + y2) / 2 + (dx / length) * bend * 2;
      for (const t of [0.5, 0.35, 0.65]) {
        const x = (1 - t) ** 2 * x1 + 2 * t * (1 - t) * cx + t * t * x2,
          y = (1 - t) ** 2 * y1 + 2 * t * (1 - t) * cy + t * t * y2;
        const cardCollisions = nodes.filter(
          (node) =>
            x + 62 > node.x - 8 &&
            x - 62 < node.x + 208 &&
            y + 20 > node.y - 8 &&
            y - 20 < node.y + 148,
        ).length;
        const labelCollisions = labels.filter(
          (label) => Math.abs(label.x - x) < 124 && Math.abs(label.y - y) < 42,
        ).length;
        const outside = x < 64 || x > width - 64 || y < 24 || y > height - 24;
        options.push({
          x,
          y,
          cx,
          cy,
          penalty:
            cardCollisions * 10 + labelCollisions * 5 + (outside ? 100 : 0),
        });
      }
    }
    const chosen = options.sort((a, b) => a.penalty - b.penalty)[0];
    labels.push(chosen);
    const vx = x2 - chosen.cx,
      vy = y2 - chosen.cy;
    const ratio = Math.min(
      106 / Math.max(0.01, Math.abs(vx)),
      76 / Math.max(0.01, Math.abs(vy)),
    );
    return {
      ...edge,
      x: chosen.x,
      y: chosen.y,
      d:
        from.id === to.id
          ? `M${x1} ${from.y} c-110 -80 110 -80 0 0`
          : `M${x1} ${y1} Q${chosen.cx} ${chosen.cy} ${x2 - vx * ratio} ${y2 - vy * ratio}`,
    };
  });
}
