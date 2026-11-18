<script setup>
defineProps({ name: String });
const paths = {
  segmentation: 'M4 5h6v14H4z M14 5h6v14h-6z',
  keywords: 'M14 4a6 6 0 1 1-4 10l-6 6H2v-3l6-6a6 6 0 0 1 6-7 M16 7h.01',
  pos: 'M3 5h18 M7 5v14 M3 19h8 M15 10h6 M18 10v9',
  ner: 'M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M5 21v-3a7 7 0 0 1 14 0v3',
  paragraphs: 'M5 4h14 M5 8h14 M5 14h14 M5 18h10',
  relations: 'M7 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M23 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M7 7l10 9',
  events: 'M4 5h16v16H4z M8 2v6 M16 2v6 M8 13h8 M8 17h5',
  sentiment: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M8 9h.01 M16 9h.01 M8 15q4 4 8 0',
  intent: 'M4 20L20 4 M10 4h10v10',
  semantic: 'M3 4h7l2 2 2-2h7v15h-7l-2 2-2-2H3z M12 6v15',
  errors: 'M12 3L2 21h20z M12 9v5 M12 18h.01',
  library: "M3 4h5v16H3z M10 4h5v16h-5z M17 5l4-1 3 15-4 1z",
  annotate: "M4 20h16 M6 16l1-4L17 2l4 4-10 10z M14 5l4 4",
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
  layers: "M12 2L2 7l10 5 10-5z M2 12l10 5 10-5 M2 17l10 5 10-5",
  sun: "M12 3v2 M12 19v2 M3 12h2 M19 12h2 M5.6 5.6L7 7 M17 17l1.4 1.4 M18.4 5.6L17 7 M7 17l-1.4 1.4 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  moon: "M20 15A8 8 0 0 1 9 4a8 8 0 1 0 11 11z",
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
