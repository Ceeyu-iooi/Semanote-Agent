<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue';
import AnnotationCanvas from './components/AnnotationCanvas.vue';
import DeveloperCenter from './components/DeveloperCenter.vue';
import StatisticsView from './components/StatisticsView.vue';
import { request, send, taskNames, entityNames, stateNames } from './api.js';

const page = ref('library'), documents = ref([]), jobs = ref([]), statistics = ref(null), meta = ref(null);
const loading = ref(true), refreshBusy = ref(false), loadError = ref(''), notice = ref(''), actionError = ref('');
const query = ref(''), showArchived = ref(false), selectedIds = ref([]), current = ref(null);
const candidate = ref(null), historicalSnapshot = ref(null), history = ref(null), showHistory = ref(false);
const activeLayer = ref('ner'), focusedIds = ref([]), editing = ref(false), draftLayers = ref({}), selection = ref(null);
const chosenLabel = ref('PERSON'), segmentationInput = ref(''), allowPartial = ref(false);
const savingDocumentIds = reactive(new Set());
const saving = computed(() => savingDocumentIds.has(current.value?.id));
const conflictPending = ref(false), conflictReviewed = ref(true), draftBaseSnapshotId = ref(null);
const editorDialog = ref(null), modelDialog = ref(null), importInput = ref(null);
const editor = reactive({ id: null, rowVersion: null, title: '', text: '', originalTitle: '', originalText: '' });
const editorError = ref(''), modelError = ref(''), importBusy = ref(false), editorBusy = ref(false);
const editorConflict = ref(false), editorLatest = ref(null);
const modelTargets = ref([]), remoteConsent = ref(false), provider = ref('deepseek'), modelBusy = ref(false), retryTarget = ref(null);
const selectedTasks = ref(['segmentation', 'keywords', 'pos', 'ner']);
let pollTimer, refreshSequence = 0, documentSequence = 0, editSession = 0, historySequence = 0, editorSession = 0;
const filteredDocuments = computed(() => documents.value.filter(item => Boolean(item.archived) === showArchived.value && `${item.title}\n${item.searchText ?? item.preview}`.toLowerCase().includes(query.value.toLowerCase())));
const activeCount = computed(() => documents.value.filter(item => !item.archived).length);
const runningJobs = computed(() => jobs.value.filter(job => ['queued', 'running'].includes(job.state)));
const displayText = computed(() => historicalSnapshot.value?.revision.textBody ?? candidate.value?.request?.text ?? current.value?.revision.textBody ?? '');
const displayRevisionId = computed(() => historicalSnapshot.value?.revisionId ?? candidate.value?.revisionId ?? current.value?.currentRevisionId);
const isHistorical = computed(() => Boolean(historicalSnapshot.value) || displayRevisionId.value !== current.value?.currentRevisionId);
const visibleLayers = computed(() => historicalSnapshot.value?.layers ?? candidate.value?.response?.layers ?? current.value?.snapshot?.layers ?? {});
const displayItems = computed(() => {
  if (editing.value) return draftItems(activeLayer.value);
  return visibleLayers.value[activeLayer.value]?.result?.items || [];
});
const currentState = computed(() => editing.value ? '人工草稿 · 未保存' : historicalSnapshot.value ? '历史快照 · 只读' : candidate.value ? `自动候选 · ${stateNames[candidate.value.state] || candidate.value.state}` : current.value?.snapshot ? '已保存快照' : '尚未标注');
const currentJob = computed(() => candidate.value && jobs.value.find(job => job.id === candidate.value.id));

