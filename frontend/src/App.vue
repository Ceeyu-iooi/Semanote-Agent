<script setup>
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  watch,
} from "vue";
import AnnotationCanvas from "./components/AnnotationCanvas.vue";
import AppIcon from "./components/AppIcon.vue";
import Hint from "./components/Hint.vue";
import StatisticsView from "./components/StatisticsView.vue";
import DocumentInsights from "./components/DocumentInsights.vue";
import ModelLogs from "./components/ModelLogs.vue";
import ModelProviders from "./components/ModelProviders.vue";
import ExtraLayerEditor from "./components/ExtraLayerEditor.vue";
import TopNavigation from "./components/TopNavigation.vue";
import ExtractionRail from "./components/ExtractionRail.vue";
import FrequencyDetails from "./components/FrequencyDetails.vue";
import DashboardView from "./components/DashboardView.vue";
import deepseekLogo from "./assets/deepseek.svg";
import {
  request,
  send,
  taskNames,
  entityNames,
  stateNames,
  labelNames,
} from "./api.js";
import { createRequestId } from "./requestIdentity.js";
import {
  resolveDisplayLayers,
  sourcePositions as positions,
} from "./annotationPresentation.js";

const page = ref("dashboard"),
  documents = ref([]),
  jobs = ref([]),
  statistics = ref(null),
  meta = ref(null);
const loading = ref(true),
  refreshBusy = ref(false),
  loadError = ref(""),
  notice = ref(""),
  actionError = ref("");
const query = ref(""),
  showArchived = ref(false),
  selectedIds = ref([]),
  current = ref(null);
watch(
  () => [page.value, current.value?.id],
  async () => {
    await nextTick();
    document.querySelector('.main-content')?.scrollTo({ top: 0, behavior: "instant" });
  },
);
const candidate = ref(null),
  historicalSnapshot = ref(null),
  history = ref(null),
  showHistory = ref(false);
const graphFocus = ref(null);
const activeLayer = ref("ner"),
  focusedIds = ref([]),
  editing = ref(false),
  draftLayers = ref({}),
  selection = ref(null);
const chosenLabel = ref("PERSON"),
  segmentationInput = ref(""),
  allowPartial = ref(false);
const savingDocumentIds = reactive(new Set());
const saving = computed(() => savingDocumentIds.has(current.value?.id));
const conflictPending = ref(false),
  conflictReviewed = ref(true),
  draftBaseSnapshotId = ref(null);
const editorDialog = ref(null),
  modelDialog = ref(null),
  importInput = ref(null);
const editor = reactive({
  id: null,
  rowVersion: null,
  title: "",
  text: "",
  originalTitle: "",
  originalText: "",
});
const editorError = ref(""),
  modelError = ref(""),
  importBusy = ref(false),
  editorBusy = ref(false);
const editorConflict = ref(false),
  editorLatest = ref(null);
const modelTargets = ref([]),
  remoteConsent = ref(false),
  provider = ref("deepseek"),
  modelBusy = ref(false),
  retryTarget = ref(null);
const selectedTasks = ref(Object.keys(taskNames));
const extraEditIndices = reactive({}),
  pendingExtraForms = reactive(new Set());
const extraEditIndex = computed({
  get: () => extraEditIndices[activeLayer.value] ?? null,
  set: (value) => {
    extraEditIndices[activeLayer.value] = value;
  },
});
const detailTaskNames = computed(() =>
  Object.fromEntries(
    Object.entries(taskNames).filter(
      ([task]) =>
        editing.value ||
        !["segmentation", "paragraphs", "relations", "events", "semantic"].includes(task),
    ),
  ),
);
const detailAllowed = computed(
  () =>
    editing.value || Object.hasOwn(detailTaskNames.value, activeLayer.value),
);
const detailLayer = computed(() => detailAllowed.value ? activeLayer.value : "ner");
const frequencyMap = computed(() =>
  displayItems.value.reduce((map, item) => {
    const key = JSON.stringify([item.itemText, item.label]);
    map.set(key, (map.get(key) || 0) + (item.spans?.length || 0));
    return map;
  }, new Map()),
);
const itemFrequency = (item) =>
  frequencyMap.value.get(JSON.stringify([item.itemText, item.label])) || 0;
const detailRows = computed(() => displayItems.value.map((item, index) => ({ item, index })));
watch(editing, (value) => {
  if (!value) pendingExtraForms.clear();
});
let pollTimer,
  refreshSequence = 0,
  documentSequence = 0,
  editSession = 0,
  historySequence = 0,
  editorSession = 0;
const filteredDocuments = computed(() =>
  documents.value.filter(
    (item) =>
      Boolean(item.archived) === showArchived.value &&
      `${item.title}\n${item.searchText ?? item.preview}`
        .toLowerCase()
        .includes(query.value.toLowerCase()),
  ),
);
const activeCount = computed(
  () => documents.value.filter((item) => !item.archived).length,
);
const runningJobs = computed(() =>
  jobs.value.filter((job) => ["queued", "running"].includes(job.state)),
);
const jobTab = ref("pending");
const visibleJobs = computed(() => jobs.value.filter((job) => (job.state === "success") === (jobTab.value === "completed")));
const displayText = computed(
  () =>
    historicalSnapshot.value?.revision.textBody ??
    candidate.value?.request?.text ??
    current.value?.revision.textBody ??
    "",
);
const displayRevisionId = computed(
  () =>
    historicalSnapshot.value?.revisionId ??
    candidate.value?.revisionId ??
    current.value?.currentRevisionId,
);
const isHistorical = computed(
  () =>
    Boolean(historicalSnapshot.value) ||
    displayRevisionId.value !== current.value?.currentRevisionId,
);
const visibleLayers = computed(() =>
  resolveDisplayLayers(
    historicalSnapshot.value,
    candidate.value,
    current.value?.snapshot,
  ),
);
const displayItems = computed(() => {
  if (editing.value) return draftItems(activeLayer.value);
  return visibleLayers.value[detailLayer.value]?.result?.items || [];
});
const displayRevisionNumber = computed(
  () =>
    historicalSnapshot.value?.revision.revisionNumber ??
    (displayRevisionId.value === current.value?.currentRevisionId
      ? current.value?.revision.revisionNumber
      : "历史"),
);
const currentState = computed(() =>
  sourceEditing.value
    ? "原文草稿 · 未保存"
    : editing.value
      ? "人工草稿 · 未保存"
      : historicalSnapshot.value
        ? historicalSnapshot.value.id
          ? "历史快照 · 只读"
          : "历史原文 · 无标注"
        : candidate.value
          ? `自动候选 · ${stateNames[candidate.value.state] || candidate.value.state}`
          : current.value?.snapshot
            ? "已保存快照"
            : "尚未标注",
);
const currentJob = computed(
  () =>
    candidate.value && jobs.value.find((job) => job.id === candidate.value.id),
);

