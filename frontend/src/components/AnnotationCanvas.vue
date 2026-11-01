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
  preferences: Object,
  revealKey: String,
  breaks: { type: Array, default: () => [] },
});
const emit = defineEmits(["select", "focus"]);
const canvas = ref(null),
  tip = ref(null);
const segments = computed(() =>
  buildSegments(props.text, props.items, props.breaks).flatMap((segment) =>
    props.revealKey && !props.selectable
      ? Array.from(segment.text).map((text, index, chars) => ({
          ...segment,
          text,
          sourceText: segment.text,
          firstCharacter: index === 0,
          start: segment.start + index,
          end: segment.start + index + 1,
          breakBefore: index === 0 && segment.breakBefore,
          tokenEnd: index === chars.length - 1 && segment.tokenEnd,
        }))
      : [segment],
  ),
);
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
    height: Math.min(450, 100 + segment.matches.length * 32),
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
          'has-annotation': segment.matches.length,
          'token-end': segment.tokenEnd,
          'focused-text': segment.matches.some(
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
  <PointerTip :anchor="tip"
    ><strong>{{ tip?.text }}</strong>
    <div v-for="item in tip?.matches" :key="item.itemId" class="popover-row">
      <span>{{ taskNames[item.task] }}</span
      ><b>{{
        entityNames[item.label] ||
        labelNames[item.label] ||
        item.label ||
        (item.rank ? `第 ${item.rank} 位` : "词项")
      }}</b>
    </div>
    <small
      >区间 {{ tip?.start }}–{{ tip?.end }} · 点击定位条目</small
    ></PointerTip
  >
</template>
