<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'

const props = defineProps({ createdAt: { type: Number, required: true } })
const now = ref(Date.now())
let timer = null

const text = computed(() => `${(Math.max(0, now.value - props.createdAt) / 1000).toFixed(1)}s`)

onMounted(() => {
  timer = setInterval(() => { now.value = Date.now() }, 100)
})
onUnmounted(() => clearInterval(timer))
</script>

<template><span class="elapsed tnum">{{ text }}</span></template>
