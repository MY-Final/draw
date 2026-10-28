<script setup>
// 中栏对话流:每条生成 = 用户请求气泡(右)+ AI 回复卡(左),左右明显错开。
import { computed, ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWorkbenchStore } from '../stores/workbench.js'
import AssetImage from './AssetImage.vue'
import AppIcon from './AppIcon.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import { exportRecipe } from '../lib/share.js'
import { downloadBlob, downloadJson, imageFileName } from '../lib/download.js'
import { getAsset } from '../lib/assetRepo.js'
import PendingTimer from './PendingTimer.vue'
import UndoToast from './UndoToast.vue'

const store = useWorkbenchStore()
const { t } = useI18n()
const emit = defineEmits(['use-as-reference', 'preview', 'reuse', 'open-settings', 'fill-prompt'])
const scroller = ref(null)
// 用户主动上翻时不抢滚动;仅贴近底部才跟滚。
const stickToBottom = ref(true)
const NEAR_BOTTOM_PX = 120

// 冷启动灵感:点一下直接填进输入框,比只给一句操作说明更有用。
const INSPIRATIONS = [
  { key: 'cyberpunk', icon: 'sparkles' },
  { key: 'softCat', icon: 'heart' },
  { key: 'minimalArchitecture', icon: 'layers' },
  { key: 'surrealism', icon: 'image' },
]

// 时间正序(旧→新);只显示当前会话。
const feed = computed(() => [...store.canvasGenerations].reverse())

// 队列是全局单通道的,但只把「属于当前会话」的排队项显示在这一段对话里。
const queuedHere = computed(() => store.generationQueue.filter(
  (q) => q.workspaceId === store.activeWorkspaceId && q.conversationId === store.conversationId,
))

const assetsById = computed(() => new Map(
  store.assets
    .filter((asset) => !store.activeWorkspaceId || asset.workspaceId === store.activeWorkspaceId)
    .map((asset) => [asset.id, asset]),
))
function assetById(id) { return assetsById.value.get(id) }
function outputsOf(gen) { return gen.outputImageIds.map(assetById).filter(Boolean) }
function refsOf(gen) { return (gen.refImageIds || []).map(assetById).filter(Boolean) }
function hasMissingOutputs(gen) {
  const expected = gen.outputImageIds || []
  return gen.status === 'success' && expected.length > outputsOf(gen).length
}
function modelOf(gen) { return gen.params?.model || t('results.modelFallback') }
function qualityOf(gen) {
  const q = gen.params?.quality
  if (q === 'medium') return t('results.quality.medium')
  if (q === 'low') return t('results.quality.low')
  if (q === 'high') return t('results.quality.high')
  return ''
}
function isSettingsError(gen) {
  // 鉴权类失败(含 401/403、缺 Key)才引导去设置;用分类而非文案判断,避免受语言影响。
  return gen?.failureCategory === 'auth'
}

// 把这条的 prompt/参数/参考图填回输入框,方便改画质后再发。
function reuseInComposer(gen) {
  emit('reuse', {
    prompt: gen.prompt || '',
    refImageIds: [...(gen.refImageIds || [])],
    params: {
      size: gen.params?.size,
      ratio: gen.params?.ratio,
      resolution: gen.params?.resolution,
      quality: gen.params?.quality,
      n: gen.params?.n,
    },
  })
}

// 已结束的生成只读取落库耗时；pending 的计时由独立组件更新。
function elapsedText(gen) {
  const ms = gen.elapsedMs ?? null
  if (ms == null) return ''
  return (Math.max(0, ms) / 1000).toFixed(1) + 's'
}

async function shareRecipe(gen) { downloadJson(await exportRecipe(gen), `recipe-${gen.id}.json`) }
async function downloadImage(a, gen) {
  if (!a) return
  const full = a.blob ? a : await getAsset(a.id)
  if (!full?.blob) return
  const ext = (full.mime.split('/')[1] || 'png').replace('jpeg', 'jpg')
  downloadBlob(full.blob, imageFileName({ id: full.id, prompt: gen?.prompt, name: full.name, ext }))
}

// 多图时记住每轮「当前图」(hover / 点击选中);操作作用在当前图而非永远第一张。
const focusByGen = ref({}) // genId -> assetId
function focusAsset(genId, assetId) {
  focusByGen.value = { ...focusByGen.value, [genId]: assetId }
}
function activeOutput(gen) {
  const outs = outputsOf(gen)
  if (!outs.length) return null
  const fid = focusByGen.value[gen.id]
  return outs.find((a) => a.id === fid) || outs[0]
}

