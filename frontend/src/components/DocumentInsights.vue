<script setup>
import RelationshipExplorer from './RelationshipExplorer.vue';
defineProps({ layers: Object, source: String, text: String, activeTask: String, graphFocus: Object });
const emit = defineEmits(['focus']);
</script>
<template>
  <div class="document-insights"><RelationshipExplorer :graph-focus="graphFocus" :layers="layers" :text="text" :active-task="activeTask" @focus="emit('focus', $event)" /></div>
</template>
