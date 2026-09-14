<script setup>
// 素材图片渲染 —— 统一走 objectURL 管理(design D5 / Task 2.4),挂载 acquire、卸载 release。
// image-dimension 规则:用 aspect-ratio 预留空间,避免布局跳动(CLS)。
import { ref, watch, onUnmounted } from 'vue'
import { acquireUrl, releaseUrl } from '../lib/objectUrl.js'
import { getAssetBlob } from '../lib/assetRepo.js'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  asset: { type: Object, required: true },
  alt: { type: String, default: '生成的图片' },
})

const url = ref('')
const loading = ref(false)
const failed = ref(false)
let currentId = null
let loadToken = 0

async function bind(asset) {
  if (currentId) releaseUrl(currentId)
  currentId = asset.id
  url.value = ''
  loading.value = true
  failed.value = false
  const token = ++loadToken
  try {
    const blob = asset.blob || await getAssetBlob(asset.id)
    if (token !== loadToken) return
    if (!blob) {
      failed.value = true
      return
    }
    url.value = acquireUrl(asset.id, blob)
  } catch {
    if (token === loadToken) failed.value = true
  } finally {
    if (token === loadToken) loading.value = false
  }
}

watch(() => props.asset, (a) => a && bind(a), { immediate: true })
function onImageError() {
  if (!url.value) return
  url.value = ''
  failed.value = true
  if (currentId) {
    releaseUrl(currentId)
    currentId = null
  }
}
onUnmounted(() => {
  loadToken += 1
  if (currentId) releaseUrl(currentId)
})
</script>

<template>
  <div v-if="loading && !url" class="asset-image-placeholder" aria-hidden="true">
    <AppIcon name="image" :size="14" />
  </div>
  <div v-else-if="failed" class="asset-image-placeholder asset-image-placeholder-error" role="img" :aria-label="`${alt}加载失败`">
    <AppIcon name="alert" :size="14" />
  </div>
  <img v-else :src="url" :alt="alt" loading="lazy" class="asset-img" @error="onImageError" />
</template>

<style scoped>
.asset-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: var(--color-surface-2);
}
.asset-image-placeholder {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: var(--color-fg-subtle);
  background: var(--color-surface-2);
}
.asset-image-placeholder-error { color: var(--color-warning); }
</style>