// 删除单条:延迟提交,给撤销窗口(design D3)。
const UNDO_MS = 5000
const undoToast = ref(null) // { genId, timer }
function deleteGen(gen) {
  const r = store.deleteGenerationSoft(gen.id, UNDO_MS)
  if (!r.ok) return
  if (undoToast.value) clearTimeout(undoToast.value.timer)
  const timer = setTimeout(() => { undoToast.value = null }, UNDO_MS)
  undoToast.value = { genId: gen.id, timer }
}
function undoDelete() {
  if (!undoToast.value) return
  store.undoDeleteGeneration(undoToast.value.genId)
  clearTimeout(undoToast.value.timer)
  undoToast.value = null
}

// 编辑消息:气泡内联编辑,保存后更新该轮文本并自动用新 prompt 重新生成。
const editingGenId = ref(null)
const editText = ref('')
const editOriginalText = ref('')
const confirmEditDiscard = ref(false)
const editInput = ref(null)
// 用户手动调整过的高度(px);非空时接管自动增高,重进编辑复位
const manualEditHeight = ref(null)
const editResizing = ref(false)
function startEdit(gen) {
  if (store.generating || gen.status === 'pending') return
  editingGenId.value = gen.id
  editText.value = gen.prompt || ''
  editOriginalText.value = editText.value
  manualEditHeight.value = null
  // 聚焦并让光标落在文末,进入即可继续输入
  nextTick(() => {
    const el = editInput.value
    if (el) {
      el.style.height = '' // 清掉上次编辑残留的手动高度
      el.focus()
      const len = el.value.length
      el.setSelectionRange(len, len)
      // rAF 确保布局稳定后再量高度,避免取到未完成布局的 scrollHeight
      requestAnimationFrame(autogrowEdit)
    }
  })
}
function finishCancelEdit() {
  confirmEditDiscard.value = false
  editingGenId.value = null
}
function cancelEdit() {
  if (editText.value !== editOriginalText.value) {
    confirmEditDiscard.value = true
    return
  }
  finishCancelEdit()
}
function onEditEnter(e, gen) {
  if (e.isComposing || e.keyCode === 229) return
  if (!e.ctrlKey && !e.metaKey) return
  e.preventDefault()
  saveEdit(gen)
}
// 编辑框自适应高度:内容多高撑多高(上限约 80% 视口高),长 prompt 完整展开
function autogrowEdit() {
  const el = editInput.value
  if (!el || manualEditHeight.value) return
  el.style.height = 'auto'
  void el.offsetHeight // 强制同步回流,确保 scrollHeight 是最终布局值
  el.style.height = Math.min(el.scrollHeight, editMaxHeight()) + 'px'
}
// 高度上限:约 80% 视口高,和自动增高保持一致
function editMaxHeight() { return Math.round((window.innerHeight || 800) * 0.8) }
// 下限取编辑框自身的保底高度(clamp 的解析 px 值),避免和 CSS min-height 打架
function applyEditHeight(next) {
  const el = editInput.value
  if (!el) return
  const min = parseFloat(getComputedStyle(el).minHeight) || 96
  const h = Math.max(min, Math.min(next, editMaxHeight()))
  el.style.height = `${h}px`
  manualEditHeight.value = h
}
// 拖动把手手动调整编辑框高度:以按下时的高度为基准
let editResizeStart = null
function onEditResizeStart(e) {
  const el = editInput.value
  if (!el) return
  e.preventDefault() // 抑制拖拽期间选中文本
  editResizeStart = { y: e.clientY, h: el.getBoundingClientRect().height }
  editResizing.value = true
  e.currentTarget.setPointerCapture?.(e.pointerId)
}
function onEditResizeMove(e) {
  if (!editResizeStart) return
  applyEditHeight(editResizeStart.h + (e.clientY - editResizeStart.y))
}
function onEditResizeEnd() { editResizeStart = null; editResizing.value = false }
// 键盘可达:把手聚焦后 ↑/↓ 增高/降低
function onEditResizeKey(e) {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
  const el = editInput.value
  if (!el) return
  e.preventDefault()
  const base = manualEditHeight.value ?? el.getBoundingClientRect().height
  applyEditHeight(base + (e.key === 'ArrowUp' ? 24 : -24))
}
// 兜底:编辑态切换 / 内容变化时都重新量一次高度,避免任何时序漏测
watch(editingGenId, (id) => { if (id) nextTick(() => requestAnimationFrame(autogrowEdit)) })
watch(editText, () => { nextTick(() => requestAnimationFrame(autogrowEdit)) })
async function saveEdit(gen) {
  if (store.generating) return
  const t = editText.value.trim()
  if (!t) return
  editingGenId.value = null
  await store.editPromptAndRegenerate(gen.id, t)
}

function onFeedScroll() {
  const el = scroller.value
  if (!el) return
  const dist = el.scrollHeight - el.scrollTop - el.clientHeight
  stickToBottom.value = dist <= NEAR_BOTTOM_PX
}

watch(() => [feed.value.length, store.generating], async () => {
  if (!stickToBottom.value) return
  await nextTick()
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: 'smooth' })
})