function message(error) {
  return error?.message || "操作未完成，请重试。";
}
function timestamp(value) {
  return value
    ? new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "";
}
function shortId(value) {
  return value?.slice(0, 8);
}
async function refresh() {
  const sequence = ++refreshSequence;
  refreshBusy.value = true;
  try {
    const results = await Promise.all([
      request("/documents"),
      request("/jobs"),
      request("/statistics"),
      request("/meta"),
    ]);
    if (sequence !== refreshSequence) return;
    [documents.value, jobs.value, statistics.value, meta.value] = results;
    loadError.value = "";
  } catch (error) {
    if (sequence === refreshSequence) loadError.value = message(error);
  } finally {
    if (sequence === refreshSequence) {
      loading.value = false;
      refreshBusy.value = false;
    }
  }
}
function leaveDraft() {
  const sourceDirty =
    sourceEditing.value &&
    (editor.text !== editor.originalText ||
      editor.title !== editor.originalTitle);
  return (
    (!editing.value && !sourceDirty) ||
    window.confirm("修改尚未保存，确定放弃本次修改？")
  );
}
function navigate(destination) {
  if (!leaveDraft()) return;
  documentSequence++;
  editSession++;
  editing.value = false;
  sourceEditing.value = false;
  page.value = destination;
  actionError.value = "";
  selection.value = null;
  if (destination === "statistics") refresh();
}
async function openDocument(id) {
  if (!leaveDraft()) return false;
  editing.value = false;
  sourceEditing.value = false;
  editSession++;
  historySequence++;
  history.value = null;
  showHistory.value = false;
  const session = editSession;
  const sequence = ++documentSequence;
  actionError.value = "";
  notice.value = "";
  try {
    const document = await request(`/documents/${id}`);
    if (sequence !== documentSequence || session !== editSession) return false;
    current.value = document;
    candidate.value = null;
    historicalSnapshot.value = null;
    showHistory.value = false;
    focusedIds.value = [];
    editing.value = false;
    editSession++;
    conflictPending.value = false;
    conflictReviewed.value = true;
    allowPartial.value = false;
    selection.value = null;
    page.value = "workspace";
    return true;
  } catch (error) {
    actionError.value = message(error);
    return false;
  }
}
async function openCandidate(id) {
  if (!leaveDraft()) return;
  editing.value = false;
  sourceEditing.value = false;
  editorSession++;
  const sequence = ++documentSequence;
  const job = await request(`/jobs/${id}`).catch((error) => {
    actionError.value = message(error);
  });
  if (!job || sequence !== documentSequence) return;
  const opened = await openDocument(job.documentId);
  if (
    opened &&
    current.value?.id === job.documentId &&
    page.value === "workspace"
  ) {
    candidate.value = job;
    historicalSnapshot.value = null;
  }
}
function openEditor(document = null) {
  if (editorBusy.value) return;
  editorSession++;
  const text = document?.revision.textBody ?? "";
  Object.assign(editor, {
    id: document?.id ?? null,
    rowVersion: document?.rowVersion ?? null,
    title: document?.title ?? "",
    text,
    originalTitle: document?.title ?? "",
    originalText: text,
  });
  editorError.value = "";
  editorConflict.value = false;
  editorLatest.value = null;
  editorDialog.value.showModal();
}
function closeEditor() {
  if (editorBusy.value) return;
  if (
    (editor.title !== editor.originalTitle ||
      editor.text !== editor.originalText) &&
    !window.confirm("文本尚未保存，确定关闭？")
  )
    return;
  editorSession++;
  editorDialog.value.close();
}
async function saveText() {
  if (editorBusy.value) return;
  const savedId = editor.id,
    session = editorSession,
    documentSession = documentSequence,
    wasInline = sourceEditing.value;
  const body = {
    title: editor.title,
    text: editor.text,
    rowVersion: editor.rowVersion,
  };
  const stillOwnsEditor = () =>
    editorSession === session &&
    editor.id === savedId &&
    (!wasInline ||
      (sourceEditing.value &&
        current.value?.id === savedId &&
        documentSequence === documentSession));
  editorBusy.value = true;
  editorError.value = "";
  try {
    const document = await send(
      savedId ? `/documents/${savedId}` : "/documents",
      body,
      savedId ? "PUT" : "POST",
    );
    await refresh();
    if (stillOwnsEditor()) {
      sourceEditing.value = false;
      editorDialog.value.close();
      await openDocument(document.id);
    }
    notice.value = "文本已保存。";
  } catch (error) {
    if (stillOwnsEditor()) {
      editorError.value = message(error);
      if (error.status === 409) editorConflict.value = true;
    }
  } finally {
    editorBusy.value = false;
  }
}
const importDragDepth = ref(0);
const dragHasFiles = event => Array.from(event.dataTransfer?.types || []).includes("Files");
function enterImportZone(event) {
  if (!dragHasFiles(event)) return;
  event.preventDefault();
  if (!importBusy.value) importDragDepth.value++;
}
function overImportZone(event) {
  if (!dragHasFiles(event)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = importBusy.value ? "none" : "copy";
}
function leaveImportZone() {
  importDragDepth.value = Math.max(0, importDragDepth.value - 1);
}
function dropImportFiles(event) {
  if (!dragHasFiles(event)) return;
  event.preventDefault();
  importDragDepth.value = 0;
  void importFiles(Array.from(event.dataTransfer.files));
}
function selectImportFiles(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = "";
  void importFiles(files);
}
const importDialog = ref(null), importChoice = ref(null), importProgress = ref(null);
const exitDialog = ref(null), exitBusy = ref(false), exitError = ref(""), stopped = ref(false);
function previewCsv(file) {
  const worker = new Worker(new URL("./csvPreview.js", import.meta.url), { type: "module" });
  return new Promise((resolve, reject) => {
    worker.onmessage = ({ data }) => data.error ? reject(new Error(data.error)) : resolve(data.count);
    worker.onerror = () => reject(new Error("CSV 预览无法读取。"));
    worker.postMessage(file);
  }).finally(() => worker.terminate());
}
async function chooseCsvLimit(file) {
  const count = await previewCsv(file);
  if (!count) return 0;
  importChoice.value = { name: file.name, count, limit: count };
  await nextTick();
  const dialog = importDialog.value;
  dialog.returnValue = "";
  const result = new Promise((resolve) => dialog.addEventListener("close", () => {
    resolve(dialog.returnValue === "import" ? importChoice.value.limit : null);
  }, { once: true }));
  dialog.showModal();
  return result;
}
async function uploadFile(file, limit) {
  const form = new FormData(), id = createRequestId();
  form.append("file", file);
  form.append("requestId", id);
  if (limit) form.append("limit", String(limit));
  importProgress.value = { name: file.name, completed: 0, total: null };
  const controller = new AbortController();
  let pending = false;
  const poll = setInterval(async () => {
    if (pending) return;
    pending = true;
    try {
      const checkpoint = await request("/imports/" + id, { signal: controller.signal });
      if (!controller.signal.aborted && checkpoint) importProgress.value = { name: file.name, ...checkpoint };
    } catch { /* A progress read can fail independently of the import. */ }
    finally { pending = false; }
  }, 180);
  try { return await request("/imports", { method: "POST", body: form }); }
  finally { clearInterval(poll); controller.abort(); importProgress.value = null; }
}
function openExit() {
  exitError.value = "";
  exitDialog.value.showModal();
}
async function stopWorkspace() {
  if (exitBusy.value || !leaveDraft()) return;
  exitBusy.value = true;
  exitError.value = "";
  try {
    await send("/shutdown", { confirm: true });
    exitDialog.value.close();
    stopped.value = true;
    clearInterval(pollTimer);
    window.removeEventListener("beforeunload", beforeUnload);
  } catch (error) { exitError.value = message(error); }
  finally { exitBusy.value = false; }
}
async function importFiles(files) {
  if (!files.length || importBusy.value) return;
  importBusy.value = true;
  actionError.value = "";
  notice.value = "";
  let imported = 0, skipped = 0, completed = 0;
  const failures = [];
  try {
    for (const file of files) {
      try {
        const limit = /\.csv$/i.test(file.name) ? await chooseCsvLimit(file) : undefined;
        if (limit === null) continue;
        const result = await uploadFile(file, limit);
        imported += result.importedCount;
        skipped += result.skippedCount;
        completed++;
      } catch (error) {
        failures.push(`${file.name}：${message(error)}`);
      }
    }
    if (completed) {
      await refresh();
      notice.value = `已导入 ${imported.toLocaleString()} 份文本${skipped ? `，跳过 ${skipped.toLocaleString()} 个空白单元` : ""}。`;
    }
    if (failures.length) actionError.value = failures.join("；");
  } finally {
    importBusy.value = false;
  }
}
function clearHiddenSelection() {
  selectedIds.value = [];
}
async function archiveDocument(document, archived) {
  if (editing.value && !leaveDraft()) return;
  const session = editSession;
  try {
    const updated = await send(`/documents/${document.id}/archive`, {
      rowVersion: document.rowVersion,
      archived,
    });
    if (current.value?.id === document.id && session === editSession) {
      editing.value = false;
      current.value = updated;
    }
    await refresh();
    selectedIds.value = selectedIds.value.filter((id) => id !== document.id);
    notice.value = archived ? "文本已归档，可在归档列表恢复。" : "文本已恢复。";
  } catch (error) {
    actionError.value = message(error);
  }
}
function showModel(targets, retryJob = null) {
  if (targets.length > 500) {
    actionError.value = "单批最多 500 份文本，请减少选择。";
    return;
  }
  if (editing.value) {
    actionError.value = "请先保存或取消人工草稿。";
    return;
  }
  modelTargets.value = targets;
  retryTarget.value = retryJob;
  remoteConsent.value = false;
  modelError.value = "";
  modelDialog.value.showModal();
}
async function startModel() {
  if (modelBusy.value) return;
  if (!remoteConsent.value) {
    modelError.value = "请先确认这些文本允许发送到所选模型。";
    return;
  }
  if (!retryTarget.value && !selectedTasks.value.length) {
    modelError.value = "请选择至少一项任务。";
    return;
  }
  modelBusy.value = true;
  modelError.value = "";
  const failures = [],
    submittedIds = [];
  try {
    if (retryTarget.value) {
      const job = await send(`/jobs/${retryTarget.value.id}/retry`, {
        requestId: createRequestId(),
        remoteConsent: true,
      });
      submittedIds.push(job.id);
    } else {
      for (const document of modelTargets.value) {
        try {
          const job = await send("/jobs", {
            requestId: createRequestId(),
            documentId: document.id,
            revisionId: document.currentRevisionId,
            tasks: selectedTasks.value,
            provider: provider.value,
            remoteConsent: true,
          });
          submittedIds.push(job.id);
        } catch (error) {
          failures.push(`${document.title}：${message(error)}`);
        }
      }
    }
    await refresh();
    if (!submittedIds.length) {
      modelError.value = failures.join("；") || "未提交任务。";
      return;
    }
    modelDialog.value.close();
    notice.value = `已提交 ${submittedIds.length} 个任务；完成后请审阅并保存候选。${failures.length ? ` ${failures.length} 个未提交：${failures.join("；")}` : ""}`;
    if (submittedIds.length === 1) await openCandidate(submittedIds[0]);
    else page.value = "jobs";
  } catch (error) {
    modelError.value = message(error);
  } finally {
    modelBusy.value = false;
  }
}
function rawFromLayers(layers) {
  const raw = {};
  for (const [task, layer] of Object.entries(layers)) {
    if (layer.status !== "success") continue;
    raw[task] = layer.result.items.map((item, index) => {
      if (task === "pos") return { tokenIndex: index, label: item.label };
      if (task === "ner")
        return {
          itemText: item.itemText,
          label: item.label,
          occurrence: positions(displayText.value, item.itemText).indexOf(
            item.spans[0].start,
          ),
        };
      if (!["segmentation", "keywords"].includes(task)) {
        const raw = {
          itemText: item.itemText,
          occurrence: positions(displayText.value, item.itemText).indexOf(
            item.spans[0].start,
          ),
        };
        if (item.label) raw.label = item.label;
        if (task === "relations")
          for (const role of ["subject", "object"])
            raw[role] = {
              itemText: item[role].itemText,
              occurrences: item[role].spans.map((span) =>
                positions(displayText.value, item[role].itemText).indexOf(
                  span.start,
                ),
              ),
            };
        if (task === "events")
          raw.roles = Object.fromEntries(
            Object.entries(item.roles).map(([role, entries]) => [
              role,
              entries.map((entry) => ({
                itemText: entry.itemText,
                occurrences: entry.spans.map((span) =>
                  positions(displayText.value, entry.itemText).indexOf(
                    span.start,
                  ),
                ),
              })),
            ]),
          );
        if (task === "errors") {
          raw.suggestion = item.suggestion;
          raw.explanation = item.explanation;
        }
        return raw;
      }
      return { itemText: item.itemText };
    });
  }
  return raw;
}
function beginEditing() {
  if (
    sourceEditing.value ||
    processing.value ||
    isHistorical.value ||
    current.value?.archived ||
    saving.value
  )
    return;
  for (const task of Object.keys(extraEditIndices))
    delete extraEditIndices[task];
  pendingExtraForms.clear();
  editSession++;
  conflictPending.value = false;
  conflictReviewed.value = true;
  draftBaseSnapshotId.value = current.value.currentSnapshotId;
  draftLayers.value = rawFromLayers(visibleLayers.value);
  if (!Object.keys(draftLayers.value).length) draftLayers.value = { ner: [] };
  segmentationInput.value = (draftLayers.value.segmentation || [])
    .map((item) => item.itemText)
    .join("\n");
  editing.value = true;
  selection.value = null;
  actionError.value = "";
  allowPartial.value = false;
}
function draftItems(task) {
  const raw = draftLayers.value[task];
  if (!raw) return [];
  if (task === "pos") {
    const tokens = draftItems("segmentation");
    return raw.map((item, index) => ({
      ...tokens[index],
      itemId: `pos-${index}`,
      label: item.label,
    }));
  }
  let cursor = 0;
  return raw.map((item, index) => {
    let spans = [];
    if (task === "segmentation" || task === "paragraphs") {
      const text = Array.from(displayText.value);
      while (
        task !== "paragraphs" &&
        cursor < text.length &&
        /\s/u.test(text[cursor])
      )
        cursor++;
      const end = cursor + Array.from(item.itemText).length;
      if (text.slice(cursor, end).join("") === item.itemText)
        spans = [{ start: cursor, end, surfaceText: item.itemText }];
      cursor = end;
    } else {
      let starts = positions(displayText.value, item.itemText);
      if (task !== "keywords")
        starts = starts.slice(item.occurrence || 0, (item.occurrence || 0) + 1);
      spans = starts.map((start) => ({
        start,
        end: start + Array.from(item.itemText).length,
        surfaceText: item.itemText,
      }));
    }
    const result = { ...item, itemId: `${task}-${index}`, spans };
    const roleItem = (value) => {
      const word = typeof value === "string" ? value : value.itemText;
      let starts = positions(displayText.value, word);
      if (value?.occurrences)
        starts = value.occurrences
          .map((index) => starts[index])
          .filter((start) => start !== undefined);
      return {
        itemText: word,
        spans: starts.map((start) => ({
          start,
          end: start + Array.from(word).length,
          surfaceText: word,
        })),
      };
    };
    if (task === "relations") {
      result.subject = roleItem(item.subject || "");
      result.object = roleItem(item.object || "");
    }
    if (task === "events")
      result.roles = Object.fromEntries(
        Object.entries(item.roles || {}).map(([role, entries]) => [
          role,
          entries.map(roleItem),
        ]),
      );
    return result;
  });
}
function enableLayer(task) {
  draftLayers.value[task] = [];
}
function useSelection() {
  const selected = selection.value;
  if (!selected) return;
  if (!["ner", "keywords"].includes(activeLayer.value)) return;
  if (!draftLayers.value[activeLayer.value]) enableLayer(activeLayer.value);
  if (activeLayer.value === "ner") {
    const occurrence = positions(displayText.value, selected.text).indexOf(
      selected.start,
    );
    const item = {
      itemText: selected.text,
      label: chosenLabel.value,
      occurrence,
    };
    if (
      !draftLayers.value.ner.some(
        (old) =>
          old.itemText === item.itemText &&
          old.label === item.label &&
          old.occurrence === item.occurrence,
      )
    )
      draftLayers.value.ner.push(item);
  } else if (
    !draftLayers.value.keywords.some((item) => item.itemText === selected.text)
  )
    draftLayers.value.keywords.push({ itemText: selected.text });
  selection.value = null;
  window.getSelection()?.removeAllRanges();
}
function applySegmentation() {
  draftLayers.value.segmentation = segmentationInput.value
    .split("\n")
    .filter((word) => word !== "")
    .map((itemText) => ({ itemText }));
  delete draftLayers.value.pos;
  notice.value = "已更新分词草稿；词性依赖已清除，可按新分词重新填写。";
}
function createPos() {
  draftLayers.value.pos = (draftLayers.value.segmentation || []).map(
    (item, tokenIndex) => ({ tokenIndex, label: "" }),
  );
}
async function saveAnnotation(automatic = false) {
  if (saving.value || !current.value) return;
  if (!automatic && pendingExtraForms.size) {
    actionError.value = `请先应用或取消未完成的条目编辑：${[...pendingExtraForms].map((task) => taskNames[task]).join("、")}。`;
    return;
  }
  if (
    !automatic &&
    segmentationInput.value.split("\n").filter(Boolean).join("\n") !==
      (draftLayers.value.segmentation || [])
        .map((item) => item.itemText)
        .join("\n")
  ) {
    actionError.value = "分词输入尚未应用，请先应用分词或还原输入。";
    return;
  }
  if (!conflictReviewed.value) {
    actionError.value = "请先核对最新原文及各层草稿，再确认保存。";
    return;
  }
  actionError.value = "";
  const id = current.value.id,
    session = editSession,
    revisionId = current.value.currentRevisionId;
  const savedTitle = current.value.title;
  savingDocumentIds.add(id);
  try {
    const body = {
      rowVersion: current.value.rowVersion,
      revisionId: current.value.currentRevisionId,
      allowPartial: allowPartial.value,
    };
    if (automatic) body.candidateId = candidate.value.id;
    else {
      body.layers = draftLayers.value;
      body.baseSnapshotId = draftBaseSnapshotId.value;
      if (candidate.value) body.candidateJobId = candidate.value.id;
    }
    await send(`/documents/${id}/snapshots`, body);
    await refresh();
    if (
      current.value?.id === id &&
      editSession === session &&
      current.value.currentRevisionId === revisionId &&
      page.value === "workspace"
    ) {
      editing.value = false;
      await openDocument(id);
    }
    notice.value = `“${savedTitle}”快照已保存；统计与 JSON 导出已使用这一版本。`;
  } catch (error) {
    if (current.value?.id === id && editSession === session) {
      actionError.value = message(error);
      if (error.status === 409) conflictPending.value = true;
    }
  } finally {
    savingDocumentIds.delete(id);
  }
}
async function toggleHistory() {
  showHistory.value = !showHistory.value;
  const id = current.value.id,
    sequence = documentSequence,
    historyRequest = ++historySequence;
  if (showHistory.value)
    try {
      const result = await request(`/documents/${id}/revisions`);
      if (
        current.value?.id === id &&
        documentSequence === sequence &&
        historySequence === historyRequest &&
        showHistory.value
      )
        history.value = result;
    } catch (error) {
      if (current.value?.id === id) actionError.value = message(error);
    }
}
async function viewHistory(snapshotId) {
  if (!leaveDraft()) return;
  editing.value = false;
  sourceEditing.value = false;
  editorSession++;
  extraEditIndex.value = null;
  const id = current.value.id,
    sequence = documentSequence,
    session = editSession,
    historyRequest = ++historySequence;
  try {
    const result = await request(`/documents/${id}/snapshots/${snapshotId}`);
    if (
      current.value?.id === id &&
      documentSequence === sequence &&
      editSession === session &&
      historySequence === historyRequest &&
      !editing.value
    ) {
      historicalSnapshot.value = result;
      candidate.value = null;
    }
  } catch (error) {
    actionError.value = message(error);
  }
}
async function reloadKeepingDraft() {
  const id = current.value?.id,
    session = editSession;
  if (!id) return;
  try {
    const fresh = await request(`/documents/${id}`);
    if (current.value?.id !== id || session !== editSession) return;
    const changed = fresh.currentRevisionId !== current.value.currentRevisionId;
    current.value = fresh;
    conflictPending.value = false;
    if (changed) {
      candidate.value = null;
      historicalSnapshot.value = null;
      selection.value = null;
      draftBaseSnapshotId.value = null;
      conflictReviewed.value = false;
    }
    notice.value = changed
      ? "已载入最新原文，人工草稿仍保留。请逐层核对区间、分词与词性，再确认保存。"
      : "已载入最新保存版本，人工草稿仍保留；核对后可再次保存。";
  } catch (error) {
    actionError.value = message(error);
  }
}
async function reloadTextVersion() {
  const id = editor.id,
    session = editorSession;
  try {
    const fresh = await request(`/documents/${id}`);
    if (
      editor.id !== id ||
      editorSession !== session ||
      (!editorDialog.value.open && !sourceEditing.value)
    )
      return;
    editor.rowVersion = fresh.rowVersion;
    editorLatest.value = fresh;
    editorConflict.value = false;
    editorError.value =
      "已更新保存版本号，本地输入仍保留。请对照下面的最新原文，合并后再保存。";
  } catch (error) {
    editorError.value = message(error);
  }
}
function viewRevision(revision) {
  if (!leaveDraft()) return;
  if (revision.documentId !== current.value?.id) return;
  historySequence++;
  editing.value = false;
  sourceEditing.value = false;
  editorSession++;
  extraEditIndex.value = null;
  candidate.value = null;
  historicalSnapshot.value = {
    id: null,
    revisionId: revision.id,
    revision,
    layers: {},
  };
}
function returnCurrent() {
  historySequence++;
  historicalSnapshot.value = null;
  candidate.value = null;
}
async function pollJobs() {
  progressNow.value = Date.now();
  try {
    if (!runningJobs.value.length && !processing.value) return;
    jobs.value = await request("/jobs");
    if (
      candidate.value &&
      ["queued", "running"].includes(candidate.value.state)
    ) {
      const id = candidate.value.id,
        updated = await request(`/jobs/${id}`);
      if (candidate.value?.id === id && !editing.value)
        candidate.value = updated;
    }
  } catch {
    /* Existing results stay visible; an explicit refresh reports connection errors. */
  }
}
function beforeUnload(event) {
  if (editing.value || sourceEditing.value || editorDialog.value?.open) {
    event.preventDefault();
    event.returnValue = "";
  }
}
onMounted(async () => {
  await refresh();
  await loadModelPreferences();
  pollTimer = setInterval(pollJobs, 1000);
  window.addEventListener("beforeunload", beforeUnload);
});
onUnmounted(() => {
  clearInterval(pollTimer);
  window.removeEventListener("beforeunload", beforeUnload);
});

const libraryPage = ref(1),
  librarySource = ref("all"),
  sourceEditing = ref(false),
  settingsDialog = ref(null),
  settingsTab = ref("appearance"),
  settingsError = ref(""),
  settingsBusy = ref(false),
  settingsLoading = ref(false);
const overlayTasks = ["segmentation", "keywords", "pos", "ner", "paragraphs", "errors"];
const enabledLayers = ref(["keywords", "ner", "paragraphs"]),
  exportFormat = ref("json");
const defaultPreferences = {
  fontFamily: "system-ui, sans-serif",
  fontSize: 19,
  lineHeight: 2.1,
  compact: false,
  reduceMotion: false,
  paper: "white",
};
function readPreferences() {
  try {
    return {
      ...defaultPreferences,
      ...JSON.parse(localStorage.getItem("semanote.preferences") || "{}"),
    };
  } catch {
    return { ...defaultPreferences };
  }
}
const preferences = reactive(readPreferences());
const modelPreferences = ref({ provider: "aliyun", providers: [] });
const modelSettingsDraft = ref({ provider: "aliyun", providers: [] });
let settingsSequence = 0;
watch(
  preferences,
  (value) => {
    try {
      localStorage.setItem("semanote.preferences", JSON.stringify(value));
    } catch {}
    document.documentElement.dataset.motion = value.reduceMotion
      ? "reduced"
      : "full";
  },
  { deep: true, immediate: true },
);
watch([query, showArchived, librarySource], () => {
  libraryPage.value = 1;
  selectedIds.value = [];
});
const sourceDocuments = computed(() =>
  filteredDocuments.value.filter(
    (item) =>
      librarySource.value === "all" ||
      (item.source.kind === "corpus") === (librarySource.value === "corpus"),
  ),
);
const pageCount = computed(() =>
  Math.max(1, Math.ceil(sourceDocuments.value.length / 24)),
);
const pagedDocuments = computed(() =>
  sourceDocuments.value.slice(
    (Math.min(libraryPage.value, pageCount.value) - 1) * 24,
    Math.min(libraryPage.value, pageCount.value) * 24,
  ),
);
const corpusCount = computed(
  () =>
    documents.value.filter(
      (item) => !item.archived && item.source.kind === "corpus",
    ).length,
);
const combinedItems = computed(() =>
  enabledLayers.value.flatMap((task) =>
    (editing.value
      ? draftItems(task)
      : visibleLayers.value[task]?.result?.items || []
    )
      .filter((item) => item?.spans?.length)
      .map((item) => ({ ...item, task })),
  ),
);
const processing = computed(
  () =>
    candidate.value && ["queued", "running"].includes(candidate.value.state),
);
const progressNow = ref(Date.now());
const jobElapsed = computed(() =>
  Math.max(
    0,
    Math.floor(
      (progressNow.value -
        Date.parse(candidate.value?.createdAt || new Date().toISOString())) /
        1000,
    ),
  ),
);
const draftLayerCount = computed(() => Object.keys(draftLayers.value).length);
const completedLayers = computed(
  () =>
    Object.values(visibleLayers.value).filter(
      (layer) => layer.status === "success",
    ).length,
);
const effectiveTasks = computed(() => {
  const tasks =
    candidate.value?.response?.effectiveTasks ||
    candidate.value?.request?.tasks ||
    [];
  return [
    ...new Set([...tasks, ...(tasks.includes("pos") ? ["segmentation"] : [])]),
  ];
});
const settledLayers = computed(
  () =>
    effectiveTasks.value.filter((task) =>
      ["success", "failed"].includes(visibleLayers.value[task]?.status),
    ).length,
);
const chunkProgress = computed(() => {
  const p = candidate.value?.progress,
    execution = candidate.value?.response?.execution;
  if (p?.totalChunks)
    return Math.min(100, ((p.completedChunks || 0) / p.totalChunks) * 100);
  return execution?.chunks ? 100 : 0;
});
const totalLayers = computed(
  () => effectiveTasks.value.length || Object.keys(taskNames).length,
);
const insightLayers = computed(() =>
  editing.value
    ? Object.fromEntries(
        Object.keys(draftLayers.value).map((task) => [
          task,
          { status: "success", result: { items: draftItems(task) } },
        ]),
      )
    : visibleLayers.value,
);
const visualBreaks = computed(() => [
  ...new Set(
    ["paragraphs", "semantic"]
      .filter((task) => enabledLayers.value.includes(task))
      .flatMap((task) =>
        (insightLayers.value[task]?.result?.items || [])
          .map((item) => item.spans[0]?.start)
          .filter((start) => start !== undefined),
      ),
  ),
]);
function revealAnnotation(task, itemId, start = null) {
  const documentId = current.value?.id;
  if (itemId && overlayTasks.includes(task) && !enabledLayers.value.includes(task))
    enabledLayers.value.push(task);
  nextTick(() => {
    if (
      current.value?.id !== documentId ||
      (itemId && !focusedIds.value.includes(itemId))
    )
      return;
    document
      .querySelector(
        start !== null
          ? `.annotation-canvas [data-start="${start}"]`
          : itemId
            ? ".annotation-canvas .focused-text"
            : ["relations", "events"].includes(task)
              ? ".evidence-explorer"
              : ["paragraphs", "semantic"].includes(task)
                ? ".annotation-canvas"
            : ".annotation-inspector",
      )
      ?.scrollIntoView({
        block: "center",
        behavior:
          preferences.reduceMotion ||
          matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
      });
  });
}
const sourceEvidence = computed(() => {
  if (overlayTasks.includes(activeLayer.value)) return null;
  return insightLayers.value[activeLayer.value]?.result?.items
    ?.find(item => focusedIds.value.includes(item.itemId))?.spans?.[0];
});
function focusInsight({ task, itemId, locateSource = false }) {
  if (["relations", "events"].includes(task) && !locateSource) {
    graphFocus.value = { task, itemId };
    activeLayer.value = task;
    focusedIds.value = [];
    revealAnnotation(task, null);
    return;
  }
  activeLayer.value = task;
  focusedIds.value = itemId ? [itemId] : [];
  revealAnnotation(task, itemId, sourceEvidence.value?.start ?? null);
}
function focusInspector(item) {
  if (focusedIds.value.includes(item.itemId) && item.focusStart === undefined) {
    focusedIds.value = [];
    return;
  }
  focusedIds.value = [item.itemId];
  revealAnnotation(detailLayer.value, item.itemId, item.focusStart ?? null);
}
function addExtra(item) {
  if (!draftLayers.value[activeLayer.value])
    draftLayers.value[activeLayer.value] = [];
  if (extraEditIndex.value === null)
    draftLayers.value[activeLayer.value].push(item);
  else
    draftLayers.value[activeLayer.value].splice(extraEditIndex.value, 1, item);
  extraEditIndex.value = null;
  selection.value = null;
}
function canReplaceExtraForm() {
  if (!pendingExtraForms.has(activeLayer.value)) return true;
  actionError.value =
    "请先更新、添加或取消当前条目编辑，再切换编辑对象或移除标注。";
  return false;
}
function editExtra(index) {
  if (canReplaceExtraForm()) extraEditIndex.value = index;
}
function removeExtra(index) {
  if (!canReplaceExtraForm()) return;
  draftLayers.value[activeLayer.value].splice(index, 1);
  extraEditIndex.value = null;
  focusedIds.value = [];
}
const focusItems = computed(() =>
  displayItems.value.filter(
    (item) =>
      !focusedIds.value.length || focusedIds.value.includes(item.itemId),
  ),
);
function toggleLayer(task) {
  enabledLayers.value = enabledLayers.value.includes(task)
    ? enabledLayers.value.filter((value) => value !== task)
    : [...enabledLayers.value, task];
}
function focusAnnotations(ids) {
  if (editing.value && selection.value) return;
  const match =
    combinedItems.value.find(
      (item) => item.task === activeLayer.value && ids.includes(item.itemId),
    ) || combinedItems.value.find((item) => ids.includes(item.itemId));
  if (match) {
    activeLayer.value = match.task;
    focusedIds.value = [
      match.itemId,
      ...ids.filter((id) => id !== match.itemId),
    ];
  } else focusedIds.value = [];
}
function pendingExtra({ task, dirty }) {
  if (dirty) pendingExtraForms.add(task);
  else pendingExtraForms.delete(task);
}
function selectAnnotationRange(range) {
  selection.value = range;
  focusedIds.value = [];
  if (["segmentation", "pos"].includes(activeLayer.value))
    activeLayer.value = "ner";
}
function startSourceEditing() {
  if (editing.value || editorBusy.value) return;
  editorSession++;
  const document = current.value;
  Object.assign(editor, {
    id: document.id,
    rowVersion: document.rowVersion,
    title: document.title,
    text: document.revision.textBody,
    originalTitle: document.title,
    originalText: document.revision.textBody,
  });
  editorError.value = "";
  editorLatest.value = null;
  editorConflict.value = false;
  sourceEditing.value = true;
}
function cancelSourceEditing() {
  if (editorBusy.value) return;
  if (
    editor.text !== editor.originalText &&
    !window.confirm("放弃尚未保存的原文修改？")
  )
    return;
  sourceEditing.value = false;
  editorSession++;
}
async function loadModelPreferences() {
  try {
    modelPreferences.value = await request("/settings/model");
    provider.value = modelPreferences.value.provider;
  } catch {}
}
async function openSettings() {
  const sequence = ++settingsSequence;
  settingsError.value = "";
  settingsDialog.value.showModal();
  settingsLoading.value = true;
  try {
    const value = await request("/settings/model");
    if (sequence !== settingsSequence) return;
    modelPreferences.value = value;
    modelSettingsDraft.value = structuredClone(value);
    provider.value = value.provider;
  } catch (error) {
    if (sequence === settingsSequence) settingsError.value = message(error);
  } finally {
    if (sequence === settingsSequence) settingsLoading.value = false;
  }
}
async function saveSettings() {
  if (settingsLoading.value || settingsBusy.value) return;
  if (settingsTab.value === "appearance") {
    settingsDialog.value.close();
    notice.value = "界面设置已保存。";
    return;
  }
  settingsBusy.value = true;
  settingsError.value = "";
  try {
    modelPreferences.value = await send(
      "/settings/model",
      modelSettingsDraft.value,
      "PUT",
    );
    modelSettingsDraft.value = JSON.parse(
      JSON.stringify(modelPreferences.value),
    );
    provider.value = modelPreferences.value.provider;
    settingsDialog.value.close();
    notice.value = "设置已保存。";
  } catch (error) {
    settingsError.value = message(error);
  } finally {
    settingsBusy.value = false;
  }
}
function exportUrl() {
  const snapshot = historicalSnapshot.value
    ? historicalSnapshot.value.id
    : current.value?.currentSnapshotId;
  return snapshot
    ? `/api/v1/documents/${current.value.id}/exports/${snapshot}?format=${exportFormat.value}`
    : "#";
}
function canExport() {
  return historicalSnapshot.value
    ? Boolean(historicalSnapshot.value.id)
    : Boolean(
        !candidate.value &&
          !editing.value &&
          !sourceEditing.value &&
          current.value?.currentSnapshotId,
      );
}
function nextPage(delta) {
  libraryPage.value = Math.max(
    1,
    Math.min(pageCount.value, libraryPage.value + delta),
  );
}

</script>

<template>
  <div v-if="!stopped" class="workspace-app" :class="{ 'compact-mode': preferences.compact }">
    <TopNavigation
      :page="page"
      :active-count="activeCount"
      :running-count="runningJobs.length"
      :has-document="Boolean(current)"
      @navigate="navigate"
      @settings="openSettings"
      @exit="openExit"
    />
    <div class="app-layout">
      <main class="main-content" :class="{ 'workspace-content': page === 'workspace' }">
      <Transition name="page" mode="out-in" appear><div :key="page" class="page-content">
        <div v-if="loadError" role="alert" class="feedback error-feedback">
          <span>{{ loadError }}</span
          ><button class="text-action" @click="refresh">重新连接</button>
        </div>
        <div v-if="conflictPending && editing" class="feedback">
          <span>检测到其他页面的修改，草稿已保留。</span
          ><button class="text-action" @click="reloadKeepingDraft">
            载入最新版本
          </button>
        </div>
        <div v-if="actionError" role="alert" class="feedback error-feedback">
          <span>{{ actionError }}</span
          ><button class="text-action" @click="actionError = ''">关闭</button>
        </div>
        <div v-if="notice" role="status" class="feedback">
          <span>{{ notice }}</span
          ><button class="text-action" @click="notice = ''">知道了</button>
        </div>
        <div v-if="importProgress" class="surface import-progress" role="status">
          <strong>正在导入 {{ importProgress.name }}</strong>
          <progress v-if="importProgress.total" :value="importProgress.completed" :max="importProgress.total" aria-label="导入进度"></progress>
          <progress v-else aria-label="正在上传和检查文件"></progress>
          <span v-if="importProgress.total">{{ importProgress.completed.toLocaleString() }} / {{ importProgress.total.toLocaleString() }} 份，提交后完成</span>
          <span v-else>正在上传和检查文件…</span>
        </div>
        <div v-if="loading" class="empty-state">
          <span class="loading-indicator"></span>
          <h2>正在打开工作空间…</h2>
        </div>
        <div v-else-if="loadError && !meta" class="empty-state">
          <h2>暂时无法读取工作空间</h2>
          <p>请检查服务连接后重试。</p>
        </div>
        <DashboardView
          v-else-if="page === 'dashboard'"
          :documents="documents"
          :jobs="jobs"
          :statistics="statistics"
          @navigate="navigate"
          @open="openDocument"
          @create="openEditor()"
        />
        <div v-else-if="page === 'library'" class="library-import-zone"
          :class="{ 'is-file-over': importDragDepth > 0 }"
          @dragenter="enterImportZone" @dragover="overImportZone"
          @dragleave="leaveImportZone" @drop="dropImportFiles">
          <section class="page-heading">
            <div>
              <p class="eyebrow">YOUR WORDS, IN FOCUS</p>
              <h1>文本库<span class="heading-period">.</span></h1>
              <p class="muted">选择一段文字，开始发现。</p>
            </div>
            <div class="button-row">
              <button
                class="btn btn-outline-primary library-import-button"
                :disabled="importBusy"
                @click="importInput.click()"
              >
                <AppIcon name="import" />{{
                  importBusy ? "正在导入…" : "导入文本"
                }}</button
              ><button class="btn btn-primary" @click="openEditor()">
                <AppIcon name="plus" />新建文本</button
              ><input
                ref="importInput"
                class="visually-hidden"
                type="file"
                multiple
                accept=".txt,.md,.csv,.docx"
                aria-label="导入 DOCX、TXT、MD 或 CSV"
                @change="selectImportFiles"
              />
            </div>
          </section>
          <section class="library-summary">
            <div>
              <span class="summary-number">{{
                activeCount.toLocaleString()
              }}</span
              ><span>份文本</span>
            </div>
            <div class="summary-note">
              <strong>{{ corpusCount.toLocaleString() }} 份初始语料</strong
              ><span>多维标注 · 自动分析 · 人工校对</span>
            </div>
            <button class="text-action" @click="navigate('statistics')">
              查看统计 <AppIcon name="arrow" />
            </button>
          </section>
          <section class="surface library-surface">
            <div class="panel-toolbar">
              <div class="library-filters">
                <div class="segmented-control">
                  <button
                    :class="{ selected: !showArchived }"
                    @click="showArchived = false"
                  >
                    文本</button
                  ><button
                    :class="{ selected: showArchived }"
                    @click="showArchived = true"
                  >
                    归档
                  </button>
                </div>
                <select
                  v-model="librarySource"
                  class="form-select source-filter"
                  aria-label="文本来源"
                >
                  <option value="all">全部来源</option>
                  <option value="corpus">初始语料</option>
                  <option value="personal">我的文本</option>
                </select>
              </div>
              <label class="search-field"
                ><AppIcon name="search" /><input
                  v-model="query"
                  type="search"
                  placeholder="搜索文本或标题"
                  aria-label="搜索文本"
              /></label>
            </div>
            <div v-if="selectedIds.length" class="selection-toolbar">
              <strong>已选 {{ selectedIds.length }} 份</strong
              ><button
                class="text-action"
                @click="
                  showModel(
                    documents.filter((item) => selectedIds.includes(item.id)),
                  )
                "
              >
                批量自动标注</button
              ><button class="text-action" @click="selectedIds = []">
                取消选择
              </button>
            </div>
            <div v-if="!sourceDocuments.length" class="empty-state">
              <AppIcon name="library" />
              <h2>{{ query ? "没有匹配的文本" : "这里还没有文本" }}</h2>
              <button
                v-if="query"
                class="btn btn-outline-primary"
                @click="query = ''"
              >
                清空搜索</button
              ><button v-else class="btn btn-primary" @click="openEditor()">
                新建文本
              </button>
            </div>
            <div v-else class="compact-table-wrap library-table-wrap"><table class="compact-table"><colgroup><col class="library-select-col"><col><col class="library-time-col"><col class="library-state-col"><col class="library-action-col"></colgroup><thead><tr><th><span class="visually-hidden">选择</span></th><th>文件名称</th><th>更新时间</th><th>状态</th><th>操作</th></tr></thead><tbody>
              <tr v-for="document in pagedDocuments" :key="document.id">
                <td><label v-if="!showArchived" class="document-select"
                  ><input
                    v-model="selectedIds"
                    class="form-check-input"
                    type="checkbox"
                    :value="document.id"
                    :aria-label="`选择 ${document.title}`"
                /></label></td>
                <td><button class="table-title" @click="openDocument(document.id)">{{ document.title }}</button></td>
                <td>{{ timestamp(document.updatedAt) }}</td><td><span
                      class="quiet-badge"
                      :class="{ 'is-saved': document.currentSnapshotId }"
                      >{{
                        document.currentSnapshotId ? "已标注" : "待标注"
                      }}</span
                    ></td><td><Hint :text="showArchived ? '恢复到文本库' : '归档后可恢复'"
                  ><button
                    class="icon-button archive-action"
                    :aria-label="`${showArchived ? '恢复' : '归档'} ${document.title}`"
                    @click="archiveDocument(document, !showArchived)"
                  >
                    <AppIcon
                      :name="showArchived ? 'jobs' : 'library'"
                    /></button></Hint
                ><button v-if="!showArchived" class="icon-button library-open" :aria-label="`打开 ${document.title}`" @click="openDocument(document.id)">→</button></td>
              </tr></tbody></table></div>
            <footer class="list-footer">
                <span
                  >{{ sourceDocuments.length.toLocaleString() }} 份文本</span
                >
              <div class="pagination-controls">
                <button
                  class="utility-button"
                  :disabled="libraryPage <= 1"
                  @click="nextPage(-1)"
                >
                  上一页</button
                ><span>{{ libraryPage }} / {{ pageCount }}</span
                ><button
                  class="utility-button"
                  :disabled="libraryPage >= pageCount"
                  @click="nextPage(1)"
                >
                  下一页
                </button>
              </div>
            </footer>
          </section>
        </div>
        <template v-else-if="page === 'workspace' && current">
          <section class="workspace-heading">
            <div>
                <button
                  class="text-action caption"
                  @click="navigate('library')"
                >
                ← 文本库
              </button>
              <h1>{{ current.title }}</h1>
              <div class="workspace-meta">
                <span class="quiet-badge">{{ currentState }}</span
                ><span>{{ Array.from(displayText).length }} 字符</span
                ><span>修订 {{ displayRevisionNumber }}</span>
              </div>
            </div>
            <div class="button-row">
              <Hint text="查看文本修订和已保存的标注版本"
                ><button class="utility-button" @click="toggleHistory">
                  版本历史
                </button></Hint
              ><button
                v-if="!current.archived"
                class="btn btn-primary"
                :disabled="editing || sourceEditing || processing"
                @click="showModel([current])"
              >
                <AppIcon name="play" />{{
                  processing ? "正在标注" : "自动标注"
                }}
              </button>
            </div>
          </section>
          <div v-if="current.archived" class="feedback">
            <span>文本已归档</span
            ><button
              class="text-action"
              @click="archiveDocument(current, false)"
            >
              恢复文本
            </button>
          </div>
            <section
              v-if="showHistory && history"
              class="surface history-panel"
            >
            <h2>版本历史</h2>
            <div class="history-revisions">
              <button
                v-for="revision in history.revisions"
                :key="revision.id"
                class="utility-button"
                @click="viewRevision(revision)"
              >
                原文修订 {{ revision.revisionNumber }}</button
              ><button
                v-for="snapshot in history.snapshots"
                :key="snapshot.id"
                class="utility-button"
                @click="viewHistory(snapshot.id)"
              >
                {{ snapshot.producerKind === "manual" ? "人工" : "自动" }} ·
                {{ timestamp(snapshot.createdAt) }}
              </button>
            </div>
          </section>
          <div v-if="isHistorical" class="feedback">
            <span>正在查看历史修订</span
            ><button class="text-action" @click="returnCurrent">
              回到当前版本
            </button>
          </div>
          <section
            v-if="candidate"
            class="inference-progress"
            :class="{ 'is-processing': processing }"
          >
            <div class="compact-progress-label"><span>{{ processing ? (candidate.state === 'queued' ? '等待标注' : candidate.progress?.phase === 'validating' ? '正在校验标注' : '正在分析文本') : stateNames[candidate.state] }}</span><strong>{{ Math.round((settledLayers / Math.max(1, totalLayers)) * 100) }}%</strong></div>
            <div class="progress" role="progressbar" aria-label="标注进度" :aria-valuenow="Math.round(settledLayers / Math.max(1, totalLayers) * 100)" aria-valuemin="0" aria-valuemax="100"><div class="progress-bar" :style="{ width: settledLayers / Math.max(1,totalLayers) * 100 + '%' }"></div></div>
            <button class="text-action caption" @click="returnCurrent">
              返回当前保存版本
            </button>
            <p v-if="candidate.errorMessage" class="inline-error">
              {{ candidate.errorMessage }}
            </p>
            <div
              v-if="
                ['failed', 'partialFailure', 'interrupted'].includes(
                  candidate.state,
                )
              "
              class="button-row"
            >
              <span class="caption muted"
                >部分结果不可用，可保留成功层后重试。</span
              ><button
                class="text-action"
                @click="showModel([current], candidate)"
              >
                重试失败层
              </button>
            </div>
          </section>
          <div
            class="annotation-workspace immersive-workspace"
            :class="{ 'source-editing': sourceEditing }"
          >
            <ExtractionRail
              v-if="!sourceEditing"
                :tasks="[
                  'ner',
                  'keywords',
                  'pos',
                  'errors',
                ]"
              :layers="insightLayers"
              side="left"
              @activate="activeLayer = $event"
              :active-task="activeLayer"
              :processing="Boolean(processing)"
              :selected-tasks="effectiveTasks"
              :source="currentState"
              @focus="focusInsight"
            />
            <section
                class="editor-surface card"
                :class="{
                  'paper-parchment': preferences.paper === 'parchment',
                }"
            >
              <div class="editor-toolbar">
                <div class="tool-group">
                  <label class="sr-only" for="readingFont">字体</label
                  ><select
                    id="readingFont"
                      class="form-select form-select-sm"
                    v-model="preferences.fontFamily"
                    aria-label="字体"
                  >
                    <option value="system-ui, sans-serif">系统字体</option>
                    <option value="SimSun, serif">宋体</option>
                    <option value="KaiTi, serif">楷体</option>
                    <option value="monospace">等宽字体</option></select
                  ><label class="sr-only" for="readingSize">字号</label
                  ><select
                    id="readingSize"
                      class="form-select form-select-sm"
                    v-model.number="preferences.fontSize"
                    aria-label="字号"
                  >
                    <option
                      v-for="size in [16, 17, 19, 21, 24, 28]"
                      :key="size"
                      :value="size"
                    >
                      {{ size }}
                    </option></select
                  ><Hint text="调整正文行距"
                    ><select
                      v-model.number="preferences.lineHeight"
                      aria-label="行距"
                    >
                      <option
                        v-for="height in [1.5, 1.8, 2.1, 2.5]"
                        :key="height"
                        :value="height"
                      >
                        {{ height }} 倍
                      </option>
                    </select></Hint
                  >
                </div>
                <div class="tool-group">
                  <button
                    v-if="!sourceEditing"
                    class="tool-button"
                    :disabled="
                        editing ||
                        processing ||
                        isHistorical ||
                        current.archived
                    "
                    @click="startSourceEditing"
                  >
                    编辑原文</button
                  ><button
                    v-if="!editing && !sourceEditing"
                    class="tool-button"
                    :disabled="processing || isHistorical || current.archived"
                    @click="beginEditing"
                  >
                    人工标注</button
                  ><button
                    v-if="editing"
                    class="tool-button"
                    :disabled="saving"
                    @click="
                      editing = false;
                      selection = null;
                      actionError = '';
                    "
                  >
                    取消草稿</button
                  ><button
                    v-if="sourceEditing"
                    class="tool-button"
                    :disabled="editorBusy"
                    @click="cancelSourceEditing"
                  >
                    取消修改
                  </button>
                  <template v-if="!sourceEditing && canExport()">
                    <select v-model="exportFormat" class="form-select form-select-sm" aria-label="导出格式">
                      <option value="json">JSON</option>
                      <option value="md">Markdown</option>
                      <option value="txt">TXT</option>
                    </select>
                    <a class="tool-button text-action" :href="exportUrl()" download>导出结果 ↗</a>
                  </template>
                </div>
              </div>
              <div v-if="!sourceEditing" class="layer-toolbar layer-chips" role="group" aria-label="叠加图层">
                <span class="caption muted">叠加图层</span
                ><Hint
                  v-for="task in overlayTasks"
                  :key="task"
                  :text="
                    {
                      segmentation: '词语边界与分词底线',
                      keywords: '重要词语以波浪线表示',
                      pos: '按词性改变文本颜色',
                      ner: '按实体类别显示背景色',
                      paragraphs: '仅增加视觉换行，原文不变',
                    }[task] || taskNames[task] + '图层'
                  "
                  ><button
                    class="layer-toggle"
                    :class="[task, { enabled: enabledLayers.includes(task) }]"
                    :aria-pressed="enabledLayers.includes(task)"
                    @click="toggleLayer(task)"
                  >
                    <AppIcon :name="task" />{{ taskNames[task]
                    }}<span v-if="enabledLayers.includes(task)">✓</span>
                  </button></Hint
                >
              </div>
              <div v-if="sourceEditing" class="source-edit-area">
                <input
                  v-model="editor.title"
                  :disabled="editorBusy"
                  class="inline-title"
                  aria-label="文本标题"
                  maxlength="200"
                /><textarea
                  v-model="editor.text"
                  :disabled="editorBusy"
                  class="inline-source-editor"
                  aria-label="编辑原始文本"
                  :style="{
                    fontFamily: preferences.fontFamily,
                    fontSize: `${preferences.fontSize}px`,
                    lineHeight: preferences.lineHeight,
                  }"
                  maxlength="20000"
                ></textarea>
                <p v-if="editorError" class="inline-error" role="alert">
                  {{ editorError }}
                </p>
                <button
                  v-if="editorConflict"
                  class="text-action"
                  @click="reloadTextVersion"
                >
                  载入最新版本并保留输入
                </button>
                <details v-if="editorLatest">
                  <summary>对照最新原文</summary>
                  <p class="text-comparison">
                    {{ editorLatest.revision.textBody }}
                  </p>
                </details>
              </div>
              <div
                v-else
                class="document-page"
                :class="{ 'scanning-page': processing }"
              >
                <div class="document-running-label" v-if="processing">
                  <span class="loading-indicator"></span>正在分析 ·
                  已返回图层实时呈现
                </div>
                <p class="document-page-label">
                  {{
                    current.source.kind === "corpus"
                      ? "CORPUS / 原始语料"
                      : "DOCUMENT / 原始文本"
                  }}
                </p>
                <AnnotationCanvas
                  :text="displayText"
                  :items="combinedItems"
                  :breaks="visualBreaks"
                  :selectable="editing && !saving"
                  :focused-item="focusedIds[0]"
                  :focus-range="sourceEvidence"
                  :preferences="preferences"
                  :reveal-key="
                    preferences.reduceMotion
                      ? ''
                      : `${current.id}-${displayRevisionId}`
                  "
                  @select="selectAnnotationRange"
                  @focus="focusAnnotations"
                />
              </div>
              <div
                v-if="
                  editing &&
                  selection &&
                  ['ner', 'keywords'].includes(activeLayer)
                "
                class="selection-actionbar"
              >
                <fieldset :disabled="saving" class="selection-fields">
                  <span>已选「{{ selection.text }}」</span
                  ><select v-model="activeLayer" aria-label="选区标注类型">
                    <option value="ner">命名实体</option>
                    <option value="keywords">关键词</option></select
                  ><select
                    v-if="activeLayer === 'ner'"
                    v-model="chosenLabel"
                    aria-label="实体类型"
                  >
                    <option
                      v-for="(name, label) in entityNames"
                      :key="label"
                      :value="label"
                    >
                      {{ name }}
                    </option></select
                  ><button class="btn btn-primary" @click="useSelection">
                    添加标注
                  </button>
                </fieldset>
              </div>
              <footer v-if="editing || sourceEditing || (candidate && !processing && ['success', 'partialFailure'].includes(candidate.state) && !isHistorical)" class="editor-statusbar">
                <div class="button-row">
                  <template v-if="sourceEditing"
                    ><button
                      class="btn btn-primary"
                      :disabled="editorBusy"
                      @click="saveText"
                    >
                      {{ editorBusy ? "保存中…" : "保存原文" }}
                    </button></template
                  ><template v-else-if="editing"
                    ><label
                      v-if="draftLayerCount < Object.keys(taskNames).length"
                      class="caption checkbox-label"
                      ><input
                        v-model="allowPartial"
                        type="checkbox"
                      />允许部分层</label
                    ><label
                      v-if="!conflictReviewed"
                      class="caption checkbox-label"
                      ><input
                        v-model="conflictReviewed"
                        type="checkbox"
                      />已核对最新原文</label
                    ><button
                      class="btn btn-primary"
                      :disabled="saving"
                      @click="saveAnnotation(false)"
                    >
                      {{ saving ? "保存中…" : "保存人工标注" }}
                    </button></template
                  ><template
                    v-else-if="
                      candidate &&
                      !processing &&
                        ['success', 'partialFailure'].includes(
                          candidate.state,
                        ) &&
                      !isHistorical
                    "
                    ><label
                      v-if="completedLayers < Object.keys(taskNames).length"
                      class="caption checkbox-label"
                      ><input
                        v-model="allowPartial"
                        type="checkbox"
                      />保存成功层</label
                    ><button
                      class="btn btn-primary"
                      :disabled="saving"
                      @click="saveAnnotation(true)"
                    >
                      保存标注结果
                    </button></template
                  >
                </div>
              </footer>
            </section>
            <ExtractionRail
              v-if="!sourceEditing"
              :tasks="[
                'relations',
                'events',
                'sentiment',
                'intent',
              ]"
              :layers="insightLayers"
              side="right"
              @activate="activeLayer = $event"
              :active-task="activeLayer"
              :processing="Boolean(processing)"
              :selected-tasks="effectiveTasks"
              :source="currentState"
              @focus="focusInsight"
            />
            <DocumentInsights
                :graph-focus="graphFocus"
              v-if="!sourceEditing"
              :layers="insightLayers"
              :source="currentState"
              :text="displayText"
                :active-task="activeLayer"
              @focus="focusInsight"
            />
              <aside
                v-if="!sourceEditing"
                class="annotation-inspector"
              >
              <fieldset :disabled="saving" class="inspector-controls">
                <header>
                  <p class="eyebrow">ANNOTATIONS</p>
                  <h2>
                      {{ editing ? "人工标注编辑" : "标注详情"
                      }}<span>{{ displayItems.length }}</span>
                  </h2>
                </header>
                <div
                  class="inspector-tabs"
                  role="tablist"
                  aria-label="编辑图层"
                >
                  <button
                    v-for="(name, task) in detailTaskNames"
                    :key="task"
                    role="tab"
                    :aria-selected="detailLayer === task"
                    :class="{ selected: detailLayer === task }"
                    @click="
                      activeLayer = task;
                      focusedIds = [];
                      selection = null;
                    "
                  >
                    {{ name }}
                  </button>
                </div>
                <KeepAlive v-if="editing"
                  ><ExtraLayerEditor
                    :key="activeLayer"
                    v-if="
                      !['segmentation', 'keywords', 'pos', 'ner'].includes(
                        activeLayer,
                      )
                    "
                    :task="activeLayer"
                    :text="displayText"
                    :selection="selection"
                    :existing="
                      extraEditIndex === null
                        ? null
                        : draftLayers[activeLayer]?.[extraEditIndex]
                    "
                    @add="addExtra"
                    @cancel="extraEditIndex = null"
                    @pending="pendingExtra"
                /></KeepAlive>
                <p
                  v-if="visibleLayers[detailLayer]?.error"
                  class="inline-error"
                >
                  {{ visibleLayers[detailLayer].error.message }}
                </p>
                <template v-if="editing && activeLayer === 'segmentation'"
                  ><label class="caption" for="segmentationEditor"
                    >每行一个词，按原文顺序</label
                  ><textarea
                    id="segmentationEditor"
                    v-model="segmentationInput"
                    class="form-control segmentation-editor"
                    rows="12"
                  ></textarea
                  ><button
                    class="btn btn-outline-primary mt-3"
                    @click="applySegmentation"
                  >
                    应用分词
                  </button></template
                >
                <template v-else-if="editing && activeLayer === 'pos'"
                  ><button
                    v-if="!draftLayers.pos"
                    class="btn btn-outline-primary"
                    :disabled="!draftLayers.segmentation"
                    @click="createPos"
                  >
                    按分词建立词性</button
                  ><label
                    v-for="(item, index) in draftLayers.pos || []"
                    :key="index"
                    class="pos-editor-row"
                    ><span>{{
                      draftLayers.segmentation?.[index]?.itemText
                    }}</span
                    ><select
                      v-model="item.label"
                      class="form-select"
                      :aria-label="`词性 ${index + 1}`"
                    >
                      <option disabled value="">选择词性</option>
                      <option v-for="label in meta?.posLabels" :key="label">
                        {{ label }}
                      </option>
                    </select></label
                  ></template
                >
                <template v-else
                  ><div v-if="!displayItems.length" class="inspector-empty">
                    <AppIcon name="layers" /><strong>{{
                      processing ? "等待这一层返回" : "还没有标注"
                    }}</strong
                    ><span>{{
                      editing
                        ? "划选正文，添加实体或关键词。"
                        : "开始自动标注，或进入人工标注。"
                    }}</span
                    ><button
                      v-if="
                        !editing &&
                        !sourceEditing &&
                        !isHistorical &&
                        !processing &&
                        !current.archived
                      "
                      class="text-action"
                      @click="beginEditing"
                    >
                      开始人工标注
                    </button>
                  </div>
                  <FrequencyDetails
                    v-if="!editing"
                    :rows="detailRows"
                    :task="detailLayer"
                    :focused-ids="focusedIds"
                    @focus="focusInspector"
                  />
                  <div v-if="editing" class="annotation-items">
                    <article
                      v-for="{ item, index } in detailRows"
                      :key="item.itemId"
                      class="annotation-item"
                      :class="{ focused: focusedIds.includes(item.itemId) }"
                    >
                      <button
                        class="annotation-item-main"
                        @click="focusInspector(item)"
                      >
                        <span class="item-index">{{ index + 1 }}</span
                        ><span
                          ><strong>{{ item.itemText }}</strong
                          ><small v-if="item.label">{{
                            entityNames[item.label] ||
                            labelNames[item.label] ||
                            item.label
                          }}</small
                            ><small
                              >{{ itemFrequency(item) }} 次出现</small
                            ></span
                        ><span
                          class="annotation-tag"
                          :class="`tag-${item.label || activeLayer}`"
                          >{{
                            item.label ||
                            (activeLayer === "keywords"
                              ? `#${index + 1}`
                              : "词")
                          }}</span
                        >
                      </button>
                      <div
                        v-if="focusedIds.includes(item.itemId)"
                        class="annotation-item-detail"
                      >
                        <p
                          v-if="item.suggestion !== undefined"
                          class="correction-detail"
                        >
                          建议：{{ item.suggestion || "删除"
                          }}<small>{{ item.explanation }}</small>
                        </p>
                        <span v-for="span in item.spans" :key="span.start"
                          >{{ span.start }}–{{ span.end }}</span
                        ><select
                          v-if="editing && activeLayer === 'ner'"
                          v-model="draftLayers.ner[index].label"
                          class="form-select"
                          aria-label="修改实体标签"
                        >
                          <option
                            v-for="(name, label) in entityNames"
                            :key="label"
                            :value="label"
                          >
                            {{ name }}
                          </option></select
                        ><button
                          v-if="
                            editing &&
                            ![
                              'segmentation',
                              'keywords',
                              'ner',
                              'pos',
                            ].includes(activeLayer)
                          "
                          class="text-action"
                          @click="editExtra(index)"
                        >
                          编辑条目</button
                        ><button
                          v-if="
                            editing &&
                            !['segmentation', 'pos'].includes(activeLayer)
                          "
                          class="text-action"
                          @click="removeExtra(index)"
                        >
                          移除标注
                        </button>
                      </div>
                    </article>
                  </div></template
                >
                <footer class="inspector-footer">
                  <div
                    v-for="(name, label) in entityNames"
                    v-show="activeLayer === 'ner'"
                    :key="label"
                  >
                    <i :class="`entity-dot entity-${label}`"></i>{{ name }}
                  </div>
                  <span v-if="activeLayer !== 'ner'"
                    >{{ taskNames[activeLayer] }} ·
                    {{ editing ? "人工草稿" : "当前版本" }}</span
                  >
                </footer>
              </fieldset>
            </aside>
          </div>
        </template>
        <template v-else-if="page === 'jobs'"
          ><section class="page-heading">
            <div>
              <p class="eyebrow">IN PROGRESS</p>
              <h1>标注任务</h1>
              <p class="muted">
                {{ runningJobs.length }} 个进行中 · {{ jobs.length }} 个任务
              </p>
            </div>
            <button
              class="btn btn-outline-primary"
              :disabled="refreshBusy"
              @click="refresh"
            >
              刷新任务
            </button>
          </section>
          <div v-if="!jobs.length" class="empty-state surface">
            <AppIcon name="jobs" />
            <h2>暂无标注任务</h2>
            <button class="text-action" @click="navigate('library')">
              从文本库开始 →
            </button>
          </div>
          <template v-else><nav class="job-tabs nav nav-pills" :class="{ completed: jobTab === 'completed' }" aria-label="任务分类"><button v-for="[id, label] in [['pending', '待处理'], ['completed', '已完成']]" :key="id" class="nav-link" :class="{ active: jobTab === id }" :aria-pressed="jobTab === id" @click="jobTab = id">{{ label }} <small>{{ jobs.filter(job => (job.state === 'success') === (id === 'completed')).length }}</small></button></nav>
          <section class="surface task-list compact-table-wrap">
            <p v-if="!visibleJobs.length" class="muted p-4 mb-0">此分类暂无任务。</p>
            <table v-else class="compact-table"><thead><tr><th>任务名称</th><th>创建时间</th><th>供应商</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="job in visibleJobs" :key="job.id"><td><button class="table-title" @click="openCandidate(job.id)">{{ job.title }}</button></td><td>{{ timestamp(job.createdAt) }}</td><td>{{ job.provider }}</td><td><span class="quiet-badge" :class="{ 'is-saved': job.state === 'success' }">{{ stateNames[job.state] }}</span></td><td><button class="text-action" @click="openCandidate(job.id)">查看 →</button></td></tr></tbody></table>
          </section></template></template
        >
        <ModelLogs v-else-if="page === 'logs'" />
        <StatisticsView
          v-else-if="page === 'statistics'"
          :statistics="statistics"
          @refresh="refresh"
          /></div></Transition></main>
    </div>
    <dialog
      ref="editorDialog"
      class="workspace-dialog"
      @cancel.prevent="closeEditor"
    >
      <form @submit.prevent="saveText">
        <header>
          <div>
            <p class="eyebrow">NEW DOCUMENT</p>
            <h2>{{ editor.id ? "编辑文本" : "新建文本" }}</h2>
          </div>
          <button
            type="button"
            class="close-button"
            :disabled="editorBusy"
            aria-label="关闭文本编辑器"
            @click="closeEditor"
          >
            ×
          </button>
        </header>
        <div class="dialog-body">
          <label class="form-label" for="documentTitle">标题</label
          ><input
            id="documentTitle"
            v-model="editor.title"
            :disabled="editorBusy"
            class="form-control"
            maxlength="200"
            required
          /><label class="form-label mt-3" for="documentText">正文</label
          ><textarea
            id="documentText"
            v-model="editor.text"
            :disabled="editorBusy"
            class="form-control text-editor"
            rows="10"
            required
            placeholder="粘贴或输入中文文本…"
          ></textarea>
          <p class="caption muted mt-2">
            {{ Array.from(editor.text).length }} / 10,000 字符
          </p>
          <p v-if="editorError" class="inline-error" role="alert">
            {{ editorError }}
          </p>
          <button
            v-if="editorConflict"
            type="button"
            class="text-action"
            @click="reloadTextVersion"
          >
            载入最新版本并保留输入
          </button>
          <details v-if="editorLatest">
            <summary>最新保存原文</summary>
            <p class="text-comparison">{{ editorLatest.revision.textBody }}</p>
          </details>
        </div>
        <footer>
          <button
            type="button"
            class="btn btn-outline-primary"
            :disabled="editorBusy"
            @click="closeEditor"
          >
            取消</button
          ><button class="btn btn-primary" :disabled="editorBusy">
            {{ editorBusy ? "保存中…" : "保存文本" }}
          </button>
        </footer>
      </form>
    </dialog>
    <dialog
      ref="modelDialog"
      class="workspace-dialog model-dialog"
      @cancel="modelBusy && $event.preventDefault()"
    >
      <form @submit.prevent="startModel">
        <header>
          <div>
            <p class="eyebrow">INTELLIGENT ANNOTATION</p>
            <h2>{{ retryTarget ? "重试标注" : "自动标注" }}</h2>
          </div>
          <button
            type="button"
            class="close-button"
            :disabled="modelBusy"
            aria-label="关闭自动标注"
            @click="modelDialog.close()"
          >
            ×
          </button>
        </header>
        <div class="dialog-body annotation-dialog-body">
          <div class="annotation-dialog-summary">
            <AppIcon name="layers" />
            <div><strong>{{ modelTargets.length }} 份文本</strong><p>
            {{
              retryTarget
                ? retryTarget.response
                  ? "保留成功层，只重试失败层。"
                  : "没有完整回执，将重新调用全部所选层，可能重复计费。"
                : `已选 ${selectedTasks.length} 个标注图层`
            }}
            </p></div>
          </div>
          <fieldset v-if="!retryTarget" class="annotation-dialog-field">
            <legend>标注图层</legend>
            <div class="task-options">
            <label
              v-for="(name, task) in taskNames"
              :key="task"
              class="checkbox-label"
              ><input
                v-model="selectedTasks"
                type="checkbox"
                class="form-check-input"
                :value="task"
              /><AppIcon :name="task" />{{ name }}</label
            >
            </div>
          </fieldset>
          <fieldset v-if="!retryTarget" class="annotation-dialog-field">
            <legend>模型供应商</legend>
            <p v-if="!modelPreferences.providers.length" class="muted">请先在设置中配置模型供应商。</p>
            <div class="annotation-provider-options">
              <label v-for="item in modelPreferences.providers" :key="item.id" class="annotation-provider-option">
                <input v-model="provider" type="radio" name="annotation-provider" :value="item.id" required class="form-check-input">
                <span class="provider-icon">
                  <img v-if="item.id === 'deepseek'" :src="deepseekLogo" alt="">
                  <template v-else>{{ item.name.slice(0, 1) }}</template>
                </span>
                <span><strong>{{ item.name }}</strong><small>{{ item.model }}</small></span>
              </label>
            </div>
          </fieldset>
          <div class="consent-panel">
            <strong>文本将发送到所选模型。</strong
            ><label class="checkbox-label caption"
              ><input
                v-model="remoteConsent"
                type="checkbox"
                class="form-check-input"
              />我确认有权发送这些文本。</label
            >
          </div>
          <p v-if="modelError" class="inline-error" role="alert">
            {{ modelError }}
          </p>
        </div>
        <footer>
          <button
            type="button"
            class="btn btn-outline-primary"
            :disabled="modelBusy"
            @click="modelDialog.close()"
          >
            取消</button
          ><button class="btn btn-primary" :disabled="modelBusy || (!retryTarget && !modelPreferences.providers.length)">
            {{
              modelBusy ? "提交中…" : retryTarget ? "重试失败层" : "开始标注"
            }}
          </button>
        </footer>
      </form>
    </dialog>
    <dialog
      ref="settingsDialog"
      class="workspace-dialog settings-dialog"
      @cancel="settingsBusy && $event.preventDefault()"
    >
      <form @submit.prevent="saveSettings">
        <header>
          <div>
            <p class="eyebrow">MAKE IT YOURS</p>
            <h2>设置</h2>
          </div>
          <button
            class="close-button"
            type="button"
            aria-label="关闭设置"
            :disabled="settingsBusy"
            @click="settingsDialog.close()"
          >
            ×
          </button>
        </header>
        <div class="dialog-body settings-body">
          <nav class="settings-tabs" aria-label="设置导航">
            <button
              type="button"
              :class="{ selected: settingsTab === 'appearance' }"
              @click="settingsTab = 'appearance'"
            >
              界面与阅读</button
            ><button
              type="button"
              :class="{ selected: settingsTab === 'model' }"
              @click="settingsTab = 'model'"
            >
              模型供应商
            </button>
          </nav>
          <div class="settings-content">
            <div v-if="settingsTab === 'appearance'" class="settings-fields">
              <label
                >文字大小
                <select
                  v-model.number="preferences.fontSize"
                  class="form-select"
                >
                  <option
                    v-for="size in [16, 17, 19, 21, 24, 28]"
                    :key="size"
                    :value="size"
                  >
                    {{ size }} px
                  </option>
                </select></label
              ><label
                >阅读纸面<select
                  v-model="preferences.paper"
                  class="form-select"
                >
                  <option value="white">纯白</option>
                  <option value="parchment">浅灰</option>
                </select></label
              ><label class="switch-row"
                >紧凑布局<input
                  v-model="preferences.compact"
                  type="checkbox"
                  role="switch" /></label
              ><label class="switch-row"
                >减少动态效果<input
                  v-model="preferences.reduceMotion"
                  type="checkbox"
                  role="switch"
              /></label>
              <p class="caption muted">
                界面设置即时生效，仅保存在当前浏览器。
              </p>
            </div>
            <fieldset
              v-else
              class="settings-fields model-preferences-fields"
              :disabled="settingsLoading || settingsBusy"
            >
              <ModelProviders v-model="modelSettingsDraft" />
            </fieldset>
            <p v-if="settingsError" class="inline-error" role="alert">
              {{ settingsError }}
            </p>
          </div>
        </div>
        <footer>
          <button
            type="button"
            class="btn btn-outline-primary"
            :disabled="settingsBusy"
            @click="settingsDialog.close()"
          >
            关闭</button
          ><button
            class="btn btn-primary"
            :disabled="settingsBusy || settingsLoading"
          >
            {{ settingsBusy ? "保存中…" : "保存设置" }}
          </button>
        </footer>
      </form>
    </dialog>
  </div>
  <main v-else class="surface empty-state workspace-stopped" role="status">
    <h1>工作区已退出</h1>
    <p>本地服务和数据库已关闭。可关闭此页面，或双击 start.bat 重新启动。</p>
  </main>
  <dialog ref="importDialog" class="workspace-dialog action-dialog" aria-labelledby="import-dialog-title" aria-describedby="import-dialog-description">
    <form v-if="importChoice" method="dialog">
      <header><h2 id="import-dialog-title">选择 CSV 导入数量</h2></header>
      <div class="dialog-body action-dialog-body">
        <div class="import-file-summary">
          <strong>{{ importChoice.name }}</strong>
          <span class="muted">共 {{ importChoice.count.toLocaleString() }} 份非空文本</span>
        </div>
        <label class="import-count-field">
          <span>导入数量</span>
          <input v-model.number="importChoice.limit" class="form-control" type="number" min="1" :max="importChoice.count" required autofocus aria-describedby="import-dialog-description">
        </label>
        <p id="import-dialog-description" class="muted">从文件开头按行列顺序导入。</p>
      </div>
      <footer>
        <button type="button" class="btn btn-outline-secondary" @click="importDialog.close()">取消</button>
        <button class="btn btn-primary" value="import">开始导入</button>
      </footer>
    </form>
  </dialog>
  <dialog ref="exitDialog" class="workspace-dialog action-dialog" aria-labelledby="exit-dialog-title" aria-describedby="exit-dialog-description" @cancel="exitBusy && $event.preventDefault()">
    <form @submit.prevent="stopWorkspace">
      <header><h2 id="exit-dialog-title">退出工作区？</h2></header>
      <div class="dialog-body action-dialog-body">
        <p id="exit-dialog-description">退出会关闭本机后端和 MySQL 数据库。其他已打开的工作区页面也会断开。</p>
        <p v-if="exitError" class="feedback error-feedback" role="alert">{{ exitError }}</p>
      </div>
      <footer>
        <button type="button" class="btn btn-outline-secondary" :disabled="exitBusy" autofocus @click="exitDialog.close()">取消</button>
        <button class="btn btn-danger" :disabled="exitBusy">{{ exitBusy ? "正在关闭…" : "退出并关闭服务" }}</button>
      </footer>
    </form>
  </dialog>
</template>
