<script setup>
// 内联 SVG 图标(no-emoji-icons 规则)。Lucide 风格,统一 1.75 描边。
const props = defineProps({ name: String, size: { type: Number, default: 18 } })

const paths = {
  sparkles: 'M9 3l1.5 4.5L15 9l-4.5 1.5L9 15l-1.5-4.5L3 9l4.5-1.5L9 3zM18 13l.8 2.4L21 16l-2.2.6L18 19l-.8-2.4L15 16l2.2-.6L18 13z',
  image: 'M3 5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm2 12l4-4 3 3 4-5 3 4M8.5 9a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
  trash: 'M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0v12a1 1 0 001 1h6a1 1 0 001-1V7',
  plus: 'M12 5v14M5 12h14',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-2.82 1.17V21a2 2 0 01-4 0v-.09A1.65 1.65 0 006 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15H4a2 2 0 010-4h.09A1.65 1.65 0 006 8.6a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 0011 4.6h.09A1.65 1.65 0 0012 3a2 2 0 014 0v.09A1.65 1.65 0 0019.4 6l.06-.06a2 2 0 112.83 2.83',
  download: 'M12 3v12m0 0l-4-4m4 4l4-4M5 21h14',
  upload: 'M12 21V9m0 0l-4 4m4-4l4 4M5 3h14',
  share: 'M4 12v8a1 1 0 001 1h14a1 1 0 001-1v-8M16 6l-4-4-4 4M12 2v13',
  check: 'M5 13l4 4L19 7',
  x: 'M6 6l12 12M18 6L6 18',
  refresh: 'M4 12a8 8 0 0114-5.3L20 8M20 12a8 8 0 01-14 5.3L4 16M20 4v4h-4M4 20v-4h4',
  sun: 'M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z',
  layers: 'M12 2l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5',
  alert: 'M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.4 3.9a2 2 0 00-3.4 0z',
  heart: 'M20.8 5.6a5.5 5.5 0 00-7.8 0L12 6.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 22l7.8-7.6 1-1a5.5 5.5 0 000-7.8z',
  filter: 'M4 5h16M7 12h10M10 19h4',
}
</script>

<template>
  <svg
    :width="size" :height="size" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name]" />
  </svg>
</template>
