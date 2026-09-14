<script setup>
// 大图预览(Task 6.3)。modal-motion / escape-routes / scrim(blur-purpose)。
import { computed, ref } from 'vue'
import { useWorkbenchStore } from '../stores/workbench.js'
import AssetImage from './AssetImage.vue'
import AppIcon from './AppIcon.vue'
import { downloadBlob, imageFileName } from '../lib/download.js'
import { sourceFullLabel } from '../lib/assetSource.js'
import { useDialogA11y } from '../composables/useDialogA11y.js'
import { getAsset } from '../lib/assetRepo.js'

const props = defineProps({
  asset: Object,
  // 相邻图片列表:多图生成/素材库内浏览时支持左右切换
  list: { type: Array, default: () => [] },
})
const emit = defineEmits(['close', 'use-as-reference', 'change'])
const store = useWorkbenchStore()
const viewer = ref(null)

const idx = computed(() => {
  const i = props.list.findIndex((a) => a?.id === props.asset?.id)
  return i >= 0 ? i : 0
})
const current = computed(() => props.list[idx.value] || props.asset)
const canNav = computed(() => props.list.length > 1)
// 用 store 里的实时素材,收藏后 UI 立刻更新
const live = computed(() => store.assets.find((a) => a.id === current.value?.id) || current.value)

function step(dir) {
  if (!canNav.value) return
  const next = (idx.value + dir + props.list.length) % props.list.length
  emit('change', props.list[next])
}

function onKey(e) {
  if (e.key === 'Escape') emit('close')
  if (e.key === 'ArrowLeft') step(-1)
  if (e.key === 'ArrowRight') step(1)
}
useDialogA11y(viewer, () => emit('close'), onKey)

async function download() {
  const a = live.value
  if (!a) return
  const full = a.blob ? a : await getAsset(a.id)
  if (!full?.blob) return
  const ext = (full.mime.split('/')[1] || 'png').replace('jpeg', 'jpg')
  // 优先用产出该图的生成记录 prompt,其次素材名,保证下载名可读
  const gen = store.generations.find((g) => (g.outputImageIds || []).includes(a.id))
  downloadBlob(full.blob, imageFileName({ id: full.id, prompt: gen?.prompt, name: full.name, ext }))
}
</script>

<template>
  <div class="scrim" @click.self="emit('close')">
    <div ref="viewer" class="viewer" role="dialog" aria-modal="true" aria-label="图片预览" tabindex="-1">
      <div class="viewer-img">
        <AssetImage :asset="live" alt="预览" />
      </div>
      <div class="viewer-bar tnum">
        <span>{{ live.width && live.height ? `${live.width}×${live.height}` : '' }} {{ live.mime }}</span>
        <span class="src-chip">{{ sourceFullLabel(live.source) }}</span>
        <div v-if="canNav" class="viewer-nav">
          <button class="btn btn-sm btn-ghost" @click="step(-1)" aria-label="上一张">
            <AppIcon name="chevron-left" :size="13" />
          </button>
          <span class="nav-count tnum">{{ idx + 1 }} / {{ list.length }}</span>
          <button class="btn btn-sm btn-ghost" @click="step(1)" aria-label="下一张">
            <AppIcon name="chevron-right" :size="13" />
          </button>
        </div>
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
.src-chip {
  padding: 2px 8px; border-radius: 999px; font-size: 11px;
  color: var(--color-fg-muted); background: var(--color-surface-2);
  border: 1px solid var(--color-border);
}
.viewer-nav { display: inline-flex; align-items: center; gap: 2px; }
.viewer-nav .btn { min-height: 28px; padding: 0 8px; }
.nav-count { font-size: 11px; color: var(--color-fg-muted); min-width: 40px; text-align: center; }
.spacer { flex: 1; min-width: 8px; }
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
</style>
