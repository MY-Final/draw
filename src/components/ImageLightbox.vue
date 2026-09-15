<script setup>
// 大图预览(Task 6.3)。modal-motion / escape-routes / scrim(blur-purpose)。
import { computed, ref, watch, onUnmounted } from 'vue'
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

// 产出该图的生成记录:用来展示 prompt(找不到就退回「被当参考图引用」的记录)
const sourceGen = computed(() => {
  const id = live.value?.id
  if (!id) return null
  return store.generations.find((g) => (g.outputImageIds || []).includes(id))
    || store.generations.find((g) => (g.refImageIds || []).includes(id))
    || null
})
const promptText = computed(() => (sourceGen.value?.prompt || '').trim())

// ── 缩放/平移:出图验收要看细节(手指、文字、边缘),只用 contain 远远不够 ──
const MIN_SCALE = 1
const MAX_SCALE = 4
const scale = ref(1)
const offset = ref({ x: 0, y: 0 })
const panning = ref(false)
let panStart = null

const zoomLabel = computed(() => `${Math.round(scale.value * 100)}%`)
const zoomStyle = computed(() => ({
  transform: `translate(${offset.value.x}px, ${offset.value.y}px) scale(${scale.value})`,
}))

function resetView() {
  scale.value = 1
  offset.value = { x: 0, y: 0 }
  panning.value = false
  panStart = null
}
function clampScale(v) { return Math.min(MAX_SCALE, Math.max(MIN_SCALE, v)) }
function zoomTo(next) {
  const target = clampScale(next)
  // 缩回原始比例时把位移一并清掉,避免图停在画面外
  if (target === MIN_SCALE) { resetView(); return }
  scale.value = target
}
function zoomBy(delta) { zoomTo(scale.value + delta) }
function onWheel(e) {
  e.preventDefault()
  zoomBy(e.deltaY < 0 ? 0.25 : -0.25)
}
function toggleZoom() {
  if (scale.value > MIN_SCALE) resetView()
  else zoomTo(2)
}
function onPanStart(e) {
  if (scale.value <= MIN_SCALE) return
  panning.value = true
  panStart = { x: e.clientX - offset.value.x, y: e.clientY - offset.value.y }
  e.currentTarget.setPointerCapture?.(e.pointerId)
}
function onPanMove(e) {
  if (!panning.value || !panStart) return
  offset.value = { x: e.clientX - panStart.x, y: e.clientY - panStart.y }
}
function onPanEnd() {
  panning.value = false
  panStart = null
}

function step(dir) {
  if (!canNav.value) return
  const next = (idx.value + dir + props.list.length) % props.list.length
  emit('change', props.list[next])
}

const flash = ref('')
let flashTimer = null
function showFlash(text) {
  flash.value = text
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => { flash.value = '' }, 2400)
}
async function copyPrompt() {
  if (!promptText.value) return
  try {
    await navigator.clipboard.writeText(promptText.value)
    showFlash('已复制提示词')
  } catch {
    showFlash('复制失败，请手动选中')
  }
}
async function copyImage() {
  const full = await fullAsset()
  if (!full?.blob) return
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    showFlash('当前浏览器不支持复制图片，请用下载')
    return
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ [full.mime || 'image/png']: full.blob })])
    showFlash('已复制图片')
  } catch {
    showFlash('复制图片失败，请用下载')
  }
}

function onKey(e) {
  if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return
  if (e.key === 'Escape') emit('close')
  if (e.key === 'ArrowLeft') step(-1)
  if (e.key === 'ArrowRight') step(1)
  if (e.key === '+' || e.key === '=') zoomBy(0.25)
  if (e.key === '-' || e.key === '_') zoomBy(-0.25)
  if (e.key === '0') resetView()
}
useDialogA11y(viewer, () => emit('close'), onKey)
// 换图时重置视图,否则下一张会继承上一张的缩放和位移
watch(() => live.value?.id, resetView)
onUnmounted(() => { if (flashTimer) clearTimeout(flashTimer) })

async function fullAsset() {
  const a = live.value
  if (!a) return null
  if (a.blob) return a
  return await getAsset(a.id)
}
async function download() {
  const full = await fullAsset()
  if (!full?.blob) return
  const ext = (full.mime.split('/')[1] || 'png').replace('jpeg', 'jpg')
  // 优先用产出该图的生成记录 prompt,其次素材名,保证下载名可读
  downloadBlob(full.blob, imageFileName({ id: full.id, prompt: sourceGen.value?.prompt, name: full.name, ext }))
}
</script>

