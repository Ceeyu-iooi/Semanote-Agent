// Adapt snapshot evidence into the SVG contract of the shipped Archify viewer.
const ns = "http://www.w3.org/2000/svg";
const nodeWidth = 192, nodeHeight = 64;
const short = (value, limit) => Array.from(value || "").length > limit
  ? Array.from(value).slice(0, limit - 1).join("") + "…" : value || "";
const clean = value => String(value || "").replace(/[\u0000-\u001f]/g, " ");

function layout(count, timeline) {
  if (timeline) {
    return { width: Math.max(800, 80 + count * 238), height: 210,
      positions: Array.from({ length: count }, (_, i) => [40 + i * 238, 72]) };
  }
  if (count <= 2) return { width: 800, height: 240,
    positions: count === 1 ? [[304, 88]] : [[150, 88], [458, 88]] };
  const width = Math.max(840, count * 72), height = Math.max(340, count * 48);
  return { width, height, positions: Array.from({ length: count }, (_, i) => {
    const angle = 2 * Math.PI * i / count - Math.PI / 2;
    return [width / 2 - nodeWidth / 2 + (width / 2 - 145) * Math.cos(angle),
      height / 2 - nodeHeight / 2 + (height / 2 - 72) * Math.sin(angle)];
  }) };
}

function between(from, to) {
  const ax = from[0] + nodeWidth / 2, ay = from[1] + nodeHeight / 2;
  const bx = to[0] + nodeWidth / 2, by = to[1] + nodeHeight / 2;
  if (from === to) {
    const x = ax + nodeWidth / 2;
    return [`M ${x} ${ay - 14} C ${x + 56} ${ay - 48} ${x + 56} ${ay + 48} ${x} ${ay + 14}`, x + 42, ay];
  }
  const dx = bx - ax, dy = by - ay;
  const step = 1 / Math.max(Math.abs(dx) / (nodeWidth / 2), Math.abs(dy) / (nodeHeight / 2));
  return [`M ${ax + dx * step} ${ay + dy * step} L ${bx - dx * step} ${by - dy * step}`, (ax + bx) / 2, (ay + by) / 2];
}

/** Reuse Archify's native node, edge, theme and interaction runtime. */
export function workspaceDiagram(template, diagram, theme, reduced) {
  const doc = new DOMParser().parseFromString(template, "text/html");
  const svg = doc.querySelector(".diagram-container > svg");
  const card = svg.querySelector("[data-node-id][data-node-kind=frontend]");
  const { width, height, positions } = layout(diagram.nodes.length, diagram.timeline);
  const pointById = new Map(diagram.nodes.map((node, index) => [node.id, positions[index]]));
  const make = (kind, attrs, wording) => {
    const element = doc.createElementNS(ns, kind);
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
    if (wording) element.textContent = wording;
    return element;
  };
  doc.documentElement.dataset.theme = theme;
  doc.documentElement.dataset.embed = "true";
  if (reduced) doc.documentElement.dataset.motion = "still";
  const policy = doc.createElement("meta");
  policy.httpEquiv = "Content-Security-Policy";
  policy.content = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data: blob:; form-action 'none'";
  doc.head.prepend(policy);
  for (const id of ["archify-source-evidence-data"]) doc.getElementById(id)?.remove();
  doc.title = diagram.title;
  const style = doc.createElement("style");
  style.textContent = `
    body { margin:0 !important; padding:0 !important; }
    .diagram-container { border-radius:12px; margin:0 !important; }
    .diagram-container > svg { min-width:${diagram.timeline ? width : Math.min(width, 640)}px; }
    body, button, [role=button] { cursor:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='28'%3E%3Cpath d='M3 2L8 23l4-8 8-3z' fill='%232563eb' stroke='white' stroke-width='1.5'/%3E%3C/svg%3E") 3 2, auto !important; }
    [data-workspace-edge] { cursor:inherit; }
    [data-workspace-edge]:focus-visible { outline:2px solid #2563eb; }
  `;
  doc.head.append(style);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const heading = svg.querySelector("title");
  heading.textContent = diagram.title;
  svg.querySelector("desc").textContent = "来自当前文本的标注证据。";
  for (const child of [...svg.children]) {
    if (!["title", "desc", "defs", "style"].includes(child.localName)) child.remove();
  }
  svg.append(make("rect", { width, height, fill: "url(#grid)", opacity: ".65" }));
  diagram.links.forEach((link, index) => {
    const [path, x, y] = between(pointById.get(link.from), pointById.get(link.to));
    const attrs = { "data-edge-from": link.from, "data-edge-to": link.to,
      "data-edge-key": index, "data-edge-id": link.id, "data-edge-label": link.label };
    svg.append(make("path", { ...attrs, d: path, class: "a-emphasis",
      "stroke-width": "1.8", "marker-end": "url(#arrowhead-emphasis)" }));
    if (!link.label) return;
    const hit = make("g", { ...attrs, "data-workspace-edge": link.id, tabindex: "0",
      role: "button", "aria-label": link.label });
    hit.append(make("path", { d: path, fill: "none", stroke: "transparent", "stroke-width": "14" }));
    hit.append(make("rect", { x: x - 34, y: y - 21, width: 68, height: 18, rx: 8, class: "c-mask" }));
    hit.append(make("text", { x, y: y - 8, "text-anchor": "middle", class: "t-primary", "font-size": 10 }, link.label));
    svg.append(hit);
  });
  diagram.nodes.forEach((node, index) => {
    const [x, y] = positions[index];
    const native = card.cloneNode(true);
    native.id = "node-" + node.id;
    native.dataset.nodeId = node.id;
    native.dataset.nodeLabel = clean(node.label);
    native.dataset.nodeSublabel = clean(node.sublabel);
    native.dataset.nodeContext = diagram.timeline ? "事件" : "实体";
    native.setAttribute("aria-label", clean(node.label + "，" + node.sublabel));
    native.querySelector("title").textContent = node.label;
    native.querySelectorAll(":scope > rect").forEach(rect => {
      for (const [key, value] of Object.entries({ x, y, width: nodeWidth, height: nodeHeight })) rect.setAttribute(key, value);
      rect.removeAttribute("data-animate");
    });
    native.querySelector("[data-semantic-sigil]").setAttribute("transform", `translate(${x + 7} ${y + 7}) scale(.7)`);
    const label = native.querySelector("text[data-node-label]");
    label.setAttribute("x", x + nodeWidth / 2);
    label.setAttribute("y", y + 28);
    label.setAttribute("font-size", "14");
    label.textContent = short(node.label, 14);
    const sublabel = native.querySelector("text[data-detail]");
    sublabel.setAttribute("x", x + nodeWidth / 2);
    sublabel.setAttribute("y", y + 47);
    sublabel.setAttribute("font-size", "11");
    sublabel.textContent = short(node.sublabel, 20);
    svg.append(native);
  });
  return "<!doctype html>\n" + doc.documentElement.outerHTML;
}
