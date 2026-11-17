import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";

// The selected button remains the source of truth; this element only follows it.
export function useNavIndicator(selection) {
  const nav = ref(null), indicator = ref({ opacity: 0 });
  let observer;
  function update() {
    const container = nav.value, active = container?.querySelector('[aria-current="page"]');
    if (!active) return;
    const parent = container.getBoundingClientRect(), box = active.getBoundingClientRect();
    indicator.value = { width: `${box.width}px`, height: `${box.height}px`, transform: `translate(${box.left - parent.left + container.scrollLeft}px, ${box.top - parent.top}px)`, opacity: 1 };
  }
  watch(selection, async () => { await nextTick(); update(); });
  onMounted(() => { observer = new ResizeObserver(update); observer.observe(nav.value); update(); });
  onUnmounted(() => observer?.disconnect());
  return { nav, indicator, update };
}
