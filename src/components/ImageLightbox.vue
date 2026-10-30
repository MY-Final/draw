<script setup>
// 大图预览(Task 6.3)。modal-motion / escape-routes / scrim(blur-purpose)。
import { computed, ref, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
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
const { t } = useI18n()
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
    showFlash(t('lightbox.copiedPrompt'))
  } catch {
    showFlash(t('lightbox.copyFailedManual'))
  }
}
async function copyImage() {
  const full = await fullAsset()
  if (!full?.blob) return
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    showFlash(t('lightbox.copyImageUnsupported'))
    return
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ [full.mime || 'image/png']: full.blob })])
    showFlash(t('lightbox.copiedImage'))
  } catch {
    showFlash(t('lightbox.copyImageFailed'))
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
    <div ref="viewer" class="viewer" role="dialog" aria-modal="true" :aria-label="t('lightbox.preview')" tabindex="-1">
      <!-- 画面:居中大图,翻页与缩放浮在画面上,不挤占版面 -->
      <div class="stage">
        <button v-if="canNav" class="stage-arrow prev" @click="step(-1)" :aria-label="t('lightbox.prev')">
          <AppIcon name="chevron-left" :size="18" />
        </button>
        <div
          class="viewer-img" :class="{ zoomed: scale > MIN_SCALE, panning }"
          @wheel="onWheel" @dblclick="toggleZoom"
          @pointerdown="onPanStart" @pointermove="onPanMove"
          @pointerup="onPanEnd" @pointercancel="onPanEnd"
        >
          <!-- 变换放在内层 canvas 上:AssetImage 是多根节点组件,样式不会透传到 <img> -->
          <div class="viewer-canvas" :style="zoomStyle">
            <AssetImage :asset="live" :alt="t('lightbox.previewAlt')" />
          </div>
        </div>
        <button v-if="canNav" class="stage-arrow next" @click="step(1)" :aria-label="t('lightbox.next')">
          <AppIcon name="chevron-right" :size="18" />
        </button>
        <div class="stage-zoom tnum">
          <button @click="zoomBy(-0.25)" :disabled="scale <= MIN_SCALE" :aria-label="t('lightbox.zoomOut')">
            <AppIcon name="minus" :size="13" />
          </button>
          <button class="zoom-value" @click="resetView" :title="t('lightbox.zoomHint')">{{ zoomLabel }}</button>
          <button @click="zoomBy(0.25)" :disabled="scale >= MAX_SCALE" :aria-label="t('lightbox.zoomIn')">
            <AppIcon name="plus" :size="13" />
          </button>
        </div>
      </div>

      <!-- 展签:提示词完整可读,操作不再挤在一条底栏里 -->
      <aside class="viewer-rail">
        <header class="rail-head">
          <h2 class="rail-title">{{ t('lightbox.title') }}</h2>
          <span v-if="canNav" class="rail-count tnum">{{ idx + 1 }}<span class="rail-count-sep">/</span>{{ list.length }}</span>
        </header>

        <section v-if="promptText" class="viewer-prompt">
          <div class="rail-prompt-head">
            <span class="rail-label">{{ t('lightbox.promptLabel') }}</span>
            <button class="rail-copy" @click="copyPrompt">
              <AppIcon name="copy" :size="11" /> {{ t('lightbox.copyPrompt') }}
            </button>
          </div>
          <p class="viewer-prompt-text">{{ promptText }}</p>
        </section>

        <div class="rail-foot">
          <div class="rail-meta tnum">
            <span v-if="live.width && live.height">{{ live.width }}×{{ live.height }}</span>
            <span>{{ live.mime }}</span>
            <span class="src-chip">{{ sourceFullLabel(live.source) }}</span>
          </div>
          <p v-if="flash" class="flash" role="status" aria-live="polite">{{ flash }}</p>
          <div class="rail-actions">
            <button
              class="rail-btn"
              :class="{ on: live.favorite }"
              @click="store.toggleAssetFavorite(live.id)"
              :aria-label="live.favorite ? t('lightbox.unfavorite') : t('lightbox.favorite')"
            >
              <AppIcon name="heart" :size="13" /> {{ live.favorite ? t('lightbox.favorited') : t('lightbox.favorite') }}
            </button>
            <button class="rail-btn rail-btn-primary" @click="emit('use-as-reference', live.id)">
              <AppIcon name="layers" :size="13" /> {{ t('lightbox.useAsReference') }}
            </button>
            <button class="rail-btn" @click="copyImage" :title="t('lightbox.copyImageHint')">
              <AppIcon name="image" :size="13" /> {{ t('lightbox.copyImage') }}
            </button>
            <button class="rail-btn" @click="download">
              <AppIcon name="download" :size="13" /> {{ t('lightbox.download') }}
            </button>
          </div>
        </div>
      </aside>

      <button class="viewer-close" @click="emit('close')" :aria-label="t('common.close')">
        <AppIcon name="x" :size="15" />
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 预览固定为暗室:舞台、展签、浮层都用同一套墨色,不随主题跳动。 */
.scrim {
  --lb-stage: #0a0907;
  --lb-rail: #14120d;
  --lb-line: #302b22;
  --lb-fg: #f2efe4;
  --lb-muted: #b3ad9d;
  --lb-subtle: #827b6b;
  position: fixed; inset: 0; z-index: 150;
  background: rgba(8, 7, 5, 0.94);
  animation: fade 140ms var(--ease);
}
.viewer {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  width: 100%; height: 100%; min-height: 0;
  outline: none;
}
.stage {
  position: relative; min-width: 0; min-height: 0;
  display: flex; align-items: stretch;
  padding: 28px 56px 88px;
  background:
    radial-gradient(78% 68% at 50% 44%, #1a1710 0%, #0d0c09 58%, #080706 100%);
}
.viewer-img {
  flex: 1; min-width: 0; min-height: 0;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden; touch-action: none;
}
.viewer-canvas {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  transform-origin: center center;
  transition: transform 120ms var(--ease-out);
}
.viewer-img.panning .viewer-canvas { transition: none; }
.viewer-img.zoomed { cursor: grab; }
.viewer-img.zoomed.panning { cursor: grabbing; }
/* 选择器带上 .viewer-canvas,确保压过 AssetImage 自身的 object-fit: cover;
   contain 留出的余量保持透明,否则会在暗室里露出画纸色。 */
.viewer-img .viewer-canvas :deep(.asset-img) {
  width: 100%; height: 100%; object-fit: contain;
  background: transparent;
  user-select: none; -webkit-user-drag: none;
}
.viewer-img .viewer-canvas :deep(.asset-image-placeholder) {
  background: rgba(255, 255, 255, 0.04);
  color: var(--lb-subtle);
}

/* 画面浮层:翻页 */
.stage-arrow {
  position: absolute; top: 50%; transform: translateY(-50%); z-index: 2;
  display: grid; place-items: center;
  width: 34px; height: 52px;
  color: var(--lb-muted);
  background: rgba(18, 16, 12, 0.62);
  border: 1px solid var(--lb-line); border-radius: var(--radius-sm);
  backdrop-filter: blur(6px);
  transition: color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.stage-arrow:hover { color: var(--lb-fg); background: rgba(30, 27, 20, 0.9); }
.stage-arrow.prev { left: 14px; }
.stage-arrow.next { right: 14px; }

/* 画面浮层:缩放 */
.stage-zoom {
  position: absolute; left: 50%; bottom: 22px; transform: translateX(-50%);
  display: flex; align-items: center; gap: 1px; padding: 3px;
  background: rgba(18, 16, 12, 0.8);
  border: 1px solid var(--lb-line);
  backdrop-filter: blur(8px);
}
.stage-zoom button {
  display: grid; place-items: center;
  min-width: 28px; height: 26px; padding: 0 6px;
  color: var(--lb-muted); background: transparent; border: 0;
}
.stage-zoom button:hover:not(:disabled) { color: var(--lb-fg); background: rgba(255, 255, 255, 0.06); }
.stage-zoom button:disabled { opacity: 0.3; cursor: not-allowed; }
.zoom-value { min-width: 50px; font-family: var(--font-mono); font-size: 13.5px; }

/* 展签 */
.viewer-rail {
  display: flex; flex-direction: column;
  min-height: 0; overflow-y: auto;
  padding: 22px 22px 24px;
  background: var(--lb-rail);
  border-left: 1px solid var(--lb-line);
  color: var(--lb-fg);
}
.rail-head {
  display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
  padding: 0 36px 13px 0;               /* 给右上角关闭按钮让位 */
  border-bottom: 1px solid var(--lb-line);
}
.rail-title { margin: 0; font-size: 16px; font-weight: 600; letter-spacing: 0.02em; }
.rail-count { font-family: var(--font-mono); font-size: 13.5px; color: var(--lb-subtle); }
.rail-count-sep { padding: 0 3px; opacity: 0.5; }

.viewer-prompt { padding-top: 16px; }
.rail-prompt-head {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  margin-bottom: 9px;
}
.rail-label {
  font-family: var(--font-mono); font-size: 13px; letter-spacing: 0.06em;
  color: var(--lb-subtle);
}
.rail-copy {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 2px 0; font-size: 14px;
  color: var(--lb-muted); background: transparent; border: 0;
}
.rail-copy:hover { color: var(--lb-fg); }
.viewer-prompt-text {
  margin: 0; padding-right: 4px;
  max-height: 42vh; overflow-y: auto;
  font-size: 16px; line-height: 1.7;
  color: var(--lb-fg);
  white-space: pre-wrap; word-break: break-word;
}

.rail-foot { padding-top: 16px; display: flex; flex-direction: column; gap: 10px; }
.viewer-prompt + .rail-foot { margin-top: 16px; border-top: 1px solid var(--lb-line); }
.rail-meta {
  display: flex; flex-wrap: wrap; align-items: center; gap: 7px;
  font-family: var(--font-mono); font-size: 13px; color: var(--lb-subtle);
}
.src-chip {
  padding: 2px 6px; font-size: 13px; letter-spacing: 0.04em;
  color: color-mix(in srgb, var(--lb-fg) 65%, transparent);
  border: 1px solid color-mix(in srgb, var(--lb-fg) 18%, transparent);
}
.flash {
  align-self: flex-start; margin: 0;
  padding: 4px 8px;
  font-family: var(--font-mono); font-size: 13.5px;
  color: var(--color-on-primary);
  background: var(--color-primary);
}
.rail-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.rail-btn {
  display: flex; align-items: center; gap: 7px; min-width: 0;
  height: 34px; padding: 0 9px;
  font-size: 14.5px; text-align: left;
  color: var(--lb-muted); background: transparent;
  border: 1px solid var(--lb-line); border-radius: var(--radius-sm);
  white-space: nowrap; overflow: hidden;
  transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.rail-btn :deep(svg) { flex-shrink: 0; color: var(--lb-subtle); }
.rail-btn:hover { color: var(--lb-fg); border-color: #4c4537; background: rgba(255, 255, 255, 0.04); }
.rail-btn.on { color: var(--color-heart); border-color: color-mix(in srgb, var(--color-heart) 45%, transparent); }
.rail-btn.on :deep(svg) { color: var(--color-heart); fill: var(--color-heart); }
.rail-btn-primary {
  color: var(--color-on-primary);
  background: var(--color-primary);
  border-color: var(--color-primary);
}
.rail-btn-primary :deep(svg) { color: var(--color-on-primary); }
.rail-btn-primary:hover {
  color: var(--color-on-primary);
  background: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
}

.viewer-close {
  position: absolute; top: 16px; right: 16px; z-index: 5;
  display: grid; place-items: center;
  width: 32px; height: 32px;
  color: var(--lb-muted);
  background: rgba(10, 9, 7, 0.72);
  border: 1px solid var(--lb-line); border-radius: var(--radius-sm);
  backdrop-filter: blur(6px);
}
.viewer-close:hover { color: var(--lb-fg); background: rgba(30, 27, 20, 0.9); }

@media (max-width: 860px) and (orientation: portrait) {
  .viewer { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; }
  .stage { padding: 12px 12px 62px; }
  .stage-arrow { width: 30px; height: 44px; }
  .stage-arrow.prev { left: 4px; }
  .stage-arrow.next { right: 4px; }
  .viewer-rail {
    max-height: 46vh;
    padding: 16px 16px calc(16px + env(safe-area-inset-bottom, 0px));
    border-left: 0; border-top: 1px solid var(--lb-line);
  }
  .rail-head { padding-right: 0; padding-bottom: 10px; }
  .viewer-prompt { padding-top: 12px; }
  .viewer-prompt-text { max-height: none; overflow: visible; }
  .rail-prompt-head { margin-bottom: 6px; }
  .rail-foot { padding-top: 12px; }
  .viewer-close { top: 10px; right: 10px; }
}

@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
</style>