<template>
  <div class="scrim" @click.self="emit('close')">
    <div ref="viewer" class="viewer" role="dialog" aria-modal="true" aria-label="图片预览" tabindex="-1">
      <div
        class="viewer-img" :class="{ zoomed: scale > MIN_SCALE, panning }"
        @wheel="onWheel" @dblclick="toggleZoom"
        @pointerdown="onPanStart" @pointermove="onPanMove"
        @pointerup="onPanEnd" @pointercancel="onPanEnd"
      >
        <!-- 变换放在内层 stage 上:AssetImage 是多根节点组件,样式不会透传到 <img> -->
        <div class="viewer-stage" :style="zoomStyle">
          <AssetImage :asset="live" alt="预览" />
        </div>
      </div>
      <p v-if="promptText" class="viewer-prompt" :title="promptText">
        <span class="viewer-prompt-text">{{ promptText }}</span>
        <button class="btn btn-sm btn-ghost" @click="copyPrompt"><AppIcon name="edit" :size="12" /> 复制提示词</button>
      </p>
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
        <div class="viewer-zoom">
          <button class="btn btn-sm btn-ghost" @click="zoomBy(-0.25)" :disabled="scale <= MIN_SCALE" aria-label="缩小">
            <AppIcon name="minus" :size="13" />
          </button>
          <button class="btn btn-sm btn-ghost zoom-value" @click="resetView" title="双击图片也能缩放/还原">{{ zoomLabel }}</button>
          <button class="btn btn-sm btn-ghost" @click="zoomBy(0.25)" :disabled="scale >= MAX_SCALE" aria-label="放大">
            <AppIcon name="plus" :size="13" />
          </button>
        </div>
        <div class="spacer" />
        <span v-if="flash" class="flash" role="status" aria-live="polite">{{ flash }}</span>
        <button
          class="btn btn-sm"
          :class="{ on: live.favorite }"
          @click="store.toggleAssetFavorite(live.id)"
          :aria-label="live.favorite ? '取消收藏' : '收藏'"
        >
          <AppIcon name="heart" :size="13" /> {{ live.favorite ? '已收藏' : '收藏' }}
        </button>
        <button class="btn btn-sm" @click="emit('use-as-reference', live.id)">
          <AppIcon name="layers" :size="13" /> 设为参考图
        </button>
        <button class="btn btn-sm" @click="copyImage" title="复制图片到剪贴板">
          <AppIcon name="image" :size="13" /> 复制图片
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
  background: rgba(0, 0, 0, 0.75);
  display: flex; align-items: center; justify-content: center;
  animation: fade var(--dur) var(--ease);
}
.viewer { display: flex; flex-direction: column; gap: var(--space-2); max-width: 90vw; max-height: 90vh; }
.viewer-img {
  max-height: 80vh; display: flex; overflow: hidden;
  border-radius: var(--radius);
}
.viewer-stage {
  display: flex; transform-origin: center center;
  transition: transform 120ms var(--ease-out);
}
.viewer-img.panning .viewer-stage { transition: none; }
/* 放大后可拖拽平移,光标同步成抓手 */
.viewer-img.zoomed { cursor: grab; }
.viewer-img.zoomed.panning { cursor: grabbing; }
.viewer-prompt {
  display: flex; align-items: center; gap: var(--space-2);
  margin: 0; padding: 8px 10px; border-radius: 12px;
  background: var(--color-elevated); border: 1px solid var(--color-border);
  font-size: 12px; color: var(--color-fg-muted);
}
.viewer-prompt-text {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.viewer-zoom { display: inline-flex; align-items: center; gap: 2px; }
.viewer-zoom .btn { min-height: 28px; padding: 0 8px; }
.zoom-value { min-width: 52px; justify-content: center; font-variant-numeric: tabular-nums; }
.flash {
  font-size: 11px; color: var(--color-primary);
  padding: 3px 8px; border-radius: 999px; background: var(--color-primary-soft);
}
.viewer-img :deep(.asset-img) { object-fit: contain; max-height: 80vh; width: auto; max-width: 90vw; border-radius: var(--radius); }
.viewer-bar {
  display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;
  font-size: 12px; color: var(--color-fg-muted);
  padding: 8px 10px; border-radius: 14px;
  background: var(--color-elevated);
  border: 1px solid var(--color-border-strong);
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