// 用户上翻看历史时,新结果不会抢滚动(见上)。但不能让「生成完成」这件事无声无息:
// 用一个「↓ 有新结果」的浮标提示,点一下回到最新。
const missedResults = ref(0)
watch(() => feed.value.length, (next, prev) => {
  if (next > prev && !stickToBottom.value) missedResults.value += next - prev
})
watch(stickToBottom, (atBottom) => { if (atBottom) missedResults.value = 0 })
function scrollToLatest() {
  missedResults.value = 0
  stickToBottom.value = true
  nextTick(() => scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: 'smooth' }))
}
// 切会话/工作区是「换一段对话」,不是「来了新结果」:直接跳到底部并清掉浮标,
// 否则上一段对话的滚动位置会让新会话一进来就显示「有新结果」。
watch(() => [store.conversationId, store.activeWorkspaceId], () => {
  missedResults.value = 0
  stickToBottom.value = true
  nextTick(() => scroller.value?.scrollTo({ top: scroller.value.scrollHeight }))
})
</script>

<template>
  <div class="results">
    <div class="feed" ref="scroller" @scroll.passive="onFeedScroll">
      <div class="feed-inner">
      <!-- 空状态:一张空白画纸 -->
      <div v-if="!feed.length && !store.generating" class="empty">
        <h1>{{ t('results.empty.title') }}</h1>
        <p>{{ t('results.empty.description') }}</p>
        <div class="empty-inspire" role="group" :aria-label="t('results.empty.inspirationsAria')">
          <button
            v-for="idea in INSPIRATIONS" :key="idea.key"
            type="button" class="chip-action"
            @click="emit('fill-prompt', t(`results.inspirations.${idea.key}.prompt`))"
          >
            <AppIcon :name="idea.icon" :size="14" />
            <span class="insp-label">{{ t(`results.inspirations.${idea.key}.label`) }}</span>
          </button>
        </div>
      </div>

      <!-- 每一轮生成 = 一张作品版:左侧图注,右侧画面 -->
      <article v-for="(gen, gi) in feed" :key="gen.id" class="turn">
        <header class="plate-head">
          <span class="plate-no tnum">PLATE {{ String(gi + 1).padStart(2, '0') }}</span>
          <span class="plate-head-rule" aria-hidden="true" />
          <span class="plate-model">{{ modelOf(gen) }}</span>
          <span v-if="qualityOf(gen)" class="plate-chip tnum" :title="t('results.qualityTitle', { quality: qualityOf(gen) })">{{ qualityOf(gen) }}</span>
          <span v-if="gen.status === 'success'" class="plate-status ok"><span class="status-dot" aria-hidden="true" />{{ t('results.status.success') }}</span>
          <span v-else-if="gen.status === 'failed'" class="plate-status bad"><span class="status-dot" aria-hidden="true" />{{ t('results.status.failed') }}</span>
          <span v-else-if="gen.status === 'empty'" class="plate-status warn"><span class="status-dot" aria-hidden="true" />{{ t('results.status.empty') }}</span>
          <span v-else class="plate-status live"><AppIcon name="refresh" :size="11" class="spin" />{{ gen.statusMessage || t('results.status.generating') }}</span>
          <PendingTimer v-if="gen.status === 'pending'" :created-at="gen.createdAt" />
          <span v-else-if="elapsedText(gen)" class="plate-time tnum">{{ elapsedText(gen) }}</span>
        </header>

        <div v-if="gen.status === 'failed'" class="plate-notice note note-danger">
          <AppIcon name="alert" :size="14" />
          <span class="note-text">{{ gen.error }}</span>
          <button
            v-if="isSettingsError(gen)"
            type="button"
            class="note-action"
            @click="emit('open-settings')"
          >{{ t('results.settingsAction') }}</button>
          <details v-if="gen.errorDetail" class="error-detail">
            <summary>{{ t('results.errorDetail') }}</summary>
            <pre>{{ gen.errorDetail }}</pre>
          </details>
        </div>
        <div v-else-if="gen.status === 'empty'" class="plate-notice note note-warn">
          <div>{{ t('results.emptyResponse') }}<code class="snippet">{{ gen.rawResponseSnippet }}</code></div>
        </div>
        <div v-else-if="hasMissingOutputs(gen)" class="plate-notice note note-warn">
          <AppIcon name="alert" :size="14" />
          <span class="note-text">{{ t('results.missingOutputs') }}</span>
        </div>
        <div v-else-if="gen.status === 'success' && gen.partialNote" class="plate-notice note note-warn">
          <AppIcon name="alert" :size="14" />
          <div class="note-text">
            {{ t('results.partialNote', { note: gen.partialNote }) }}
            <code v-if="gen.rawResponseSnippet" class="snippet">{{ gen.rawResponseSnippet }}</code>
          </div>
        </div>

        <div class="plate-body" :class="{ 'has-images': outputsOf(gen).length }">
          <!-- 图注:prompt、参考图、操作 -->
          <aside class="caption">
            <div v-if="editingGenId === gen.id" class="bubble-edit">
              <textarea
                ref="editInput" v-model="editText" class="bubble-edit-input"
                @input="autogrowEdit"
                @keydown.enter="onEditEnter($event, gen)" @keydown.esc="cancelEdit"
              />
              <button
                type="button" class="bubble-edit-resize" :class="{ active: editResizing }"
                @pointerdown="onEditResizeStart" @pointermove="onEditResizeMove"
                @pointerup="onEditResizeEnd" @pointercancel="onEditResizeEnd"
                @keydown="onEditResizeKey"
                :title="t('results.edit.resizeTitle')" :aria-label="t('results.edit.resizeAria')"
              >
                <span class="bubble-edit-grip" aria-hidden="true" />
              </button>
              <div class="bubble-edit-actions">
                <span class="bubble-edit-hint">{{ t('results.edit.hint') }}</span>
                <div class="bubble-edit-btns">
                  <button class="bubble-edit-btn-cancel" @click="cancelEdit">{{ t('common.cancel') }}</button>
                  <button class="bubble-edit-btn-save" @click="saveEdit(gen)" :disabled="!editText.trim()">{{ t('results.edit.regenerate') }}</button>
                </div>
              </div>
            </div>
            <template v-else>
              <p class="bubble-text">{{ gen.prompt }}</p>
              <div v-if="refsOf(gen).length" class="bubble-refs">
                <div v-for="a in refsOf(gen)" :key="a.id" class="bubble-ref">
                  <AssetImage :asset="a" :alt="t('results.referenceImage')" />
                </div>
                <span class="ref-hint">{{ t('results.referenceImage') }}</span>
              </div>
            </template>

            <div v-if="gen.status !== 'pending'" class="caption-actions">
              <button
                v-if="editingGenId !== gen.id"
                class="user-edit-btn"
                @click="startEdit(gen)"
                :disabled="store.generating"
                :title="t('results.edit.actionTitle')"
              >
                <AppIcon name="edit" :size="12" /> {{ t('results.edit.button') }}
              </button>

              <div class="actions">
                <button
                  class="act"
                  @click="emit('use-as-reference', activeOutput(gen)?.id)"
                  :disabled="!activeOutput(gen)"
                  :title="outputsOf(gen).length > 1 ? t('results.continueWithSelected') : t('results.continueWithThis')"
                >
                  <AppIcon name="layers" :size="14" /> {{ t('results.setAsReference') }}
                </button>
                <button class="act" @click="store.regenerate(gen.id)" :disabled="store.generating" :title="t('results.regenerateTitle')">
                  <AppIcon name="refresh" :size="14" /> {{ t('results.regenerate') }}
                </button>
                <button class="act" @click="reuseInComposer(gen)" :title="t('results.refillTitle')">
                  <AppIcon name="message" :size="14" /> {{ t('results.refill') }}
                </button>
                <button
                  class="act"
                  @click="downloadImage(activeOutput(gen), gen)"
                  :disabled="!activeOutput(gen)"
                  :title="outputsOf(gen).length > 1 ? t('results.downloadSelected') : t('results.download')"
                >
                  <AppIcon name="download" :size="14" /> {{ t('results.download') }}
                </button>
                <button class="act" @click="shareRecipe(gen)" :title="t('results.shareTitle')">
                  <AppIcon name="share" :size="14" /> {{ t('results.share') }}
                </button>
                <button class="act act-danger" @click="deleteGen(gen)" :title="t('results.deleteTitle')">
                  <AppIcon name="trash" :size="14" /> {{ t('common.delete') }}
                </button>
              </div>
            </div>
          </aside>

          <!-- 画面:像裱在纸板上的作品 -->
          <div class="plate-field">
            <div v-if="outputsOf(gen).length" class="imgs" :class="{ single: outputsOf(gen).length === 1 }">
              <figure
                v-for="(a, ai) in outputsOf(gen)" :key="a.id"
                class="fig" :class="{ focused: activeOutput(gen)?.id === a.id && outputsOf(gen).length > 1 }"
                @mouseenter="focusAsset(gen.id, a.id)"
                @focusin="focusAsset(gen.id, a.id)"
              >
                <button class="fig-img" @click="focusAsset(gen.id, a.id); emit('preview', { asset: a, list: outputsOf(gen) })" :aria-label="t('results.zoomPreview')">
                  <AssetImage :asset="a" :alt="gen.prompt" />
                </button>
                <span v-if="outputsOf(gen).length > 1" class="fig-counter tnum">{{ ai + 1 }}/{{ outputsOf(gen).length }}</span>
                <button
                  class="fav" :class="{ on: a.favorite }"
                  @click.stop="store.toggleAssetFavorite(a.id)"
                  :aria-label="a.favorite ? t('results.unfavorite') : t('results.favorite')"
                >
                  <AppIcon name="heart" :size="14" />
                </button>
              </figure>
            </div>
            <!-- 生成中:等待画面显影 -->
            <div v-else-if="gen.status === 'pending'" class="pending-block">
              <div class="skeleton">
                <span class="mono-label">EXPOSING</span>
              </div>
              <div class="pending-actions">
                <button
                  v-if="store.activeGeneration?.genId === gen.id"
                  class="pending-del act"
                  @click="store.cancelActiveGeneration()"
                  :title="t('results.cancelGenerationTitle')"
                >
                  <AppIcon name="x" :size="13" /> {{ t('common.cancel') }}
                </button>
                <button class="pending-del act act-danger" @click="deleteGen(gen)" :title="t('results.deleteStuckTitle')">
                  <AppIcon name="trash" :size="13" /> {{ t('results.deleteStuck') }}
                </button>
              </div>
            </div>
            <div v-else class="field-blank" :class="{ failed: gen.status === 'failed' }" aria-hidden="true">
              <span class="blank-mark"><AppIcon name="image" :size="18" /></span>
              <span class="mono-label">{{ gen.status === 'failed' ? t('results.noPlate') : t('results.status.empty') }}</span>
            </div>
          </div>
        </div>
      </article>

      <!-- 排队中:一张排期单 -->
      <div v-if="queuedHere.length" class="queue" role="list" :aria-label="t('results.queue.aria')">
        <div class="queue-head">
          <AppIcon name="layers" :size="13" />
          <span class="queue-title">{{ t('results.queue.count', { count: queuedHere.length }) }}</span>
          <span class="queue-hint">{{ t('results.queue.hint') }}</span>
        </div>
        <div v-for="(q, qi) in queuedHere" :key="q.id" class="queue-item" role="listitem">
          <span class="queue-pos tnum">{{ String(qi + 1).padStart(2, '0') }}</span>
          <span class="queue-text" :title="q.prompt">{{ q.prompt }}</span>
          <button
            v-if="qi > 0" class="queue-act" type="button"
            @click="store.promoteQueuedGeneration(q.id)" :title="t('results.queue.promoteTitle')"
          >{{ t('results.queue.promote') }}</button>
          <button
            class="queue-act queue-act-danger" type="button"
            @click="store.removeQueuedGeneration(q.id)" :aria-label="t('results.queue.removeAria', { position: qi + 1 })"
          >{{ t('results.queue.remove') }}</button>
        </div>
      </div>
      </div>
    </div>

    <!-- 有新结果:固定在结果区底部 -->
    <button
      v-if="missedResults"
      type="button" class="new-results" @click="scrollToLatest"
    >
      <AppIcon name="chevron-down" :size="14" /> {{ t('results.newResults', { count: missedResults }) }}
    </button>

    <!-- 删除撤销提示 -->
    <UndoToast v-if="undoToast" :message="t('results.deletedToast')" @undo="undoDelete" />
    <ConfirmDialog
      v-if="confirmEditDiscard"
      :title="t('results.discard.title')"
      :message="t('results.discard.message')"
      :confirm-text="t('results.discard.confirm')" danger
      @confirm="finishCancelEdit" @cancel="confirmEditDiscard = false"
    />
  </div>
