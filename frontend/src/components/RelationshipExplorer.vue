<script setup>
import { computed, ref, watch } from "vue";
import { entityNames } from "../api.js";
import {
  relationshipGraph,
  eventTime,
  eventContext,
  groupRelationships,
} from "../graphPresentation.js";
const props = defineProps({
  layers: Object,
  text: String,
  activeTask: String,
  graphFocus: Object,
});
const emit = defineEmits(["focus"]);
const tab = ref("events"),
  chosenEvent = ref(null),
  chosenEdge = ref(null),
  chosenPerson = ref(null),
  scope = ref("people"),
  hovered = ref(null),
  focusedNode = ref(null),
  positions = ref({}),
  board = ref(null),
  zoom = ref(1);
const items = (task) =>
  props.layers?.[task]?.status === "success"
    ? props.layers[task].result.items
    : [];
const fullGraph = computed(() =>
  relationshipGraph(items("relations"), items("ner"), props.text),
);
const graph = computed(() => fullGraph.value);
const activePerson = computed(() =>
  fullGraph.value.nodes.find((node) => node.id === chosenPerson.value),
);
const spotlight = computed(() => hovered.value || focusedNode.value);
watch(
  () => props.activeTask,
  (task) => {
    if (task === "events" || task === "relations") tab.value = task;
  },
  { immediate: true },
);
// A repeated entry click is still a navigation intent even when the active layer did not change.
watch(
  () => props.graphFocus,
  (focus) => {
    if (!focus || !["events", "relations"].includes(focus.task)) return;
    tab.value = focus.task;
    if (!focus.itemId) return;
    if (focus.task === "events") chosenEvent.value = focus.itemId;
    else {
      chosenEdge.value = focus.itemId;
      chosenPerson.value = null;
      if (!graph.value.edges.some((item) => item.itemId === focus.itemId))
        scope.value = "all";
    }
  },
);
const events = computed(() =>
  items("events")
    .map((item, index) => ({ item, index, ...eventTime(item) }))
    .sort(
      (a, b) =>
        (a.timestamp ?? Infinity) - (b.timestamp ?? Infinity) ||
        a.index - b.index,
    ),
);
const sharedEvents = computed(() => activeEdge.value ? events.value.filter(({item}) => { const people = Object.values(item.roles || {}).flat().map(role => role.itemText); return people.includes(activeEdge.value.subject.itemText) && people.includes(activeEdge.value.object.itemText); }) : []);
const activeEvent = computed(
  () =>
    events.value.find((entry) => entry.item.itemId === chosenEvent.value)
      ?.item || events.value[0]?.item,
);
const activeEdge = computed(() =>
  groupedEdges.value.find((item) => item.itemId === chosenEdge.value || item.records.some(record => record.itemId === chosenEdge.value)),
);
const rawNodes = computed(() => graph.value.nodes.map((node,index) => ({...node,...(positions.value[node.id] || {x:24+(index % (graph.value.nodes.length > 6 ? 3 : 2))*250,y:24+Math.floor(index/(graph.value.nodes.length > 6 ? 3 : 2))*200})})));
const origin = computed(() => ({x: Math.max(0, 24 - Math.min(24, ...rawNodes.value.map(node => node.x))), y: Math.max(0, 24 - Math.min(24, ...rawNodes.value.map(node => node.y)))}));
const nodes = computed(() => rawNodes.value.map(node => ({...node, x: node.x + origin.value.x, y: node.y + origin.value.y})));
const width = computed(() => Math.max(900, ...nodes.value.map(p => p.x + 340)));
const height = computed(() => Math.max(520, ...nodes.value.map(p => p.y + 190)));
const groupedEdges = computed(() => groupRelationships(graph.value.edges));
const edges = computed(() => groupedEdges.value.map(edge => { const from = nodes.value.find(node => node.id === edge.subject.itemText), to = nodes.value.find(node => node.id === edge.object.itemText); if (from.id === to.id) return { ...edge, x: from.x + 245, y: from.y + 70, d: `M ${from.x + 190} ${from.y + 28} C ${from.x + 300} ${from.y - 20}, ${from.x + 300} ${from.y + 160}, ${from.x + 190} ${from.y + 112}` }; return { ...edge, x: (from.x + to.x)/2 + 100, y: (from.y + to.y)/2 + 70, d: `M ${from.x + 100} ${from.y + 70} L ${to.x + 100} ${to.y + 70}` }; }));
const roleNames = {
  subject: "主体",
  object: "客体",
  time: "时间",
  location: "地点",
  cause: "原因",
  result: "结果",
};
let drag = null;
let dragMoved = false;
function choosePerson(node) {
  if (dragMoved) {
    dragMoved = false;
    return;
  }
  chosenPerson.value = node.id;
  chosenEdge.value = null;
}
function startDrag(event, node) {
  if (event.button !== 0) return;
  dragMoved = false;
  event.currentTarget.setPointerCapture(event.pointerId);
  drag = {
    id: node.id,
    x: node.x - origin.value.x,
    y: node.y - origin.value.y,
    clientX: event.clientX,
    clientY: event.clientY,
  };
}
function moveDrag(event) {
  if (!drag) return;
  dragMoved ||=
    Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) > 4;
  positions.value = {
    ...positions.value,
    [drag.id]: {
      x: drag.x + (event.clientX - drag.clientX) / zoom.value,
      y: drag.y + (event.clientY - drag.clientY) / zoom.value,
    },
  };
}
function moveKey(event, node) {
  const offsets = {
    ArrowLeft: [-16, 0],
    ArrowRight: [16, 0],
    ArrowUp: [0, -16],
    ArrowDown: [0, 16],
  };
  if (!offsets[event.key]) return;
  event.preventDefault();
  const [x, y] = offsets[event.key];
  positions.value = {
    ...positions.value,
    [node.id]: {
      x: node.x - origin.value.x + x,
      y: node.y - origin.value.y + y,
    },
  };
}
watch(
  () => props.layers,
  () => {
    positions.value = {};
    chosenEvent.value = null;
    chosenEdge.value = null;
    chosenPerson.value = null;
    hovered.value = null;
    focusedNode.value = null;
    drag = null;
  },
);
</script>
<template>
  <section
    v-if="events.length || graph.nodes.length"
    class="surface relationship-panel evidence-explorer"
  >
    <header class="panel-toolbar">
      <div>
        <p class="eyebrow">PEOPLE · EVENTS · EVIDENCE</p>
        <h3>关系与事件</h3>
      </div>
      <div class="nav nav-pills graph-tabs" aria-label="图谱视图">
        <button
          class="nav-link"
          :class="{ active: tab === 'events' }"
          @click="tab = 'events'"
        >
          {{ events.some(entry => entry.timestamp !== null) ? "事件时间轴" : "事件顺序" }} <span class="badge">{{ events.length }}</span></button
        ><button
          class="nav-link"
          :class="{ active: tab === 'relations' }"
          @click="tab = 'relations'"
        >
          实体关系图 <span class="badge">{{ graph.nodes.length }}</span>
        </button>
      </div>
    </header>
    <template v-if="tab === 'events'">
      <p v-if="!events.length" class="empty-state">本篇暂无已标注事件。</p>
      <template v-else>
        <div class="event-timeline-track event-sequence" aria-label="选择事件">
          <button
            v-for="entry in events"
            :key="entry.item.itemId"
            :class="{ selected: activeEvent?.itemId === entry.item.itemId }"
            :aria-pressed="activeEvent?.itemId === entry.item.itemId"
            @click="chosenEvent = entry.item.itemId"
          >
            <time>{{ entry.value }}</time
            ><i></i><strong>{{ entry.item.label }}</strong
            ><small>{{
              entry.timestamp === null ? "时间未确定 · 按原文顺序" : "明确日期"
            }}</small>
          </button>
        </div>
        <article
          v-if="activeEvent"
          class="event-story"
          :key="activeEvent.itemId"
        >
          <p class="eyebrow">
            EVENT /
            {{ events.findIndex((entry) => entry.item === activeEvent) + 1 }}
          </p>
          <h4>{{ activeEvent.label }}</h4>
          <p class="event-description">{{ activeEvent.itemText }}</p>
          <dl class="row g-3 event-facts">
            <div
              v-for="(name, role) in roleNames"
              v-show="activeEvent.roles?.[role]?.length"
              :key="role"
              class="col-sm-6 col-lg-4"
            >
              <dt>{{ name }}</dt>
              <dd>
                {{
                  activeEvent.roles?.[role]
                    ?.map((entry) => entry.itemText)
                    .join("、") || "原文未标明"
                }}
              </dd>
            </div>
          </dl>
          <details class="event-context">
            <summary>上下文介绍 <small>来自原文相邻语句</small></summary>
            <p>{{ eventContext(text, activeEvent) }}</p>
          </details>
          <button
            class="btn btn-outline-primary btn-sm"
            @click="
              emit('focus', { task: 'events', itemId: activeEvent.itemId })
            "
          >
            定位原文证据 ↗
          </button>
        </article>
      </template>
    </template>
    <template v-else>
      <div class="graph-toolbar d-flex flex-wrap align-items-center gap-3">
        <div class="graph-zoom" role="group" aria-label="关系图缩放"><button type="button" aria-label="缩小" @click="zoom = Math.max(.4, zoom - .1)">−</button><span>{{ Math.round(zoom * 100) }}%</span><button type="button" aria-label="放大" @click="zoom = Math.min(2, zoom + .1)">＋</button></div><button
          class="btn btn-outline-primary btn-sm"
          @click="
            positions = {};
            zoom = 1;
          "
        >
          恢复布局
        </button>
      </div>
      <div class="relationship-scroll network-scroll" ref="board">
        <div
          :style="{ width: `${width * zoom}px`, height: `${height * zoom}px` }"
        >
          <div
            class="network-board"
            :style="{
              width: `${width}px`,
              height: `${height}px`,
              transform: `scale(${zoom})`,
            }"
          >
            <svg
              class="network-links"
              :viewBox="`0 0 ${width} ${height}`"
              aria-label="有向关系连线"
            >
              <defs>
                <marker
                  id="relationArrow"
                  markerWidth="9"
                  markerHeight="9"
                  refX="8"
                  refY="4"
                  orient="auto"
                >
                  <path d="M0 0L8 4L0 8" fill="none" stroke="currentColor" />
                </marker>
              </defs>
              <g
                v-for="edge in edges"
                :key="edge.itemId"
                :class="{
                  active: chosenEdge === edge.itemId,
                  dimmed:
                    spotlight &&
                    edge.subject.itemText !== spotlight &&
                    edge.object.itemText !== spotlight,
                }"
              >
                <path :d="edge.d" tabindex="0" role="button" :aria-label="`${edge.subject.itemText}与${edge.object.itemText}，${edge.records.length}条关系`" @click="chosenEdge = edge.itemId; chosenPerson = null" @keydown.enter="chosenEdge = edge.itemId; chosenPerson = null" />
                <foreignObject
                  :x="edge.x - 58"
                  :y="edge.y - 16"
                  width="116"
                  height="40"
                  ><button
                    class="edge-label"
                    :aria-pressed="chosenEdge === edge.itemId"
                    @click="
                      chosenEdge = edge.itemId;
                      chosenPerson = null;
                    "
                  >
                    {{ edge.records.length }} 条关系
                  </button></foreignObject
                >
              </g>
            </svg>
            <button
              v-for="node in nodes"
              :key="node.id"
              class="person-node card"
              :class="{
                dimmed: spotlight && spotlight !== node.id,
                highlighted: spotlight === node.id,
              }"
              :style="{ left: `${node.x}px`, top: `${node.y}px` }"
              @pointerdown="startDrag($event, node)"
              @pointermove="moveDrag"
              @pointerup="drag = null"
              @pointercancel="drag = null"
              @lostpointercapture="drag = null"
              @pointerenter="hovered = node.id"
              @pointerleave="hovered = null"
              @focus="focusedNode = node.id"
              @blur="focusedNode = null"
              @keydown="moveKey($event, node)"
              @click="choosePerson(node)"
            >
              <span class="person-heading"
                ><span class="person-avatar">{{
                  node.label === "PERSON" ? Array.from(node.name)[0] : "实"
                }}</span
                ><span
                  ><strong>{{ node.name }}</strong
                  ><small
                    >{{ entityNames[node.label] || "关系端点" }} ·
                    {{
                      node.count ? `${node.count} 处实体标注` : "原文关系"
                    }}</small
                  ></span
                ></span
              ><span v-if="node.facts.length" class="person-facts"
                ><small
                  v-for="fact in node.facts.slice(0, 2)"
                  :key="fact.itemId + fact.text"
                  >{{ fact.text }}</small
                ></span
              ><span v-else class="person-evidence">{{
                node.evidence[0] || "暂无附加原文信息"
              }}</span
              ><span class="person-scrim" aria-hidden="true"></span>
            </button>
          </div>
        </div>
      </div>
      <div class="network-evidence">
        <section v-if="activePerson" class="person-dossier">
          <header>
            <span class="person-avatar">{{
              Array.from(activePerson.name)[0]
            }}</span>
            <div>
              <p class="eyebrow">人物信息与原文证据</p>
              <h4>{{ activePerson.name }}</h4>
            </div>
            <button
              class="btn btn-outline-primary btn-sm ms-auto"
              @click="chosenPerson = null"
            >
              收起信息
            </button>
          </header>
          <div class="row g-4">
            <div class="col-md-4">
              <h5>已标注的关系</h5>
              <button
                v-for="fact in activePerson.facts"
                :key="fact.itemId + fact.text"
                class="dossier-relation"
                @click="
                  chosenEdge = fact.itemId;
                  chosenPerson = null;
                  scope = 'all';
                "
              >
                {{ fact.text }} ↗
              </button>
              <p v-if="!activePerson.facts.length" class="caption muted">
                尚无明确关系标注
              </p>
            </div>
            <div class="col-md-8">
              <h5>原文中的人物信息</h5>
              <blockquote
                v-for="evidence in activePerson.evidence"
                :key="evidence"
              >
                {{ evidence }}
              </blockquote>
            </div>
          </div>
        </section>
        <template v-if="activeEdge"><h4>{{ activeEdge.subject.itemText }} · {{ activeEdge.object.itemText }}</h4><article v-for="record in activeEdge.records" :key="record.itemId"><strong>{{ record.subject.itemText }} → {{ record.object.itemText }} · {{ record.label }}</strong><p>{{ record.itemText }}</p><button class="text-action" @click="emit('focus', { task: 'relations', itemId: record.itemId })">定位原文 ↗</button></article><article v-for="entry in sharedEvents" :key="entry.item.itemId"><strong>{{ entry.item.label }}</strong><p>{{ entry.item.itemText }}</p><button class="text-action" @click="emit('focus', { task: 'events', itemId: entry.item.itemId })">定位事件 ↗</button></article></template>
      </div>
    </template>
  </section>
</template>