function message(error) { return error?.message || '操作未完成，请重试。'; }
function timestamp(value) { return value ? new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : ''; }
function shortId(value) { return value?.slice(0, 8); }
async function refresh() {
  const sequence = ++refreshSequence;
  refreshBusy.value = true;
  try {
    const results = await Promise.all([request('/documents'), request('/jobs'), request('/statistics'), request('/meta')]);
    if (sequence !== refreshSequence) return;
    [documents.value, jobs.value, statistics.value, meta.value] = results;
    loadError.value = '';
  } catch (error) { if (sequence === refreshSequence) loadError.value = message(error); }
  finally { if (sequence === refreshSequence) { loading.value = false; refreshBusy.value = false; } }
}
function leaveDraft() { return !editing.value || window.confirm('人工草稿尚未保存，确定放弃本次修改？'); }
function navigate(destination) {
  if (!leaveDraft()) return;
  documentSequence++; editSession++;
  editing.value = false; page.value = destination; actionError.value = ''; selection.value = null;
  if (destination === 'statistics') refresh();
}
async function openDocument(id) {
  if (!leaveDraft()) return false;
  editing.value = false; editSession++; historySequence++; history.value = null; showHistory.value = false;
  const session = editSession;
  const sequence = ++documentSequence;
  actionError.value = ''; notice.value = '';
  try {
    const document = await request(`/documents/${id}`);
    if (sequence !== documentSequence || session !== editSession) return false;
    current.value = document; candidate.value = null; historicalSnapshot.value = null; showHistory.value = false;
    focusedIds.value = []; editing.value = false; editSession++; conflictPending.value = false; conflictReviewed.value = true;
    allowPartial.value = false; selection.value = null; page.value = 'workspace';
    return true;
  } catch (error) { actionError.value = message(error); return false; }
}
async function openCandidate(id) {
  if (!leaveDraft()) return;
  editing.value = false;
  const sequence = ++documentSequence;
  const job = await request(`/jobs/${id}`).catch(error => { actionError.value = message(error); });
  if (!job || sequence !== documentSequence) return;
  const opened = await openDocument(job.documentId);
  if (opened && current.value?.id === job.documentId && page.value === 'workspace') { candidate.value = job; historicalSnapshot.value = null; }
}
function openEditor(document = null) {
  if (editorBusy.value) return;
  editorSession++;
  const text = document?.revision.textBody ?? '';
  Object.assign(editor, { id: document?.id ?? null, rowVersion: document?.rowVersion ?? null, title: document?.title ?? '', text, originalTitle: document?.title ?? '', originalText: text });
  editorError.value = ''; editorConflict.value = false; editorLatest.value = null; editorDialog.value.showModal();
}
function closeEditor() {
  if (editorBusy.value) return;
  if ((editor.title !== editor.originalTitle || editor.text !== editor.originalText) && !window.confirm('文本尚未保存，确定关闭？')) return;
  editorSession++;
  editorDialog.value.close();
}
async function saveText() {
  if (editorBusy.value) return;
  editorBusy.value = true; editorError.value = '';
  try {
  const body = { title: editor.title, text: editor.text, rowVersion: editor.rowVersion };
    const document = await send(editor.id ? `/documents/${editor.id}` : '/documents', body, editor.id ? 'PUT' : 'POST');
    editorDialog.value.close();
    await refresh(); await openDocument(document.id); notice.value = '文本已保存。';
  } catch (error) { editorError.value = message(error); if (error.status === 409) editorConflict.value = true; }
  finally { editorBusy.value = false; }
}
async function importFile(event) {
  const file = event.target.files?.[0]; if (!file) return;
  importBusy.value = true; actionError.value = ''; notice.value = '';
  try {
    const form = new FormData(); form.append('file', file);
    const result = await request('/imports', { method: 'POST', body: form });
    await refresh(); notice.value = `已导入 ${result.importedCount} 份文本，跳过 ${result.skippedCount} 个纯空白文本。`;
  } catch (error) { actionError.value = message(error); }
  finally { importBusy.value = false; event.target.value = ''; }
}
function clearHiddenSelection() { selectedIds.value = []; }
async function archiveDocument(document, archived) {
  if (editing.value && !leaveDraft()) return;
  try {
    await send(`/documents/${document.id}/archive`, { rowVersion: document.rowVersion, archived });
    if (current.value?.id === document.id) { editing.value = false; await openDocument(document.id); }
    await refresh(); selectedIds.value = selectedIds.value.filter(id => id !== document.id);
    notice.value = archived ? '文本已归档，可在归档列表恢复。' : '文本已恢复。';
  } catch (error) { actionError.value = message(error); }
}
function showModel(targets, retryJob = null) {
  if (targets.length > 500) { actionError.value = '单批最多 500 份文本，请减少选择。'; return; }
  if (editing.value) { actionError.value = '请先保存或取消人工草稿。'; return; }
  modelTargets.value = targets; retryTarget.value = retryJob; remoteConsent.value = false; modelError.value = ''; modelDialog.value.showModal();
}
async function startModel() {
  if (modelBusy.value) return;
  if (!remoteConsent.value) { modelError.value = '请先确认这些文本允许发送到所选模型。'; return; }
  if (!retryTarget.value && !selectedTasks.value.length) { modelError.value = '请选择至少一项任务。'; return; }
  modelBusy.value = true; modelError.value = '';
  const failures = [], submittedIds = [];
  try {
    if (retryTarget.value) {
      const job = await send(`/jobs/${retryTarget.value.id}/retry`, { requestId: crypto.randomUUID(), remoteConsent: true });
      submittedIds.push(job.id);
    } else {
      for (const document of modelTargets.value) {
        try {
          const job = await send('/jobs', { requestId: crypto.randomUUID(), documentId: document.id, revisionId: document.currentRevisionId, tasks: selectedTasks.value, provider: provider.value, remoteConsent: true });
          submittedIds.push(job.id);
        } catch (error) { failures.push(`${document.title}：${message(error)}`); }
      }
    }
    await refresh();
    if (!submittedIds.length) { modelError.value = failures.join('；') || '未提交任务。'; return; }
    modelDialog.value.close();
    notice.value = `已提交 ${submittedIds.length} 个任务；完成后请审阅并保存候选。${failures.length ? ` ${failures.length} 个未提交：${failures.join('；')}` : ''}`;
    if (submittedIds.length === 1) await openCandidate(submittedIds[0]); else page.value = 'jobs';
  } catch (error) { modelError.value = message(error); }
  finally { modelBusy.value = false; }
}
function rawFromLayers(layers) {
  const raw = {};
  for (const [task, layer] of Object.entries(layers)) {
    if (layer.status !== 'success') continue;
    raw[task] = layer.result.items.map((item, index) => {
      if (task === 'pos') return { tokenIndex: index, label: item.label };
      if (task === 'ner') return { itemText: item.itemText, label: item.label, occurrence: positions(displayText.value, item.itemText).indexOf(item.spans[0].start) };
      return { itemText: item.itemText };
    });
  }
  return raw;
}
function positions(text, word) {
  const characters = Array.from(text), needle = Array.from(word), matches = [];
  if (!needle.length) return matches;
  for (let index = 0; index <= characters.length - needle.length; index++) if (characters.slice(index, index + needle.length).join('') === word) matches.push(index);
  return matches;
}
function beginEditing() {
  editSession++; conflictPending.value = false; conflictReviewed.value = true;
  draftBaseSnapshotId.value = current.value.currentSnapshotId;
  draftLayers.value = rawFromLayers(visibleLayers.value);
  if (!Object.keys(draftLayers.value).length) draftLayers.value = { ner: [] };
  segmentationInput.value = (draftLayers.value.segmentation || []).map(item => item.itemText).join('\n');
  editing.value = true; selection.value = null; actionError.value = ''; allowPartial.value = false;
}
function draftItems(task) {
  const raw = draftLayers.value[task]; if (!raw) return [];
  if (task === 'pos') {
    const tokens = draftItems('segmentation');
    return raw.map((item, index) => ({ ...tokens[index], itemId: `pos-${index}`, label: item.label }));
  }
  let cursor = 0;
  return raw.map((item, index) => {
    let spans = [];
    if (task === 'segmentation') {
      const text = Array.from(displayText.value);
      while (cursor < text.length && /\s/u.test(text[cursor])) cursor++;
      const end = cursor + Array.from(item.itemText).length;
      if (text.slice(cursor, end).join('') === item.itemText) spans = [{ start: cursor, end, surfaceText: item.itemText }];
      cursor = end;
    } else {
      let starts = positions(displayText.value, item.itemText);
      if (task === 'ner') starts = starts.slice(item.occurrence, item.occurrence + 1);
      spans = starts.map(start => ({ start, end: start + Array.from(item.itemText).length, surfaceText: item.itemText }));
    }
    return { ...item, itemId: `${task}-${index}`, spans };
  });
}
function enableLayer(task) { draftLayers.value[task] = []; }
function useSelection() {
  const selected = selection.value; if (!selected) return;
  if (!['ner', 'keywords'].includes(activeLayer.value)) return;
  if (!draftLayers.value[activeLayer.value]) enableLayer(activeLayer.value);
  if (activeLayer.value === 'ner') {
    const occurrence = positions(displayText.value, selected.text).indexOf(selected.start);
    const item = { itemText: selected.text, label: chosenLabel.value, occurrence };
    if (!draftLayers.value.ner.some(old => old.itemText === item.itemText && old.label === item.label && old.occurrence === item.occurrence)) draftLayers.value.ner.push(item);
  } else if (!draftLayers.value.keywords.some(item => item.itemText === selected.text)) draftLayers.value.keywords.push({ itemText: selected.text });
  selection.value = null; window.getSelection()?.removeAllRanges();
}
function applySegmentation() {
  draftLayers.value.segmentation = segmentationInput.value.split('\n').filter(word => word !== '').map(itemText => ({ itemText }));
  delete draftLayers.value.pos;
  notice.value = '已更新分词草稿；词性依赖已清除，可按新分词重新填写。';
}
function createPos() {
  draftLayers.value.pos = (draftLayers.value.segmentation || []).map((item, tokenIndex) => ({ tokenIndex, label: '' }));
}
async function saveAnnotation(automatic = false) {
  if (saving.value || !current.value) return;
  if (!conflictReviewed.value) { actionError.value = '请先核对最新原文及各层草稿，再确认保存。'; return; }
  actionError.value = '';
  const id = current.value.id, session = editSession, revisionId = current.value.currentRevisionId;
  const savedTitle = current.value.title;
  savingDocumentIds.add(id);
  try {
    const body = { rowVersion: current.value.rowVersion, revisionId: current.value.currentRevisionId, allowPartial: allowPartial.value };
    if (automatic) body.candidateId = candidate.value.id;
    else { body.layers = draftLayers.value; body.baseSnapshotId = draftBaseSnapshotId.value; if (candidate.value) body.candidateJobId = candidate.value.id; }
    await send(`/documents/${id}/snapshots`, body);
    await refresh();
    if (current.value?.id === id && editSession === session && current.value.currentRevisionId === revisionId && page.value === 'workspace') {
      editing.value = false; await openDocument(id);
    }
    notice.value = `“${savedTitle}”快照已保存；统计与 JSON 导出已使用这一版本。`;
  } catch (error) {
    if (current.value?.id === id && editSession === session) {
      actionError.value = message(error); if (error.status === 409) conflictPending.value = true;
    }
  }
  finally { savingDocumentIds.delete(id); }
}
async function toggleHistory() {
  showHistory.value = !showHistory.value;
  const id = current.value.id, sequence = documentSequence, historyRequest = ++historySequence;
  if (showHistory.value) try {
    const result = await request(`/documents/${id}/revisions`);
    if (current.value?.id === id && documentSequence === sequence && historySequence === historyRequest && showHistory.value) history.value = result;
  } catch (error) { if (current.value?.id === id) actionError.value = message(error); }
}
async function viewHistory(snapshotId) {
  if (!leaveDraft()) return;
  editing.value = false;
  const id = current.value.id, sequence = documentSequence, session = editSession, historyRequest = ++historySequence;
  try {
    const result = await request(`/documents/${id}/snapshots/${snapshotId}`);
    if (current.value?.id === id && documentSequence === sequence && editSession === session && historySequence === historyRequest && !editing.value) { historicalSnapshot.value = result; candidate.value = null; }
  }
  catch (error) { actionError.value = message(error); }
}
async function reloadKeepingDraft() {
  const id = current.value?.id, session = editSession;
  if (!id) return;
  try {
    const fresh = await request(`/documents/${id}`);
    if (current.value?.id !== id || session !== editSession) return;
    const changed = fresh.currentRevisionId !== current.value.currentRevisionId;
    current.value = fresh; conflictPending.value = false;
    if (changed) {
      candidate.value = null; historicalSnapshot.value = null; selection.value = null;
      draftBaseSnapshotId.value = null; conflictReviewed.value = false;
    }
    notice.value = changed ? '已载入最新原文，人工草稿仍保留。请逐层核对区间、分词与词性，再确认保存。' : '已载入最新保存版本，人工草稿仍保留；核对后可再次保存。';
  } catch (error) { actionError.value = message(error); }
}
async function reloadTextVersion() {
  const id = editor.id, session = editorSession;
  try {
    const fresh = await request(`/documents/${id}`);
    if (editor.id !== id || editorSession !== session || !editorDialog.value.open) return;
    editor.rowVersion = fresh.rowVersion; editorLatest.value = fresh;
    editorConflict.value = false; editorError.value = '已更新保存版本号，本地输入仍保留。请对照下面的最新原文，合并后再保存。';
  } catch (error) { editorError.value = message(error); }
}
function viewRevision(revision) {
  if (!leaveDraft()) return;
  if (revision.documentId !== current.value?.id) return;
  historySequence++;
  editing.value = false; candidate.value = null;
  historicalSnapshot.value = { id: null, revisionId: revision.id, revision, layers: {} };
}
function returnCurrent() { historySequence++; historicalSnapshot.value = null; candidate.value = null; }
async function pollJobs() {
  try {
    if (!runningJobs.value.length && !candidate.value) return;
    jobs.value = await request('/jobs');
    if (candidate.value && ['queued', 'running'].includes(candidate.value.state)) {
      const id = candidate.value.id, updated = await request(`/jobs/${id}`);
      if (candidate.value?.id === id && !editing.value) candidate.value = updated;
    }
  } catch { /* Existing results stay visible; an explicit refresh reports connection errors. */ }
}
function beforeUnload(event) { if (editing.value || editorDialog.value?.open) { event.preventDefault(); event.returnValue = ''; } }
onMounted(async () => { await refresh(); pollTimer = setInterval(pollJobs, 2000); window.addEventListener('beforeunload', beforeUnload); });
onUnmounted(() => { clearInterval(pollTimer); window.removeEventListener('beforeunload', beforeUnload); });
</script>