</template>
<style scoped>
.results { position: relative; display: flex; flex-direction: column; height: 100%; min-height: 0; }
.feed { flex: 1; min-height: 0; overflow-y: auto; scroll-behavior: smooth; }
.feed-inner {
  max-width: 1060px; min-height: 100%; margin: 0 auto;
  padding: var(--space-6) var(--space-6) var(--space-12);
  display: flex; flex-direction: column; gap: var(--space-10);
}

/* ── 空白画纸 ── */
.empty {
  flex: 1;
  margin: 0 auto;
  padding: 24px 0;
  max-width: 620px;
  color: var(--color-fg-muted);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center;
}
.empty h1 {
  margin: 0;
  font-size: clamp(30px, 4vw, 42px);
  line-height: 1.05;
  font-weight: 800;
  letter-spacing: -0.04em;
  color: var(--color-fg);
}
.empty p {
  max-width: 40ch; margin: 14px 0 0;
  font-size: 13.5px; line-height: 1.7;
}
.empty-inspire {
  display: flex; flex-wrap: wrap; justify-content: center;
  gap: 8px; margin-top: 28px;
}
.chip-action {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 8px 13px; border-radius: var(--radius);
  border: 1px solid var(--color-border-strong);
  background: transparent;
  color: var(--color-fg-muted);
  font-family: var(--font-sans); font-size: 12.5px; letter-spacing: -0.01em;
  transition: background var(--dur) var(--ease), border-color var(--dur) var(--ease),
    color var(--dur) var(--ease);
}
.chip-action:hover {
  background: var(--color-surface-2);
  border-color: var(--color-fg-subtle);
  color: var(--color-fg);
}
.insp-label { font-weight: 500; }
.chip-action :deep(svg) { color: var(--color-fg-subtle); flex-shrink: 0; }
.chip-action:hover :deep(svg) { color: var(--color-fg-muted); }

