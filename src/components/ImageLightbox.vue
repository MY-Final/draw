<script setup>
// 大图预览(Task 6.3)。modal-motion / escape-routes / scrim(blur-purpose)。
import { computed, onMounted, onUnmounted } from 'vue'
import { useWorkbenchStore } from '../stores/workbench.js'
import AssetImage from './AssetImage.vue'
import AppIcon from './AppIcon.vue'
import { downloadBlob } from '../lib/download.js'

const props = defineProps({ asset: Object })
const emit = defineEmits(['close', 'use-as-reference'])
const store = useWorkbenchStore()

// 用 store 里的实时素材,收藏后 UI 立刻更新
const live = computed(() => store.assets.find((a) => a.id === props.asset?.id) || props.asset)

function onKey(e) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))

function download() {
  const a = live.value
  if (!a) return
  const ext = (a.mime.split('/')[1] || 'png').replace('jpeg', 'jpg')
  downloadBlob(a.blob, `${a.id}.${ext}`)
}
</script>

<template>
  <div class="scrim" @click.self="emit('close')" role="dialog" aria-label="图片预览">
    <div class="viewer">
      <div class="viewer-img">
        <AssetImage :asset="live" alt="预览" />
      </div>
      <div class="viewer-bar tnum">
        <span>{{ live.width && live.height ? `${live.width}×${live.height}` : '' }} {{ live.mime }}</span>
        <div class="spacer" />
        <button
          class="btn btn-sm"
          :class="{ on: live.favorite }"
          @click="store.toggleAssetFavorite(live.id)"
          :aria-label="live.favorite ? '取消收藏' : '收藏'"
        >
          <AppIcon name="heart" :size="13" /> {{ live.favorite ? '已收藏' : '收藏' }}
        </button>
        <button class="btn btn-sm" @click="emit('use-as-reference', live.id)">
          <AppIcon name="layers" :size="13" /> 设为参考
        </button>
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
.viewer-bar {
  display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;
  font-size: 12px; color: var(--color-fg-muted);
  padding: 8px 10px; border-radius: 14px;
  background: color-mix(in srgb, var(--color-elevated) 88%, transparent);
  border: 1px solid var(--color-border-strong);
  backdrop-filter: blur(10px);
}
.viewer-bar .btn.on { color: var(--color-heart); border-color: color-mix(in srgb, var(--color-heart) 40%, transparent); }
.viewer-bar .btn.on :deep(svg) { fill: var(--color-heart); }
.spacer { flex: 1; min-width: 8px; }
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
</style>
