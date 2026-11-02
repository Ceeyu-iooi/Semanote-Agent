<script setup>
import { computed, ref, watch } from "vue";
import { entityNames } from "../api.js";
import {
  relationshipGraph,
  eventTime,
  eventContext,
  routeRelations,
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
const graph = computed(() => {
  const people = fullGraph.value.nodes.filter(
    (node) => node.label === "PERSON",
  );
  if (scope.value !== "people" || !people.length) return fullGraph.value;
  const names = new Set(people.map((node) => node.id));
  return {
    nodes: people,
    edges: fullGraph.value.edges.filter(
      (edge) =>
        names.has(edge.subject.itemText) && names.has(edge.object.itemText),
    ),
  };
});
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
const activeEvent = computed(
  () =>
    events.value.find((entry) => entry.item.itemId === chosenEvent.value)
      ?.item || events.value[0]?.item,
);
const activeEdge = computed(() =>
  graph.value.edges.find((item) => item.itemId === chosenEdge.value),
);
const width = computed(() =>
  Math.max(900, Math.ceil(graph.value.nodes.length / 6) * 680),
);
const height = computed(() =>
  Math.max(560, Math.ceil(graph.value.nodes.length / 8) * 400),
);
const nodes = computed(() =>
  graph.value.nodes.map((node, index, all) => {
    const angle = (index / Math.max(all.length, 1)) * Math.PI * 2 - Math.PI / 2;
    return {
      ...node,
      ...(Object.hasOwn(positions.value, node.id)
        ? positions.value[node.id]
        : {
            x:
              width.value / 2 - 100 + Math.cos(angle) * (width.value / 2 - 120),
            y:
              height.value / 2 - 70 + Math.sin(angle) * (height.value / 2 - 90),
          }),
    };
  }),
);
const edges = computed(() =>
  routeRelations(nodes.value, graph.value.edges, width.value, height.value),
);
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
    x: node.x,
    y: node.y,
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
      x: Math.max(
        8,
        Math.min(
          width.value - 208,
          drag.x + (event.clientX - drag.clientX) / zoom.value,
        ),
      ),
      y: Math.max(
        8,
        Math.min(
          height.value - 148,
          drag.y + (event.clientY - drag.clientY) / zoom.value,
        ),
      ),
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
      x: Math.max(8, Math.min(width.value - 208, node.x + x)),
      y: Math.max(8, Math.min(height.value - 148, node.y + y)),
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
        <h3>沿着证据，理解联系。</h3>
      </div>
      <div class="nav nav-pills graph-tabs" aria-label="图谱视图">
        <button
          class="nav-link"
          :class="{ active: tab === 'events' }"
          @click="tab = 'events'"
        >
          事件时间轴 <span class="badge">{{ events.length }}</span></button
        ><button
          class="nav-link"
          :class="{ active: tab === 'relations' }"
          @click="tab = 'relations'"
        >
          人物关系图 <span class="badge">{{ graph.nodes.length }}</span>
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
          <details class="event-context" open>
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
        <div
          class="btn-group btn-group-sm"
          role="group"
          aria-label="关系图范围"
        >
          <button
            class="btn btn-outline-primary"
            :class="{ active: scope === 'people' }"
            @click="
              scope = 'people';
              chosenPerson = null;
              chosenEdge = null;
            "
          >
            人物关系</button
          ><button
            class="btn btn-outline-primary"
            :class="{ active: scope === 'all' }"
            @click="
              scope = 'all';
              chosenPerson = null;
              chosenEdge = null;
            "
          >
            全部实体
          </button>
        </div>
        <p class="caption muted mb-0">
          拖动卡片整理布局 · 方向键移动 · 悬停或聚焦突出人物
        </p>
        <label class="caption d-flex align-items-center gap-2"
          >缩放<input
            class="form-range"
            v-model.number="zoom"
            type="range"
            min="0.65"
            max="1.3"
            step="0.05"
            aria-label="人物关系图缩放" /></label
        ><button
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
                <path :d="edge.d" marker-end="url(#relationArrow)" />
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
                    {{ edge.label }} →
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
        <template v-if="activeEdge"
          ><span class="badge text-bg-primary">{{ activeEdge.label }}</span
          ><strong
            >{{ activeEdge.subject.itemText }} →
            {{ activeEdge.object.itemText }}</strong
          >
          <p>{{ activeEdge.itemText }}</p>
          <button
            class="text-action"
            @click="
              emit('focus', { task: 'relations', itemId: activeEdge.itemId })
            "
          >
            定位原文证据 ↗
          </button></template
        >
        <p v-else-if="!activePerson" class="caption muted mb-0">
          点击连线上的关系名称查看完整证据。{{ graph.edges.length }} 条关系 ·
          同名卡片仅按词面聚合，未进行身份消歧。
        </p>
      </div>
    </template>
  </section>
</template>