/* ── 作品版 ── */
.turn {
  display: flex; flex-direction: column; gap: var(--space-3);
  border-top: 1px solid var(--color-border-strong);
  padding-top: 10px;
  animation: turn-in 220ms var(--ease-out);
}
@keyframes turn-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
.plate-head {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  min-height: 22px;
}
.plate-no {
  font-family: var(--font-mono); font-size: 9.5px; font-weight: 600;
  letter-spacing: 0.14em; color: var(--color-fg);
  white-space: nowrap;
}
.plate-head-rule { flex: 1; min-width: 24px; height: 1px; background: var(--color-border); }
.plate-model { font-family: var(--font-mono); font-size: 10px; color: var(--color-fg-muted); }
.plate-chip {
  font-family: var(--font-mono); font-size: 9px; color: var(--color-fg-subtle);
  padding: 1px 5px; border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}
.plate-status {
  display: inline-flex; align-items: center; gap: 5px;
  font-family: var(--font-mono); font-size: 9.5px; letter-spacing: 0.02em;
  color: var(--color-fg-muted);
  white-space: nowrap;
}
.status-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
.plate-status.ok { color: var(--color-success); }
.plate-status.bad { color: var(--color-destructive); }
.plate-status.warn { color: var(--color-warning); }
.plate-status.live { color: var(--color-primary); }
.plate-time, .elapsed {
  margin-left: auto;
  font-family: var(--font-mono) !important; font-size: 9.5px;
  color: var(--color-fg-subtle); font-variant-numeric: tabular-nums;
}

