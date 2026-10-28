<script setup>
import { useId } from 'vue';
defineProps({ text: String });
const id = useId();
</script>
<template><span class="hint-wrap"><slot :describedby="id"></slot><span :id="id" role="tooltip" class="micro-hint">{{ text }}</span></span></template>
