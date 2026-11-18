<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { entityNames } from "../api.js";
import { relationshipGraph, eventTime, eventContext, groupRelationships } from "../graphPresentation.js";
import { workspaceDiagram } from "../archifyWorkspace.js";

const props = defineProps({ layers: Object, text: String, activeTask: String, graphFocus: Object });
const emit = defineEmits(["focus"]);
const tab = ref("events"), selection = ref(null), template = ref(""), loadError = ref(false);
const frame = ref(null), panel = ref(null), detailPosition = ref(null);
const closeButton = ref(null);
let evidenceTrigger;
const theme = ref(document.documentElement.dataset.theme || "light");
const reduced = ref(document.documentElement.dataset.motion === "reduced");
const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
const observer = new MutationObserver(syncPreferences);
function syncPreferences() {
  theme.value = document.documentElement.dataset.theme || "light";
  reduced.value = document.documentElement.dataset.motion === "reduced" || motion.matches;
}
const items = task => props.layers?.[task]?.status === "success"
  ? props.layers[task].result.items : [];
const events = computed(() => items("events").map((item, index) => ({ item, index, ...eventTime(item) }))
  .sort((a, b) => (a.timestamp ?? Infinity) - (b.timestamp ?? Infinity) || a.index - b.index));
const graph = computed(() => relationshipGraph(items("relations"), items("ner"), props.text));
const relationships = computed(() => groupRelationships(graph.value.edges));
const relationModel = computed(() => {
  const ids = new Map(graph.value.nodes.map((node, i) => [node.id, "entity-" + i]));
  return {
    title: "实体关系图",
    nodes: graph.value.nodes.map(node => ({
      id: ids.get(node.id), label: node.name, sublabel: entityNames[node.label] || "关系端点",
      entries: [
        ...node.facts.map(fact => ({ title: fact.text, task: "relations", itemId: fact.itemId })),
        ...node.evidence.map(text => ({ title: "原文提及", text })),
        ...items("ner").filter(item => item.itemText === node.name)
          .slice(0, 1).map(item => ({ title: "首处实体标注", task: "ner", itemId: item.itemId })),
      ],
    })),
    links: relationships.value.map((edge, i) => {
      const from = edge.subject.itemText, to = edge.object.itemText;
      const related = events.value.filter(({ item }) => {
        const names = Object.values(item.roles || {}).flat().map(role => role.itemText);
        return names.includes(from) && names.includes(to);
      });
      return {
        id: "relation-" + i, from: ids.get(from), to: ids.get(to), label: edge.records.length + " 条关系",
        title: from + " · " + to,
        entries: [
          ...edge.records.map(item => ({
            title: item.subject.itemText + " → " + item.object.itemText + " · " + item.label,
            text: item.itemText, task: "relations", itemId: item.itemId,
          })),
          ...related.map(({ item }) => ({
            title: item.label, text: item.itemText, task: "events", itemId: item.itemId,
          })),
        ],
      };
    }),
  };
});
const eventModel = computed(() => ({
  title: "事件时间轴", timeline: true,
  nodes: events.value.map(({ item, value }, i) => ({
    id: "event-" + i, label: item.label, sublabel: value,
    entries: [{
      title: value, text: item.itemText, task: "events", itemId: item.itemId,
      context: eventContext(props.text, item),
      facts: Object.entries({ subject: "主体", object: "客体", location: "地点", cause: "原因", result: "结果" })
        .flatMap(([role, label]) => item.roles?.[role]?.length
          ? [{ label, text: item.roles[role].map(entry => entry.itemText).join("、") }] : []),
    }],
  })),
  links: events.value.slice(1).map((_, i) => ({
    id: "sequence-" + i, from: "event-" + i, to: "event-" + (i + 1),
  })),
}));
const model = computed(() => tab.value === "events" ? eventModel.value : relationModel.value);
const source = computed(() => template.value && model.value.nodes.length
  ? workspaceDiagram(template.value, model.value, theme.value, reduced.value) : "");
