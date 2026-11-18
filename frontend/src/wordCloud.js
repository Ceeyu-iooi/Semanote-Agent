/** Pack frequency-ordered words outwards from the center without overlaps. */
export function placeWords(words, width, measure) {
  const placed = [];
  for (const word of words) {
    const w = Math.min(width - 24, Math.ceil(measure(word) * 1.12) + 20);
    const h = Math.max(44, Math.ceil(word.size * 1.5));
    const bounds = (x, y) => ({ x, y, w, h });
    let box;
    for (let i = 0; i < 2200; i++) {
      const angle = i * 0.42;
      const radius = i * 1.5;
      const candidate = bounds(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.78);
      if (Math.abs(candidate.x) + w / 2 > width / 2) continue;
      if (placed.every(other =>
        Math.abs(candidate.x - other.x) >= (w + other.w) / 2 ||
        Math.abs(candidate.y - other.y) >= (h + other.h) / 2)) {
        box = candidate;
        break;
      }
    }
    const bottom = Math.max(0, ...placed.map(other => other.y + other.h / 2));
    placed.push({ ...word, ...(box ?? bounds(0, bottom + h / 2)) });
  }
  const extent = Math.max(110, ...placed.map(box => Math.abs(box.y) + box.h / 2 + 8));
  return { height: extent * 2, words: placed };
}
