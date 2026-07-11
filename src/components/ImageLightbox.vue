<script setup>
// 大图预览(Task 6.3)。modal-motion / escape-routes / scrim(blur-purpose)。
import { onMounted, onUnmounted } from 'vue'
import AssetImage from './AssetImage.vue'
import AppIcon from './AppIcon.vue'
import { downloadBlob } from '../lib/download.js'

const props = defineProps({ asset: Object })
const emit = defineEmits(['close'])

function onKey(e) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))

function download() {
  const ext = (props.asset.mime.split('/')[1] || 'png').replace('jpeg', 'jpg')
  downloadBlob(props.asset.blob, `${props.asset.id}.${ext}`)
}
</script>

<template>
  <div class="scrim" @click.self="emit('close')" role="dialog" aria-label="图片预览">
    <div class="viewer">
      <div class="viewer-img">
        <AssetImage :asset="asset" alt="预览" />
      </div>
      <div class="viewer-bar tnum">
        <span>{{ asset.width && asset.height ? `${asset.width}×${asset.height}` : '' }} {{ asset.mime }}</span>
        <div class="spacer" />
        <button class="btn btn-sm" @click="download"><AppIcon name="download" :size="13" /> 下载</button>
        <button class="btn btn-sm btn-ghost" @click="emit('close')" aria-label="关闭"><AppIcon name="x" :size="14" /></button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scrim {
  position: fixed; inset: 0; z-index: 150; padding: var(--space-6);
  background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  animation: fade var(--dur) var(--ease);
}
.viewer { display: flex; flex-direction: column; gap: var(--space-2); max-width: 90vw; max-height: 90vh; }
.viewer-img { max-height: 80vh; display: flex; }
.viewer-img :deep(.asset-img) { object-fit: contain; max-height: 80vh; width: auto; max-width: 90vw; border-radius: var(--radius); }
.viewer-bar { display: flex; align-items: center; gap: var(--space-2); font-size: 12px; color: var(--color-fg-muted); }
.spacer { flex: 1; }
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
</style>
