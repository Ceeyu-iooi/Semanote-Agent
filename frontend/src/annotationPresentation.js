/** A pending candidate owns its view; saved layers cannot masquerade as new inference progress. */
export function resolveDisplayLayers(
  historicalSnapshot,
  candidate,
  savedSnapshot,
) {
  if (historicalSnapshot) return historicalSnapshot.layers ?? {};
  if (candidate)
    return candidate.response?.layers ?? candidate.progress?.layers ?? {};
  return savedSnapshot?.layers ?? {};
}

export function sourcePositions(text, word) {
  if (!word) return [];
  const found = [];
  let offset = 0,
    previous = 0,
    codePoints = 0;
  while ((offset = text.indexOf(word, offset)) >= 0) {
    codePoints += Array.from(text.slice(previous, offset)).length;
    found.push(codePoints);
    previous = offset;
    offset += text.codePointAt(offset) > 0xffff ? 2 : 1;
  }
  return found;
}

/** Sweep annotation boundaries once, instead of scanning every item for every text fragment. */
export function buildSegments(text, items, breaks = []) {
  const chars = Array.from(text),
    events = new Map(),
    boundaries = new Set([0, chars.length, ...breaks]);
  const event = (offset) => {
    if (!events.has(offset)) events.set(offset, { add: [], remove: [] });
    return events.get(offset);
  };
  for (const item of items)
    for (const span of item.spans || []) {
      if (span.start < 0 || span.end > chars.length || span.start >= span.end)
        continue;
      boundaries.add(span.start);
      boundaries.add(span.end);
      event(span.start).add.push(item);
      event(span.end).remove.push(item);
    }
  const points = [...boundaries]
      .filter((point) => point >= 0 && point <= chars.length)
      .sort((a, b) => a - b),
    active = new Map(),
    breakSet = new Set(breaks);
  return points.slice(0, -1).map((start, index) => {
    const end = points[index + 1],
      changes = events.get(start);
    for (const item of changes?.remove || []) {
      const count = active.get(item) - 1;
      if (count) active.set(item, count);
      else active.delete(item);
    }
    for (const item of changes?.add || [])
      active.set(item, (active.get(item) || 0) + 1);
    const matches = [...active.keys()];
    return {
      start,
      end,
      breakBefore: start > 0 && breakSet.has(start),
      text: chars.slice(start, end).join(""),
      matches,
      tokenEnd: matches.some(
        (item) =>
          item.task === "segmentation" &&
          item.spans.some((span) => span.end === end),
      ),
      classes: matches.map(
        (item) =>
          `mark-${item.task} ${item.task === "ner" ? "entity-" + item.label : ""} ${item.task === "pos" ? "pos-" + item.label : ""} ${item.task === "sentiment" ? "sentiment-" + item.label : ""}`,
      ),
    };
  });
}
