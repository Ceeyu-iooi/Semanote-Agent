<script setup>
import { ref,useId } from 'vue';
import PointerTip from './PointerTip.vue';
defineProps({ text: String });
const id = useId();
const anchor=ref(null);
function show(event){const rectangle=event.currentTarget.getBoundingClientRect();anchor.value={x:event.clientX??rectangle.left,y:event.clientY??rectangle.bottom};}
</script>
<template><span class="hint-wrap" @pointermove="show" @pointerleave="anchor=null" @focusin="show" @focusout="anchor=null"><slot :describedby="id"></slot><PointerTip :anchor="anchor"><span :id="id">{{ text }}</span></PointerTip></span></template>
