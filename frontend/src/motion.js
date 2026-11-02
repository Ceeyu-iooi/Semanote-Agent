/** Animate presentation only; content stays complete and immediately interactive. */
export const reveal = {
  mounted(element, binding) {
    const reduced = () =>
      document.documentElement.dataset.motion === "reduced" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced()) return;
    element.classList.add("reveal-pending");
    element.style.setProperty(
      "--arrival-delay",
      `${Math.min(Number(binding.value) || 0, 7) * 45}ms`,
    );
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          element.classList.add("reveal-visible");
          observer.disconnect();
        }
      },
      { threshold: 0.04 },
    );
    observer.observe(element);
    element.revealObserver = observer;
  },
  unmounted(element) {
    element.revealObserver?.disconnect();
  },
};