<template>
  <header class="global-header"><a href="#" class="brand" @click.prevent="navigate('library')"><span class="brand-symbol" aria-hidden="true">S</span><span>Semanote</span></a><span class="global-caption">中文文本标注工作台</span><button class="global-link" @click="navigate('developer')">开发者中心 ↗</button></header>
  <div class="app-layout"><aside class="main-sidebar"><div><p class="sidebar-caption">工作空间</p><nav aria-label="主导航"><button :class="{ active: page === 'library' }" @click="navigate('library')"><span aria-hidden="true">▤</span>文本库 <small>{{ activeCount }}</small></button><button :class="{ active: page === 'workspace' }" :disabled="!current" @click="navigate('workspace')"><span aria-hidden="true">⌁</span>标注工作台</button><button :class="{ active: page === 'jobs' }" @click="navigate('jobs')"><span aria-hidden="true">◷</span>标注任务 <small v-if="runningJobs.length">{{ runningJobs.length }}</small></button><button :class="{ active: page === 'statistics' }" @click="navigate('statistics')"><span aria-hidden="true">▥</span>统计概览</button></nav></div><div class="sidebar-bottom"><button :class="{ active: page === 'developer' }" @click="navigate('developer')"><span aria-hidden="true">⌘</span>开发者中心</button><div class="local-status"><span aria-hidden="true">◉</span><div>本地工作空间<small>单人标注 · 数据保存在本机</small></div></div></div></aside>
  <main class="main-content"><div v-if="loadError" role="alert" class="feedback error-feedback"><strong>连接未完成</strong><span>{{ loadError }}</span><button class="text-action" @click="refresh">重新连接</button></div><div v-if="conflictPending && editing" class="feedback"><span>保留当前人工草稿，载入最新版本后继续核对。</span><button class="text-action" @click="reloadKeepingDraft">载入最新版本并保留草稿</button></div><div v-if="actionError" role="alert" class="feedback error-feedback"><span>{{ actionError }}</span><button class="text-action" @click="actionError = ''">关闭提示</button></div><div v-if="notice" role="status" class="feedback"><span>{{ notice }}</span><button class="text-action" @click="notice = ''">知道了</button></div>
    <div v-if="loading" class="empty-state"><span class="loading-indicator"></span><h2>正在打开工作空间…</h2></div>
    <template v-else-if="page === 'library'"><section class="page-heading"><div><p class="eyebrow">LIBRARY / YOUR TEXTS</p><h1>文本库</h1><p class="muted">从一段文字开始，让每处信息清晰可见。</p></div><div class="button-row"><button class="btn btn-outline-primary" :disabled="importBusy" @click="importInput.click()">{{ importBusy ? '正在导入…' : '导入文本' }}</button><button class="btn btn-primary" @click="openEditor()">＋ 新建文本</button><input ref="importInput" class="visually-hidden" type="file" accept=".txt,.csv" aria-label="导入 TXT 或 CSV" @change="importFile"></div></section>
    <section class="library-summary"><div><span class="summary-number">{{ activeCount }}</span><span>份未归档文本</span></div><p>分词、关键词、词性、命名实体。<br><span class="muted">自动标注与人工修正，在同一处完成。</span></p><button class="text-action" @click="navigate('statistics')">查看标注统计 ↗</button></section>
    <section class="surface library-surface"><div class="panel-toolbar"><div class="segmented-control"><button :class="{ selected: !showArchived }" @click="showArchived = false; clearHiddenSelection()">全部文本</button><button :class="{ selected: showArchived }" @click="showArchived = true; clearHiddenSelection()">已归档</button></div><label class="search-field"><span aria-hidden="true">⌕</span><input v-model="query" type="search" placeholder="搜索标题或文本内容" aria-label="搜索文本" @input="clearHiddenSelection"></label></div>
    <div v-if="selectedIds.length" class="selection-toolbar"><strong>已选 {{ selectedIds.length }} 份文本</strong><button class="text-action" @click="showModel(documents.filter(item => selectedIds.includes(item.id)))">批量自动标注</button><button class="text-action" @click="selectedIds = []">取消选择</button></div>
    <div v-if="!filteredDocuments.length" class="empty-state"><span class="empty-mark">▤</span><h2>{{ query ? '没有找到匹配文本。' : showArchived ? '这里还没有归档文本。' : '你的第一段文本，准备好了么？' }}</h2><p class="muted">{{ query ? '换个关键词，或清空搜索后继续。' : showArchived ? '归档的文本可以随时恢复。' : '新建文本，或导入 UTF-8 TXT / 三列 CSV。' }}</p><button v-if="query" class="btn btn-outline-primary" @click="query = ''">清空搜索</button><button v-else-if="!showArchived" class="btn btn-outline-primary" @click="openEditor()">新建第一段文本</button></div>
    <div v-else class="document-list"><article v-for="document in filteredDocuments" :key="document.id" class="document-row"><input v-if="!showArchived" v-model="selectedIds" class="form-check-input" type="checkbox" :value="document.id" :aria-label="`选择 ${document.title}`"><button class="document-main" @click="openDocument(document.id)"><div><strong>{{ document.title }}</strong><span class="quiet-badge">{{ document.currentSnapshotId ? '已有标注' : '待标注' }}</span></div><p>{{ document.preview }}</p><small>{{ document.textLength }} 字符 · 修订 {{ document.revisionNumber }} · {{ timestamp(document.updatedAt) }}<template v-if="document.source.fileName"> · {{ document.source.fileName }} {{ document.source.rowNumber }}:{{ document.source.columnNumber }}</template></small></button><button class="text-action row-action" @click="archiveDocument(document, !showArchived)">{{ showArchived ? '恢复' : '归档' }}</button><button class="open-arrow" :aria-label="`打开 ${document.title}`" @click="openDocument(document.id)">↗</button></article></div><footer class="list-footer">{{ filteredDocuments.length }} 份文本<span>UTF-8 TXT / CSV · 单文本 10,000 码点 · 单批 500 份</span></footer></section></template>
    <template v-else-if="page === 'workspace' && current"><section class="workspace-heading"><div><button class="text-action caption" @click="navigate('library')">← 返回文本库</button><h1>{{ current.title }}</h1><p class="caption muted">修订 {{ current.revision.revisionNumber }} · {{ Array.from(displayText).length }} 字符 · {{ currentState }}</p></div><div class="button-row"><button class="btn btn-outline-primary" @click="toggleHistory">版本历史</button><button v-if="!current.archived" class="btn btn-outline-primary" :disabled="editing" @click="openEditor(current)">编辑原文</button><button v-if="!current.archived" class="btn btn-primary" :disabled="editing" @click="showModel([current])">自动标注</button></div></section>
    <div v-if="current.archived" class="feedback"><span>这份文本已归档；恢复后可继续标注。</span><button class="text-action" @click="archiveDocument(current, false)">恢复文本</button></div>
    <div v-if="showHistory && history" class="surface history-panel"><h2>版本历史</h2><p class="caption muted">{{ history.revisions.length }} 个不可变文本修订，{{ history.snapshots.length }} 个保存快照。旧标注始终绑定原修订。</p><div v-for="revision in history.revisions" :key="revision.id" class="history-row"><strong>修订 {{ revision.revisionNumber }}</strong><span class="caption muted">{{ timestamp(revision.createdAt) }} · {{ Array.from(revision.textBody).length }} 字符</span><button class="text-action caption" @click="viewRevision(revision)">查看原文</button><span v-if="!history.snapshots.some(snapshot => snapshot.revisionId === revision.id)" class="caption muted">无保存快照</span><button v-for="snapshot in history.snapshots.filter(item => item.revisionId === revision.id)" :key="snapshot.id" class="text-action caption" @click="viewHistory(snapshot.id)">{{ snapshot.producerKind === 'manual' ? '人工' : '自动' }}快照 {{ shortId(snapshot.id) }} ↗</button></div><button v-if="historicalSnapshot || candidate" class="text-action" @click="returnCurrent">返回当前保存版本</button></div>
    <div v-if="isHistorical" class="feedback"><span>正在查看旧修订结果；当前原文的标注不会被替换。</span><button class="text-action" @click="returnCurrent">返回当前修订</button></div>
    <div v-if="candidate" class="candidate-banner"><div><strong>{{ stateNames[currentJob?.state || candidate.state] }}</strong><p class="caption mb-0">{{ candidate.errorMessage || '自动结果是候选，保存后才计入统计。' }}</p></div><button v-if="['failed', 'partialFailure', 'interrupted'].includes(candidate.state)" class="btn btn-outline-primary" @click="showModel([], candidate)">显式重试失败层</button><button class="text-action" @click="returnCurrent">查看已保存版本</button></div>
    <div class="workspace-layout"><section class="surface reading-panel"><div class="panel-toolbar"><div class="layer-tabs" role="tablist" aria-label="标注层"><button v-for="(name, task) in taskNames" :key="task" role="tab" :aria-selected="activeLayer === task" :class="{ selected: activeLayer === task }" @click="activeLayer = task; selection = null; focusedIds = []">{{ name }}</button></div><span class="caption muted">{{ displayItems.length }} 条</span></div><div class="reading-caption"><span>{{ editing ? '划选原文添加实体或关键词；修改仅在草稿中生效。' : '原始文本 / 点击高亮可定位右侧条目' }}</span><span>{{ editing ? '未保存' : historicalSnapshot ? '历史修订' : '精确原文' }}</span></div><AnnotationCanvas :text="displayText" :items="displayItems" :selectable="editing && !saving" :focused-item="focusedIds[0]" @select="selection = $event" @focus="focusedIds = $event"/><footer class="canvas-footer"><span>码点区间 [start, end)</span><span>原文不裁剪、不归一化</span></footer></section>
    <aside class="surface annotation-panel"><div class="panel-toolbar"><div><strong>{{ taskNames[activeLayer] }}</strong><p class="caption muted mb-0">{{ editing ? '人工草稿' : '标注结果' }}</p></div><button v-if="!editing && !isHistorical && !current.archived && !['queued','running'].includes(candidate?.state)" class="text-action caption" @click="beginEditing">{{ current.snapshot || candidate?.response ? '人工修正' : '人工标注' }}</button><button v-if="editing" class="text-action caption" :disabled="saving" @click="leaveDraft() && (editing = false)">取消修改</button></div>
    <fieldset class="annotation-edit-fieldset" :disabled="editing && saving"><div class="annotation-body"><div v-if="editing && ['ner', 'keywords'].includes(activeLayer)" class="selection-editor"><p class="caption">{{ selection ? `已选：“${selection.text}”` : '在左侧划选原文，再添加标注。' }}</p><label v-if="activeLayer === 'ner'" class="caption">实体类别<select v-model="chosenLabel" class="form-select mt-2"><option v-for="(name, label) in entityNames" :key="label" :value="label">{{ name }} · {{ label }}</option></select></label><button class="btn btn-outline-primary w-100 mt-3" :disabled="!selection" @click="useSelection">添加{{ activeLayer === 'ner' ? '实体' : '关键词' }}</button><button v-if="!draftLayers[activeLayer]" class="text-action caption mt-3" @click="enableLayer(activeLayer)">建立空的{{ taskNames[activeLayer] }}层</button></div>
    <div v-if="editing && activeLayer === 'segmentation'" class="selection-editor"><label class="caption" for="tokensInput">每行一个词项，保持原文次序；标点单列。</label><textarea id="tokensInput" v-model="segmentationInput" class="form-control mt-2" rows="7" placeholder="小林&#10;在&#10;杭州&#10;读书&#10;。"></textarea><p class="caption muted mt-2">应用分词会清除草稿中的词性依赖。</p><button class="btn btn-outline-primary" @click="applySegmentation">应用分词草稿</button></div>
    <div v-if="editing && activeLayer === 'pos' && !draftLayers.pos" class="selection-editor"><p class="caption">先建立有效分词，再逐项指定词性。</p><button class="btn btn-outline-primary" :disabled="!draftLayers.segmentation?.length" @click="createPos">按当前分词填写词性</button></div>
    <template v-if="!editing && visibleLayers[activeLayer]?.status === 'failed'"><div class="inline-error"><strong>该层未完成</strong><p>{{ visibleLayers[activeLayer].error?.message }}</p></div></template><div v-else-if="!displayItems.length" class="annotation-empty"><span>◌</span><p>{{ (editing ? draftLayers[activeLayer] : visibleLayers[activeLayer]?.status === 'success') ? '该层目前没有条目。' : '尚未包含这一标注层。' }}</p><small>空结果、未执行与失败会分别记录。</small></div>
    <ol v-else class="annotation-list"><li v-for="(item, index) in displayItems" :key="item.itemId" :class="{ focused: focusedIds.includes(item.itemId) }"><button class="annotation-item" @click="focusedIds = [item.itemId]"><strong>{{ item.itemText }}</strong><span v-if="item.label">{{ entityNames[item.label] || item.label }}</span><small>{{ item.spans?.map(span => `[${span.start}, ${span.end})`).join(' · ') }}<template v-if="activeLayer === 'keywords'"> · {{ item.spans?.length }} 次</template></small></button><template v-if="editing"><select v-if="activeLayer === 'ner'" v-model="draftLayers.ner[index].label" class="form-select form-select-sm" aria-label="修改实体类别"><option v-for="(name, label) in entityNames" :key="label" :value="label">{{ name }}</option></select><select v-if="activeLayer === 'pos'" v-model="draftLayers.pos[index].label" class="form-select form-select-sm" :aria-label="`${item.itemText} 的词性`"><option value="">请选择词性</option><option v-for="label in meta.posLabels" :key="label">{{ label }}</option></select><button v-if="['ner','keywords'].includes(activeLayer)" class="text-action caption" @click="draftLayers[activeLayer].splice(index, 1)">移除</button></template></li></ol></div></fieldset>
    <footer v-if="editing || (candidate?.response && !isHistorical && ['success','partialFailure'].includes(candidate.state))" class="save-panel"><label v-if="!conflictReviewed" class="caption checkbox-label"><input v-model="conflictReviewed" class="form-check-input" type="checkbox">我已按最新原文逐层复核草稿</label><label class="caption checkbox-label"><input v-model="allowPartial" class="form-check-input" type="checkbox">允许保存未包含全部四层的结果</label><button class="btn btn-primary w-100" :disabled="saving" @click="saveAnnotation(!editing)">{{ saving ? '正在保存…' : editing ? '保存人工快照' : '保存自动候选' }}</button><p class="caption muted mb-0 mt-2">保存后保留历史，不覆盖已有版本。</p></footer><footer v-else-if="historicalSnapshot?.id || (!historicalSnapshot && current.snapshot)" class="save-panel"><a class="btn btn-outline-primary w-100" :href="`/api/v1/documents/${current.id}/exports/${historicalSnapshot?.id || current.currentSnapshotId}`">导出此快照 JSON</a><p class="caption muted mt-2 mb-0">快照 {{ shortId(historicalSnapshot?.id || current.currentSnapshotId) }}</p></footer></aside></div></template>
    <template v-else-if="page === 'jobs'"><section class="page-heading"><div><p class="eyebrow">JOBS / INFERENCE HISTORY</p><h1>标注任务</h1><p class="muted">每份文本独立记录结果；失败后由你决定是否重试。</p></div><button class="btn btn-outline-primary" :disabled="refreshBusy" @click="refresh">刷新任务</button></section><section class="surface"><div v-if="!jobs.length" class="empty-state"><span class="empty-mark">◷</span><h2>还没有自动标注任务。</h2><p class="muted">从文本库选择文本，或在工作台开始自动标注。</p><button class="btn btn-outline-primary" @click="navigate('library')">前往文本库</button></div><article v-for="job in jobs" :key="job.id" class="job-row"><div><strong>{{ job.title }}</strong><p class="caption muted mb-0">{{ timestamp(job.createdAt) }} · {{ job.provider }} · {{ shortId(job.id) }}</p><p v-if="job.errorMessage" class="caption mb-0">{{ job.errorMessage }}</p></div><span class="quiet-badge">{{ stateNames[job.state] || job.state }}</span><button class="text-action" @click="openCandidate(job.id)">查看结果 ↗</button></article></section></template>
    <StatisticsView v-else-if="page === 'statistics'" :statistics="statistics" @refresh="refresh"/><DeveloperCenter v-else-if="page === 'developer'"/>
  </main></div>
  <dialog ref="editorDialog" class="workspace-dialog" @cancel.prevent="closeEditor"><form @submit.prevent="saveText"><fieldset :disabled="editorBusy"><header><div><p class="eyebrow">{{ editor.id ? 'EDIT TEXT' : 'NEW TEXT' }}</p><h2>{{ editor.id ? '编辑原始文本' : '新建文本' }}</h2></div><button type="button" class="close-button" :disabled="editorBusy" aria-label="关闭编辑" @click="closeEditor">×</button></header><p v-if="editor.id" class="caption muted">文本改变会生成新修订，已有标注留在历史中。</p><label class="form-label" for="documentTitle">标题</label><input id="documentTitle" v-model="editor.title" class="form-control mb-3" maxlength="200" required autofocus><label class="form-label" for="documentText">原始文本</label><textarea id="documentText" v-model="editor.text" class="form-control text-editor" rows="10" required placeholder="粘贴或输入需要标注的中文文本…"></textarea><p class="caption muted mt-2">{{ Array.from(editor.text).length }} / 10,000 码点 · 空格与换行原样保留</p><p v-if="editorError" role="alert" class="inline-error">{{ editorError }}</p><button v-if="editorConflict" type="button" class="text-action" @click="reloadTextVersion">载入最新版本号并保留输入</button><details v-if="editorLatest" class="mt-3 caption"><summary>对照最新保存原文：{{ editorLatest.title }}</summary><p class="text-comparison">{{ editorLatest.revision.textBody }}</p></details><footer><button type="button" class="btn btn-outline-primary" :disabled="editorBusy" @click="closeEditor">取消</button><button class="btn btn-primary" :disabled="editorBusy">{{ editorBusy ? '正在保存…' : '保存文本' }}</button></footer></fieldset></form></dialog>
  <dialog ref="modelDialog" class="workspace-dialog model-dialog" @cancel="modelBusy && $event.preventDefault()"><form @submit.prevent="startModel"><header><div><p class="eyebrow">AUTOMATIC ANNOTATION</p><h2>{{ retryTarget ? '显式重试失败层' : '自动标注' }}</h2></div><button type="button" class="close-button" :disabled="modelBusy" aria-label="关闭自动标注" @click="modelDialog.close()">×</button></header><p>{{ retryTarget ? (retryTarget.response ? '保留成功层与旧尝试，只重新调用失败层。' : '此前没有完整回执；本次将重新调用所选全部层，可能产生重复计费，请先核对供应商调用记录。') : `将为 ${modelTargets.length} 份文本建立独立任务。` }}</p><div v-if="!retryTarget" class="task-options"><label v-for="(name, task) in taskNames" :key="task" class="checkbox-label"><input v-model="selectedTasks" class="form-check-input" type="checkbox" :value="task">{{ name }}</label></div><p v-if="selectedTasks.includes('pos') && !selectedTasks.includes('segmentation') && !retryTarget" class="caption muted">词性会显式补充分词依赖。</p><label v-if="!retryTarget" class="form-label mt-3" for="providerName">模型供应商</label><input v-if="!retryTarget" id="providerName" v-model="provider" class="form-control" pattern="[a-z][a-z0-9_]{0,39}" required><p class="caption muted mt-2">默认 DeepSeek；其他供应商须先在本地配置，不会自动切换。</p><div class="consent-panel"><strong>文本将发送到所选模型服务。</strong><p class="caption">仅使用你有权发送的文本。受限课程语料尚未获授权，不可外发。本地验证建议使用原创合成文本。</p><label class="checkbox-label caption"><input v-model="remoteConsent" class="form-check-input" type="checkbox">我确认这些文本允许发送到所选模型。</label></div><p v-if="modelError" role="alert" class="inline-error">{{ modelError }}</p><footer><button type="button" class="btn btn-outline-primary" :disabled="modelBusy" @click="modelDialog.close()">取消</button><button class="btn btn-primary" :disabled="modelBusy">{{ modelBusy ? '正在提交…' : retryTarget ? '重试失败层' : '开始标注' }}</button></footer></form></dialog>
</template>
