<script setup>
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { request } from "../api.js";
import {
  buildGitGraph,
  gitGroups,
  parseUnifiedDiff,
} from "../gitPresentation.js";
const data = ref(null),
  index = ref(0),
  detail = ref(null),
  error = ref(""),
  busy = ref(false),
  detailBusy = ref(false),
  track = ref(null),
  branch = ref("all"),
  fileQuery = ref(""),
  selectedFile = ref(""),
  mode = ref("files");
const rows = computed(() => data.value?.commits || []),
  selected = computed(() => rows.value[index.value]);
const branches = computed(() =>
  [
    ...new Set(
      rows.value.flatMap((row) => row.refs.split(", ").filter(Boolean)),
    ),
  ].filter((value) => !value.includes("HEAD")),
);
const graph = computed(() => buildGitGraph(rows.value)),
  ordered = computed(() => [...graph.value.nodes].reverse());
const selectedNode = computed(() =>
  graph.value.nodes.find((node) => node.id === selected.value?.id),
);
const position = computed({
  get: () => rows.value.length - 1 - index.value,
  set: (value) => {
    index.value = rows.value.length - 1 - Number(value);
  },
});
const fill = computed(() =>
  rows.value.length <= 1
    ? 100
    : (position.value / (rows.value.length - 1)) * 100,
);
const patches = computed(() => parseUnifiedDiff(detail.value?.patch || ""));
const files = computed(
  () =>
    detail.value?.files ||
    patches.value.map((file) => ({
      path: file.path,
      binary: file.binary,
      additions: null,
      deletions: null,
    })),
);
const visibleFiles = computed(() =>
  files.value.filter((file) =>
    file.path.toLowerCase().includes(fileQuery.value.toLowerCase()),
  ),
);
const chosenFile = computed(
  () =>
    visibleFiles.value.find((file) => file.path === selectedFile.value) ||
    visibleFiles.value[0],
);
const chosenPatch = computed(() =>
  patches.value.find((file) => file.path === chosenFile.value?.path),
);
const totals = computed(() =>
  files.value.reduce(
    (counts, file) => ({
      added: counts.added + (file.additions || 0),
      deleted: counts.deleted + (file.deletions || 0),
    }),
    { added: 0, deleted: 0 },
  ),
);
let sequence = 0;
async function load() {
  busy.value = true;
  error.value = "";
  try {
    const old = selected.value?.id;
    data.value = await request("/development/git");
    index.value = 0;
    if (old === selected.value?.id) await loadDetail();
  } catch (cause) {
    error.value = cause.message;
  } finally {
    busy.value = false;
  }
}
async function loadDetail() {
  const id = selected.value?.id,
    current = ++sequence;
  if (!id) return;
  detail.value = null;
  detailBusy.value = true;
  error.value = "";
  selectedFile.value = "";
  fileQuery.value = "";
  try {
    const result = await request(`/development/git/${id}`);
    if (current === sequence) detail.value = result;
  } catch (cause) {
    if (current === sequence) error.value = cause.message;
  } finally {
    if (current === sequence) detailBusy.value = false;
  }
  await nextTick();
  if (current !== sequence || selected.value?.id !== id) return;
  track.value
    ?.querySelector(`[data-commit="${id}"]`)
    ?.scrollIntoView({
      block: "nearest",
      inline: "center",
      behavior:
        document.documentElement.dataset.motion === "reduced" ||
        matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
    });
}
function selectCommit(id) {
  const found = rows.value.findIndex((row) => row.id === id);
  if (found >= 0) index.value = found;
}
function selectBranch() {
  const found = rows.value.find((row) =>
    row.refs.split(", ").includes(branch.value),
  );
  if (found) selectCommit(found.id);
}
function chooseFile(file) {
  selectedFile.value = file.path;
  mode.value = "diff";
}
watch(() => selected.value?.id, loadDetail);
onMounted(load);
</script>
<template>
  <section class="git-view git-explorer">
    <header class="panel-toolbar">
      <div>
        <p class="eyebrow">REPOSITORY IN MOTION</p>
        <h1>每一次改变，都有来处。</h1>
        <p class="caption muted">
          {{ data?.branch }} · 当前仓库 · {{ rows.length }} 次真实提交
        </p>
      </div>
      <button class="btn btn-outline-primary" :disabled="busy" @click="load">
        刷新记录
      </button>
    </header>
    <p v-if="error" class="feedback error-feedback" role="alert">{{ error }}</p>
    <template v-if="data">
      <div class="git-context-bar">
        <div class="git-legend" aria-label="Git 分支颜色图例">
          <span v-for="group in graph.groups" :key="group"
            ><i :style="{ background: gitGroups[group].color }"></i
            >{{ gitGroups[group].name }}</span
          >
        </div>
        <label
          >定位分支<select
            v-model="branch"
            class="form-select"
            aria-label="定位分支标记"
            @change="selectBranch"
          >
            <option value="all">全部历史</option>
            <option v-for="name in branches" :key="name">{{ name }}</option>
          </select></label
        >
      </div>
      <div
        ref="track"
        class="git-map-scroll"
        tabindex="0"
        aria-label="Git 历史：左侧较早，右侧较新"
      >
        <div class="git-map" :style="{ width: `${graph.width}px` }">
          <svg
            :width="graph.width"
            :height="graph.height"
            aria-label="实际父关系和当前时间位置"
          >
            <defs>
              <clipPath id="gitCompleted">
                <rect
                  x="0"
                  y="0"
                  :width="selectedNode?.x || 0"
                  :height="graph.height"
                />
              </clipPath>
            </defs>
            <g opacity=".25">
              <path
                v-for="edge in graph.edges"
                :key="edge.id"
                :d="edge.d"
                fill="none"
                :stroke="gitGroups[edge.group].color"
                stroke-width="2"
              />
            </g>
            <g clip-path="url(#gitCompleted)">
              <path
                v-for="edge in graph.edges"
                :key="edge.id"
                :d="edge.d"
                fill="none"
                :stroke="gitGroups[edge.group].color"
                stroke-width="3"
              />
            </g>
            <line
              v-if="selectedNode"
              :x1="selectedNode.x"
              :x2="selectedNode.x"
              y1="0"
              :y2="graph.height"
              stroke="var(--color-primary)"
              stroke-dasharray="4 4"
            />
            <circle
              v-for="node in graph.nodes"
              :key="node.id"
              :cx="node.x"
              :cy="node.y"
              :r="selected?.id === node.id ? 7 : 4"
              :fill="gitGroups[node.group].color"
              :opacity="node.x <= (selectedNode?.x || 0) ? 1 : 0.35"
              tabindex="0"
              role="button"
              :aria-label="`选择提交 ${node.subject}`"
              @click="selectCommit(node.id)"
              @keydown.enter="selectCommit(node.id)"
            >
              <title>
                {{ gitGroups[node.group].name }} · {{ node.subject }} ·
                {{ node.id.slice(0, 7) }}
              </title>
            </circle>
          </svg>
          <div class="git-commit-cards">
            <button
              v-for="commit in ordered"
              :key="commit.id"
              :data-commit="commit.id"
              class="git-commit-card"
              :class="{
                selected: commit.id === selected?.id,
                upcoming: commit.x > (selectedNode?.x || 0),
              }"
              :style="{ '--branch-color': gitGroups[commit.group].color }"
              :aria-pressed="commit.id === selected?.id"
              @click="selectCommit(commit.id)"
            >
              <span class="git-card-kind"
                >{{ gitGroups[commit.group].name }}
                <time>{{ commit.date.slice(0, 10) }}</time></span
              ><strong>{{ commit.subject }}</strong
              ><small
                >{{ commit.id.slice(0, 7)
                }}{{ commit.parents.length > 1 ? " · 合并" : "" }}</small
              ><em v-if="commit.refs">{{ commit.refs }}</em>
            </button>
          </div>
        </div>
      </div>
      <div class="timeline-controls">
        <button
          class="utility-button"
          :disabled="index >= rows.length - 1"
          @click="index++"
        >
          ← 较早</button
        ><label class="timeline-range"
          >时间定位<input
            v-model.number="position"
            type="range"
            min="0"
            :max="Math.max(0, rows.length - 1)"
            :style="{ '--range-fill': `${fill}%` }"
            aria-label="切换 Git 提交时间轴"
          /><small>{{
            selected?.date?.slice(0, 16).replace("T", " ")
          }}</small></label
        ><button class="utility-button" :disabled="index <= 0" @click="index--">
          较新 →
        </button>
      </div>
      <article class="git-change-panel">
        <header class="git-change-header">
          <div>
            <p class="eyebrow">
              {{
                selected?.parents.length > 1 ? "MERGE / FIRST PARENT" : "COMMIT"
              }}
              · {{ selected?.id.slice(0, 7) }}
            </p>
            <h2>{{ selected?.subject }}</h2>
            <p class="caption muted">
              {{ files.length }} 个文件
              <span class="diff-add-count">＋{{ totals.added }}</span>
              <span class="diff-delete-count">－{{ totals.deleted }}</span>
            </p>
          </div>
          <div class="segmented-control">
            <button
              :class="{ selected: mode === 'files' }"
              @click="mode = 'files'"
            >
              文件变更</button
            ><button
              :class="{ selected: mode === 'diff' }"
              @click="mode = 'diff'"
            >
              代码差异
            </button>
          </div>
        </header>
        <div v-if="detailBusy" class="empty-state">正在读取提交…</div>
        <template v-else-if="detail"
          ><p v-if="detail.patchTruncated" class="feedback">
            代码差异超过展示上限；当前为前 1 MiB，文件统计完整。
          </p>
          <div
            class="git-file-workspace"
            :class="{ 'diff-mode': mode === 'diff' }"
          >
            <section class="git-file-list">
              <label class="git-file-search"
                ><input
                  v-model="fileQuery"
                  type="search"
                  class="form-control"
                  aria-label="筛选变更文件"
                  placeholder="按路径筛选文件"
              /></label>
              <p v-if="!visibleFiles.length" class="empty-state">
                没有匹配的文件。
              </p>
              <button
                v-for="file in visibleFiles"
                :key="file.path"
                class="git-file-row"
                :class="{
                  selected: mode === 'diff' && chosenFile?.path === file.path,
                }"
                @click="chooseFile(file)"
              >
                <span class="git-file-symbol">{{
                  file.additions === 0 ? "−" : file.deletions === 0 ? "+" : "±"
                }}</span
                ><span class="git-file-path">{{ file.path }}</span
                ><span v-if="file.binary" class="caption muted">二进制</span
                ><span v-else class="git-file-counts"
                  ><b class="diff-add-count">＋{{ file.additions ?? "—" }}</b
                  ><b class="diff-delete-count"
                    >－{{ file.deletions ?? "—" }}</b
                  ></span
                >
              </button>
            </section>
            <section v-if="mode === 'diff'" class="git-code-view">
              <header>
                <strong>{{ chosenFile?.path || "选择文件" }}</strong
                ><span>原行 / 新行</span>
              </header>
              <div v-if="chosenPatch?.hunks.length" class="git-code-scroll">
                <table class="git-code-table">
                  <tbody
                    v-for="(hunk, hunkIndex) in chosenPatch.hunks"
                    :key="hunkIndex"
                  >
                    <tr class="diff-hunk">
                      <td colspan="4">{{ hunk.header }}</td>
                    </tr>
                    <tr
                      v-for="(line, lineIndex) in hunk.lines"
                      :key="lineIndex"
                      :class="`diff-${line.kind}`"
                    >
                      <td class="diff-line-number">{{ line.oldNumber }}</td>
                      <td class="diff-line-number">{{ line.newNumber }}</td>
                      <td class="diff-marker">
                        {{
                          line.kind === "add"
                            ? "+"
                            : line.kind === "delete"
                              ? "−"
                              : ""
                        }}
                      </td>
                      <td class="diff-source">
                        <code>{{ line.text || " " }}</code>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="empty-state">
                {{
                  chosenFile?.binary
                    ? "二进制文件不显示文本差异。"
                    : "此文件没有可展示的代码差异；生成页面、配置与非代码资料仅列出文件统计。"
                }}
              </p>
            </section>
          </div></template
        >
      </article>
    </template>
  </section>
</template>