const entries = computed(() => [...model.value.nodes, ...model.value.links]);
const active = computed(() => entries.value.find(entry => entry.id === selection.value));
watch(() => props.layers, () => { selection.value = null; detailPosition.value = null; });
watch(() => props.activeTask, task => {
  if (["events", "relations"].includes(task)) tab.value = task;
}, { immediate: true });
watch(() => props.graphFocus, focus => {
  if (!focus || !["events", "relations"].includes(focus.task)) return;
  tab.value = focus.task;
  detailPosition.value = null;
  selection.value = (focus.task === "relations" ? model.value.links : model.value.nodes)
    .find(entry => entry.entries?.some(item => item.itemId === focus.itemId))?.id;
});
function chooseTab(value) {
  if (value === tab.value) return;
  tab.value = value;
  selection.value = null;
  detailPosition.value = null;
}
function closeEvidence(restoreFocus = false) {
  selection.value = null;
  detailPosition.value = null;
  if (restoreFocus && evidenceTrigger?.isConnected) evidenceTrigger.focus({ preventScroll: true });
  evidenceTrigger = null;
}
function bindViewer() {
  const viewer = frame.value;
  const doc = viewer?.contentDocument;
  if (!doc) return;
  doc.documentElement.dataset.theme = theme.value;
  if (reduced.value) doc.documentElement.dataset.motion = "still";
  const open = event => {
    if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
    const target = event.target.closest("[data-workspace-edge], [data-relationship-hit-key], [data-node-id]");
    const id = target?.dataset.workspaceEdge || target?.dataset.relationshipId || target?.dataset.nodeId;
    if (!id || !entries.value.some(entry => entry.id === id)) return;
    if (event.type === "keydown") event.preventDefault();
    evidenceTrigger = target;
    const bounds = target.getBoundingClientRect();
    const outer = panel.value.getBoundingClientRect();
    const iframe = viewer.getBoundingClientRect();
    const x = event.type === "click" && event.detail ? event.clientX : bounds.left + bounds.width / 2;
    const y = event.type === "click" && event.detail ? event.clientY : bounds.bottom;
    detailPosition.value = {
      left: Math.round(Math.max(12, Math.min(iframe.left - outer.left + x + 12, outer.width - Math.min(348, outer.width - 24) - 12))) + "px",
      top: Math.round(iframe.top - outer.top + Math.max(12, Math.min(y + 12, iframe.height - 360))) + "px",
    };
    selection.value = id;
    if (event.type === "keydown") nextTick(() => closeButton.value?.focus({ preventScroll: true }));
  };
  doc.addEventListener("click", open, true);
  doc.addEventListener("keydown", open, true);
  doc.addEventListener("keydown", event => {
    if (event.key === "Escape") closeEvidence();
  });
}
onMounted(async () => {
  syncPreferences();
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-motion"] });
  motion.addEventListener("change", syncPreferences);
  try {
    const response = await fetch("/reference/diagrams/system-architecture.html");
    if (!response.ok) throw new Error("viewer unavailable");
    const documentText = await response.text();
    if (!documentText.includes('name="generator" content="archify')) throw new Error("viewer invalid");
    template.value = documentText;
  } catch { loadError.value = true; }
});
onUnmounted(() => {
  observer.disconnect();
  motion.removeEventListener("change", syncPreferences);
});
</script>

<template>
  <section v-if="events.length || graph.nodes.length" ref="panel" class="surface relationship-panel evidence-explorer archify-workspace" @keydown.esc="closeEvidence(true)">
    <header class="panel-toolbar">
      <h3>关系与事件</h3>
      <div class="nav nav-pills graph-tabs" aria-label="图谱视图">
        <button class="nav-link" :class="{ active: tab === 'events' }" :aria-pressed="tab === 'events'" @click="chooseTab('events')">事件时间轴 <span class="badge">{{ events.length }}</span></button>
        <button class="nav-link" :class="{ active: tab === 'relations' }" :aria-pressed="tab === 'relations'" @click="chooseTab('relations')">实体关系图 <span class="badge">{{ graph.nodes.length }}</span></button>
      </div>
    </header>
    <p v-if="!model.nodes.length" class="empty-state">本篇暂无对应标注。</p>
    <p v-else-if="loadError" class="empty-state">无法加载 Archify 图谱，请刷新页面重试。</p>
    <div v-else-if="source" class="workspace-graph-stage">
      <Transition name="workspace-graph-fade" mode="out-in">
        <iframe :key="tab" ref="frame" :srcdoc="source" :title="model.title" class="workspace-graph-frame" @load="bindViewer"></iframe>
      </Transition>
    </div>
    <p v-else class="empty-state" role="status">正在加载图谱…</p>
    <section v-if="active?.entries" class="archify-evidence" :class="{ 'anchored-evidence': detailPosition }" :style="detailPosition" aria-label="标注证据">
      <header><strong>{{ active.title || active.label }}</strong><button ref="closeButton" type="button" class="archify-evidence-close" aria-label="关闭标注证据" @click.stop="closeEvidence(true)">×</button></header>
      <ul>
        <li v-for="(entry, index) in active.entries" :key="entry.itemId + '-' + index">
          <strong>{{ entry.title }}</strong>
          <p v-if="entry.text">{{ entry.text }}</p>
          <ul v-if="entry.facts?.length" class="event-evidence-facts">
            <li v-for="fact in entry.facts" :key="fact.label"><strong>{{ fact.label }}</strong> {{ fact.text }}</li>
          </ul>
          <details v-if="entry.context && entry.context !== entry.text"><summary>原文上下文</summary><p>{{ entry.context }}</p></details>
          <button v-if="entry.itemId" type="button" class="text-action" @click="emit('focus', { task: entry.task, itemId: entry.itemId, locateSource: true })">定位原文 ↗</button>
        </li>
      </ul>
    </section>
  </section>
</template>
