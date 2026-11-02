<script setup>
defineProps({ name: String });
const paths = {
  library: "M4 5h16v15H4z M8 2v6 M16 2v6 M8 12h8 M8 16h5",
  annotate: "M4 20h16 M6 16l2-6L18 0l4 4-10 10z M15 3l4 4",
  jobs: "M12 8v5l3 2 M20 12a8 8 0 1 1-3-6 M16 3v5h5",
  chart: "M4 20V11h4v9 M10 20V4h4v16 M16 20v-7h4v7",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z",
  code: "M8 6l-6 6 6 6 M16 6l6 6-6 6 M14 3l-4 18",
  search: "M17 17l5 5 M19 10a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  plus: "M12 4v16 M4 12h16",
  import: "M12 2v13 M7 10l5 5 5-5 M4 16v6h16v-6",
  arrow: "M4 12h16 M14 6l6 6-6 6",
  close: "M5 5l14 14 M19 5L5 19",
  check: "M4 12l5 5L20 6",
  play: "M7 3l14 9-14 9z",
  file: "M5 2h9l5 5v15H5z M14 2v6h5 M8 12h8 M8 16h6",
  layers: "M12 2L2 8l10 6 10-6z M2 13l10 6 10-6 M2 18l10 6 10-6",
};
</script>
<template>
  <svg
    class="app-icon"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name] || paths.file" />
  </svg>
</template>