.plate-notice { width: 100%; }
.note-text { flex: 1; min-width: 0; line-height: 1.45; }
.note-action {
  flex-shrink: 0; font-family: var(--font-mono); font-size: 10px; font-weight: 500;
  color: var(--color-destructive); padding: 3px 8px; border-radius: var(--radius-sm);
  border: 1px solid color-mix(in srgb, var(--color-destructive) 35%, transparent);
}
.note-action:hover { background: color-mix(in srgb, var(--color-destructive) 10%, transparent); }

.plate-body {
  display: grid;
  grid-template-columns: 224px minmax(0, 1fr);
  gap: var(--space-6);
  align-items: start;
}

/* 图注 */
.caption {
  display: flex; flex-direction: column; gap: var(--space-3);
  min-width: 0; padding-top: 2px;
}
.bubble-text {
  margin: 0; font-size: 13.5px; line-height: 1.65; font-weight: 500;
  color: var(--color-fg);
  white-space: pre-wrap; word-break: break-word;
  letter-spacing: -0.01em;
}
.bubble-refs { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.bubble-ref {
  width: 40px; height: 40px; border-radius: var(--radius-sm); overflow: hidden;
  border: 1px solid var(--color-border-strong); background: var(--color-surface-2);
}
.ref-hint {
  font-family: var(--font-mono); font-size: 8.5px; letter-spacing: 0.04em;
  color: var(--color-fg-subtle);
}
.caption-actions {
  display: flex; flex-direction: column; gap: 8px;
  padding-top: 10px; border-top: 1px solid var(--color-border);
}
.user-edit-btn {
  align-self: flex-start;
  display: inline-flex; align-items: center; gap: 5px;
  padding: 1px 0;
  font-family: var(--font-mono); font-size: 9.5px; letter-spacing: 0.03em;
  color: var(--color-fg-muted);
}
.user-edit-btn:hover:not(:disabled) { color: var(--color-primary); }
.user-edit-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.actions { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; }
.act {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 4px; border-radius: var(--radius-sm);
  font-size: 11px; color: var(--color-fg-muted); text-align: left;
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
}
.act :deep(svg) { flex-shrink: 0; color: var(--color-fg-subtle); }
.act:hover:not(:disabled) { background: var(--color-surface-2); color: var(--color-fg); }
.act:hover:not(:disabled) :deep(svg) { color: var(--color-fg); }
.act:disabled { opacity: 0.35; cursor: not-allowed; }
.act-danger:hover:not(:disabled) { background: color-mix(in srgb, var(--color-destructive) 9%, transparent); color: var(--color-destructive); }
.act-danger:hover:not(:disabled) :deep(svg) { color: var(--color-destructive); }

/* 画面:纸板 + 作品 */
.plate-field {
  min-width: 0;
  padding: 10px;
  background: var(--color-elevated);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius);
}
.imgs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; align-items: start; }
.imgs.single { grid-template-columns: minmax(0, 1fr); }
.fig {
  position: relative; margin: 0; overflow: hidden;
  border: 1px solid var(--color-border);
  background: var(--color-surface-2);
  transition: border-color var(--dur) var(--ease);
}
.fig:hover { border-color: var(--color-fg-subtle); }
.fig.focused { border-color: var(--color-primary); box-shadow: inset 0 0 0 1px var(--color-primary); }
.fig-img { display: block; width: 100%; padding: 0; }
.fig-img :deep(.asset-img) {
  display: block; width: 100%; height: auto;
  max-height: 64vh; object-fit: contain;
}
.fig-counter {
  position: absolute; left: 8px; bottom: 8px;
  font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.05em;
  color: #fff; background: rgba(15, 14, 10, 0.62);
  padding: 2px 5px; pointer-events: none;
}
.fav {
  position: absolute; top: 8px; right: 8px;
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-sm);
  background: rgba(15, 14, 10, 0.58); color: #fff;
  opacity: 0;
  transition: color var(--dur) var(--ease), background var(--dur) var(--ease), opacity var(--dur) var(--ease);
}
.fig:hover .fav, .fig:focus-within .fav, .fav.on { opacity: 1; }
@media (hover: none) { .fav { opacity: 0.92; } }
.fav:hover { background: rgba(15, 14, 10, 0.8); }
.fav.on { color: var(--color-heart); }
.fav.on :deep(svg) { fill: var(--color-heart); }

