<script setup>
import { computed, ref } from 'vue';
const props = defineProps({ text: { type: String, default: '' }, items: { type: Array, default: () => [] }, selectable: Boolean, focusedItem: String });
const emit = defineEmits(['select', 'focus']);
const canvas = ref(null);
const segments = computed(() => {
  const characters = Array.from(props.text);
  const boundaries = new Set([0, characters.length]);
  for (const item of props.items) for (const span of item.spans) { boundaries.add(span.start); boundaries.add(span.end); }
  const points = [...boundaries].sort((left, right) => left - right);
  return points.slice(0, -1).map((start, index) => {
    const end = points[index + 1];
    const matches = props.items.filter(item => item.spans.some(span => span.start <= start && span.end >= end));
    return { start, text: characters.slice(start, end).join(''), matches };
  });
});
function selectText() {
  if (!props.selectable) return;
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  if (!canvas.value.contains(range.startContainer) || !canvas.value.contains(range.endContainer)) return;
  const prefix = range.cloneRange();
  prefix.selectNodeContents(canvas.value);
  prefix.setEnd(range.startContainer, range.startOffset);
  const selectedText = range.toString();
  if (!selectedText.trim()) return;
  const start = Array.from(prefix.toString()).length;
  emit('select', { start, end: start + Array.from(selectedText).length, text: selectedText });
}
</script>

<template>
  <div ref="canvas" class="annotation-canvas" @mouseup="selectText" @keyup="selectText"><span v-for="segment in segments" :key="segment.start" :class="{ 'annotated-text': segment.matches.length, 'overlapping-text': segment.matches.length > 1, 'focused-text': segment.matches.some(item => item.itemId === focusedItem) }" @click="segment.matches.length && emit('focus', segment.matches.map(item => item.itemId))">{{ segment.text }}</span></div>
</template>
