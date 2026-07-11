<script setup>
// 素材图片渲染 —— 统一走 objectURL 管理(design D5 / Task 2.4),挂载 acquire、卸载 release。
// image-dimension 规则:用 aspect-ratio 预留空间,避免布局跳动(CLS)。
import { ref, watch, onUnmounted } from 'vue'
import { acquireUrl, releaseUrl } from '../lib/objectUrl.js'

const props = defineProps({
  asset: { type: Object, required: true },
  alt: { type: String, default: '生成的图片' },
})

const url = ref('')
let currentId = null

function bind(asset) {
  if (currentId) releaseUrl(currentId)
  currentId = asset.id
  url.value = acquireUrl(asset.id, asset.blob)
}

watch(() => props.asset, (a) => a && bind(a), { immediate: true })
onUnmounted(() => currentId && releaseUrl(currentId))
</script>

<template>
  <img :src="url" :alt="alt" loading="lazy" class="asset-img" />
</template>

<style scoped>
.asset-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: var(--color-surface-2);
}
</style>