.field-blank {
  min-height: 180px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
  color: var(--color-fg-subtle);
  border: 1px dashed var(--color-border-strong);
  background: repeating-linear-gradient(
    135deg,
    transparent 0 12px,
    color-mix(in srgb, var(--color-border) 40%, transparent) 12px 13px
  );
}
.blank-mark {
  width: 34px; height: 34px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--color-border-strong);
  background: var(--color-surface);
  color: var(--color-fg-subtle);
}
.field-blank .mono-label {
  padding: 2px 6px;
  letter-spacing: 0.2em;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
}
.field-blank.failed { border-color: color-mix(in srgb, var(--color-destructive) 42%, var(--color-border-strong)); }
.field-blank.failed .blank-mark { color: var(--color-destructive); border-color: color-mix(in srgb, var(--color-destructive) 40%, transparent); }
.field-blank.failed .mono-label { color: var(--color-destructive); }

/* 生成中 */
.pending-block { display: flex; flex-direction: column; gap: var(--space-2); }
.skeleton {
  width: 100%; aspect-ratio: 1 / 1; max-height: 60vh;
  display: flex; align-items: center; justify-content: center;
  border: 1px dashed var(--color-border-strong);
  background: repeating-linear-gradient(
    135deg,
    var(--color-surface-2) 0,
    var(--color-surface-2) 10px,
    transparent 10px,
    transparent 22px
  );
  animation: pulse 1.6s ease-in-out infinite;
}
.skeleton .mono-label { letter-spacing: 0.24em; background: var(--color-elevated); padding: 3px 8px; }
.pending-actions { display: flex; flex-wrap: wrap; gap: var(--space-1); }
.pending-del { align-self: flex-start; }
.snippet {
  display: block; margin-top: 6px; font-size: 10.5px; max-height: 80px; overflow: auto;
  opacity: 0.8; white-space: pre-wrap; word-break: break-all;
  font-family: var(--font-mono);
}
.error-detail { flex: 1; min-width: 100%; margin-top: var(--space-1); }
.error-detail summary { cursor: pointer; color: var(--color-fg-muted); font-family: var(--font-mono); font-size: 10.5px; }
.error-detail pre {
  max-height: 180px; overflow: auto; white-space: pre-wrap; word-break: break-word;
  margin: var(--space-2) 0 0; padding: var(--space-2);
  border-radius: var(--radius-sm); background: color-mix(in srgb, #000 10%, transparent);
  color: var(--color-fg-muted); font: 10.5px/1.5 var(--font-mono);
}
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes pulse { 0%, 100% { opacity: 0.62; } 50% { opacity: 1; } }

/* 编辑图注 */
.bubble-edit { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.bubble-edit-input {
  width: 100%; min-height: clamp(150px, 30vh, 300px);
  padding: 10px; border-radius: var(--radius);
  border: 1px solid var(--color-primary);
  background: var(--color-elevated);
  color: var(--color-fg); font-size: 12.5px; line-height: 1.6;
  resize: none; overflow-y: auto;
}
.bubble-edit-resize {
  align-self: center; display: flex; align-items: center; justify-content: center;
  padding: 4px 14px; border-radius: var(--radius-sm); cursor: ns-resize;
  color: var(--color-fg-subtle); touch-action: none;
}
.bubble-edit-resize:hover, .bubble-edit-resize:focus-visible, .bubble-edit-resize.active {
  background: var(--color-surface-2); color: var(--color-fg);
}
.bubble-edit-grip { display: block; position: relative; width: 20px; height: 2px; background: currentColor; }
.bubble-edit-grip::before, .bubble-edit-grip::after {
  content: ''; position: absolute; left: 0; right: 0; height: 2px; background: currentColor;
}
.bubble-edit-grip::before { top: -5px; }
.bubble-edit-grip::after { top: 5px; }
.bubble-edit-actions { display: flex; flex-direction: column; gap: 6px; }
.bubble-edit-hint {
  font-family: var(--font-mono); font-size: 8.5px; line-height: 1.5;
  color: var(--color-fg-subtle);
}
.bubble-edit-btns { display: flex; gap: 6px; }
.bubble-edit-btn-cancel {
  padding: 4px 10px; border-radius: var(--radius-sm);
  border: 1px solid var(--color-border-strong); font-size: 11px;
  color: var(--color-fg-muted);
}
.bubble-edit-btn-cancel:hover { background: var(--color-surface-2); color: var(--color-fg); }
.bubble-edit-btn-save {
  padding: 4px 10px; border-radius: var(--radius-sm);
  border: 1px solid var(--color-primary);
  background: var(--color-primary); color: var(--color-on-primary);
  font-size: 11px; font-weight: 600;
}
.bubble-edit-btn-save:disabled { opacity: 0.45; cursor: not-allowed; }

/* 排队单 */
.queue {
  display: flex; flex-direction: column;
  border: 1px dashed var(--color-border-strong);
  background: var(--color-surface);
  padding: 12px;
}
.queue-head {
  display: flex; align-items: center; gap: 8px;
  padding-bottom: 8px; margin-bottom: 2px;
  border-bottom: 1px solid var(--color-border);
}
.queue-head :deep(svg) { color: var(--color-primary); }
.queue-title { font-family: var(--font-mono); font-size: 10px; font-weight: 500; color: var(--color-fg); }
.queue-hint { margin-left: auto; font-family: var(--font-mono); font-size: 9px; color: var(--color-fg-subtle); }
.queue-item {
  display: flex; align-items: center; gap: 10px;
  padding: 7px 2px;
  border-bottom: 1px solid var(--color-border);
}
.queue-item:last-child { border-bottom: none; }
.queue-pos { flex-shrink: 0; font-family: var(--font-mono); font-size: 9px; color: var(--color-fg-subtle); }
.queue-text {
  flex: 1; min-width: 0; font-size: 12px; color: var(--color-fg-muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.queue-act {
  flex-shrink: 0; font-family: var(--font-mono); font-size: 9.5px;
  color: var(--color-fg-subtle); padding: 2px 6px; border-radius: var(--radius-sm);
  border: 1px solid transparent;
}
.queue-act:hover { color: var(--color-fg); border-color: var(--color-border-strong); }
.queue-act-danger:hover {
  color: var(--color-destructive);
  border-color: color-mix(in srgb, var(--color-destructive) 40%, transparent);
}

/* 新结果浮标 */
.new-results {
  position: absolute; bottom: var(--space-4); left: 50%; transform: translateX(-50%);
  z-index: 20; display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 12px; border-radius: var(--radius);
  font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.03em;
  color: var(--color-on-ink); background: var(--color-ink);
  border: 1px solid var(--color-ink);
  box-shadow: var(--shadow-pop);
  animation: turn-in 180ms var(--ease-out);
}
.new-results:hover { background: var(--color-primary); border-color: var(--color-primary); color: var(--color-on-primary); }

@media (max-width: 1180px) {
  .plate-body { grid-template-columns: 200px minmax(0, 1fr); gap: var(--space-4); }
}
@media (max-width: 900px) {
  .feed-inner { padding: var(--space-5) var(--space-4) var(--space-10); gap: var(--space-8); }
  .plate-body { grid-template-columns: minmax(0, 1fr); gap: var(--space-3); }
  .plate-field { order: 1; }
  .caption { order: 2; }
  .plate-body:not(.has-images) .plate-field { order: 2; }
  .plate-body:not(.has-images) .caption { order: 1; }
  .actions { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .caption-actions { padding-top: 8px; }
}
@media (max-width: 640px) {
  .feed-inner { padding: var(--space-4) var(--space-3) calc(var(--space-10) + 64px); gap: var(--space-8); }
  .empty h1 { font-size: 30px; }
  .actions { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .plate-field { padding: 6px; }
  .imgs { grid-template-columns: minmax(0, 1fr); }
  .plate-head { gap: 8px; }
  .plate-time, .elapsed { margin-left: 0; }
}
</style>
