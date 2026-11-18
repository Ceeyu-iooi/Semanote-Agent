<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { entityNames, taskNames, labelNames } from "../api.js";
import PointerTip from "./PointerTip.vue";
import { buildSegments } from "../annotationPresentation.js";
const props = defineProps({
  text: { type: String, default: "" },
  items: { type: Array, default: () => [] },
  selectable: Boolean,
  focusedItem: String,
  focusRange: Object,
  preferences: Object,
  revealKey: String,
  breaks: { type: Array, default: () => [] },
});
const emit = defineEmits(["select", "focus"]);
const canvas = ref(null),
  tip = ref(null);
const segments = computed(() => buildSegments(props.text, props.items, props.breaks,
  props.focusRange ? [props.focusRange.start, props.focusRange.end] : []));
const tipHeight = computed(() => {
  const maxRows = segments.value.reduce((max, entry) => Math.max(max, entry.matches.length), 0);
  return Math.min(320, 90 + maxRows * 29);
});
function selectText() {
  if (!props.selectable) return;
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  if (
    !canvas.value.contains(range.startContainer) ||
    !canvas.value.contains(range.endContainer)
  )
    return;
  const prefix = range.cloneRange();
  prefix.selectNodeContents(canvas.value);
  prefix.setEnd(range.startContainer, range.startOffset);
  const text = range.toString();
  if (!text.trim()) return;
  const start = Array.from(prefix.toString()).length;
  emit("select", { start, end: start + Array.from(text).length, text });
}
onMounted(() => document.addEventListener("selectionchange", selectText));
onUnmounted(() => document.removeEventListener("selectionchange", selectText));
function showTip(segment, event) {
  if (!segment.matches.length) {
    tip.value = null;
    return;
  }
  const rectangle = event.currentTarget.getBoundingClientRect();
  tip.value = {
    ...segment,
    text: segment.sourceText || segment.text,
    x: event.clientX ?? rectangle.left,
    y: event.clientY ?? rectangle.bottom,
  };
}
</script>
<template>
  <div
    ref="canvas"
    class="annotation-canvas"
    :class="{ 'annotation-reveal': revealKey }"
    :style="{
      fontFamily: preferences?.fontFamily,
      fontSize: `${preferences?.fontSize || 19}px`,
      lineHeight: preferences?.lineHeight || 2.1,
    }"
    @pointerup="selectText"
    @keyup="selectText"
    @pointerleave="tip = null"
    @wheel="tip = null"
  >
    <span
      v-for="(segment, index) in segments"
      :key="`${revealKey}-${segment.start}`"
      :data-start="segment.start"
      :class="[
        segment.classes,
        {
          'semantic-break': segment.breakBefore,
          'has-annotation': segment.matches.some(item => item.task !== 'paragraphs'),
          'token-end': segment.tokenEnd,
          'token-start': segment.tokenStart,
          'focused-text': (focusRange && segment.start >= focusRange.start && segment.end <= focusRange.end) || segment.matches.some(
            (item) => item.itemId === focusedItem,
          ),
        },
      ]"
      :style="{
        '--reveal-delay': `${(index / Math.max(1, segments.length)) * Math.min(1600, segments.length * 18)}ms`,
      }"
      :tabindex="
        segment.matches.length && segment.firstCharacter !== false
          ? 0
          : undefined
      "
      :aria-label="
        segment.matches.length
          ? segment.matches
              .map(
                (item) =>
                  `${taskNames[item.task]} ${entityNames[item.label] || labelNames[item.label] || item.label || ''}`,
              )
              .join('；')
          : undefined
      "
      @pointermove="showTip(segment, $event)"
      @focus="showTip(segment, $event)"
      @blur="tip = null"
      @click="
        segment.matches.length &&
        emit(
          'focus',
          segment.matches.map((item) => item.itemId),
        )
      "
      @keydown.enter="
        emit(
          'focus',
          segment.matches.map((item) => item.itemId),
        )
      "
      >{{ segment.text }}</span
    >
  </div>
  <PointerTip :anchor="tip" variant="annotation" :min-height="tipHeight"
    ><strong>{{ tip?.text }}</strong>
    <div v-for="item in tip?.matches" :key="item.itemId" class="popover-row">
      <span><i :class="`tip-dot tip-dot--${item.task}`" aria-hidden="true"></i>{{ taskNames[item.task] }}</span
      ><b>{{
        entityNames[item.label] ||
        labelNames[item.label] ||
        item.label ||
        (item.rank ? `第 ${item.rank} 位` : "词项")
      }}</b><small>{{ (item.spans || []).filter(span => span.start <= tip.start && span.end >= tip.end).map(span => `${span.start}–${span.end}`).join('、') }}</small>
    </div>
    <small>点击定位条目</small></PointerTip
  >
</template>
