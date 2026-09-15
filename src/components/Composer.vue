<script setup>
// 底部固定输入区(composer,对话式布局)。prompt + 内联参数 + 参考图 chips + 生成。
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useWorkbenchStore } from '../stores/workbench.js'
import AppIcon from './AppIcon.vue'
import AssetImage from './AssetImage.vue'
import { addPrompt, removePrompt, getAllPrompts } from '../lib/promptLibrary.js'
import { imageFromClipboard } from '../lib/clipboard.js'
import { uploadInOrder } from '../lib/referenceUploads.js'

// ── 尺寸计算(宽高比 × 分辨率组合,design D1)──
const RES_MAP = { '1k': 1024, '2k': 2048, '4k': 4096 }
const RATIOS = [
  { key: 'auto', label: 'Auto' },
  { key: '1:1', label: '1:1' },
  { key: '16:9', label: '16:9' },
  { key: '9:16', label: '9:16' },
  { key: '4:3', label: '4:3' },
  { key: '3:4', label: '3:4' },
  { key: '3:2', label: '3:2' },
  { key: '2:3', label: '2:3' },
]
// 比例:Auto 单独隔开,其余进 4 列网格
const RATIO_GRID = RATIOS.filter((r) => r.key !== 'auto')
const RESOLUTIONS = [
  { key: '1k', label: '1K' },
  { key: '2k', label: '2K' },
  { key: '4k', label: '4K' },
]
// 画质:真实 quality 参数(high/medium/low),独立于分辨率
const QUALITIES = [
  { key: 'high', label: '高' },
  { key: 'medium', label: '中' },
  { key: 'low', label: '低' },
]
const RES_LABELS = { '1k': '1K', '2k': '2K', '4k': '4K' }
const Q_LABELS = { high: '高', medium: '中', low: '低' }
// 画质预设:分辨率 × 画质 的快捷组合;「标准」为默认(1K+中)
const QUALITY_PRESETS = [
  { key: 'standard', label: '标准', res: '1k', q: 'medium' },
  { key: 'hd', label: '高清', res: '2k', q: 'high' },
  { key: 'uhd', label: '超清', res: '4k', q: 'high' },
]

function computeSize(r, res) {
  if (r === 'auto') return null
  const base = RES_MAP[res]
  const [w, h] = r.split(':').map(Number)
  if (w === h) return `${base}x${base}`
  if (w > h) return `${base}x${Math.round(base * h / w)}`
  return `${Math.round(base * w / h)}x${base}`
}

const store = useWorkbenchStore()
const emit = defineEmits(['open-settings', 'preview'])

const prompt = ref('')
const composerInput = ref(null)
const paramsSummaryButton = ref(null)
const presetButton = ref(null)
const promptLibButton = ref(null)
const ratio = ref('auto')
const resolution = ref('1k')
const quality = ref('medium')
const n = ref(1)
const refImageIds = ref([])
const showPromptLib = ref(false)
const savedPrompts = ref([])
const promptLibToast = ref(null)
// 接口切换(跟随生成上下文,放输入区而非侧栏导航树)
const presetMenuOpen = ref(false)
// 次要参数(画质/数量)默认收起,给输入区更多呼吸感;非默认值时自动展开提示。
const moreParamsOpen = ref(false)
// 与默认「标准(1K+中)」不一致即视为已自定义
const moreParamsDirty = computed(() =>
  ratio.value !== 'auto' || resolution.value !== '1k' || quality.value !== 'medium' || Number(n.value) !== 1
)
// 预设快捷项:分辨率×画质命中某档预设时高亮
const activePresetKey = computed(() =>
  QUALITY_PRESETS.find((p) => p.res === resolution.value && p.q === quality.value)?.key || null
)
// 常驻设置摘要:点击展开高级设置
const settingsSummary = computed(() => {
  const ratioLabel = ratio.value === 'auto' ? 'Auto' : ratio.value
  const resLabel = RES_LABELS[resolution.value] || resolution.value
  const qLabel = Q_LABELS[quality.value] || quality.value
  return `${ratioLabel} · ${resLabel} · ${qLabel}画质 · 生成 ${clampN(n.value)} 张`
})

function selectPreset(p) { resolution.value = p.res; quality.value = p.q }
function toggleAdvanced() { moreParamsOpen.value = !moreParamsOpen.value }
function clampN(v) { return Math.min(4, Math.max(1, Number(v) || 1)) }
function stepN(delta) { n.value = clampN(n.value + delta) }

// 数量步进器:长按连续增减(延迟 400ms 后每 120ms 一次)
let nHoldTimer = null
let nHoldInterval = null
function nHoldStart(delta) {
  stepN(delta)
  nHoldTimer = setTimeout(() => {
    nHoldInterval = setInterval(() => stepN(delta), 120)
  }, 400)
}
function nHoldStop() {
  if (nHoldTimer) { clearTimeout(nHoldTimer); nHoldTimer = null }
  if (nHoldInterval) { clearInterval(nHoldInterval); nHoldInterval = null }
}
function onNChange() { n.value = clampN(n.value) }
const missingKey = computed(() => !!(store.activePreset && !store.activePreset.apiKey))
const canGenerate = computed(() =>
  !!prompt.value.trim() && !!store.activePreset && !missingKey.value && !store.generating
)

function loadSavedPrompts() {
  savedPrompts.value = getAllPrompts(store.activeWorkspaceId).slice(0, 50)
}

function togglePromptLib() {
  // 空输入也能打开列表(复用旧 prompt);有字时列表里可一键收藏当前
  showPromptLib.value = !showPromptLib.value
  if (showPromptLib.value) loadSavedPrompts()
}

const presetOptionEls = new Map()
function setPresetOptionRef(el, id) {
  if (el) presetOptionEls.set(id, el)
  else presetOptionEls.delete(id)
}
function focusPresetOption(id) {
  nextTick(() => presetOptionEls.get(id)?.focus())
}
function togglePresetMenu() {
  presetMenuOpen.value = !presetMenuOpen.value
  if (presetMenuOpen.value) {
    focusPresetOption(store.activePresetId || store.presets[0]?.id)
  } else {
    nextTick(() => presetButton.value?.focus())
  }
}
function onPresetButtonKeydown(e) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  e.preventDefault()
  if (!presetMenuOpen.value) togglePresetMenu()
  else onPresetMenuKeydown(e)
}
function selectPresetUi(id) {
  store.selectPreset(id)
  presetMenuOpen.value = false
  nextTick(() => presetButton.value?.focus())
}
function onPresetMenuKeydown(e) {
  if (e.key === 'Escape') {
    e.preventDefault()
    presetMenuOpen.value = false
    nextTick(() => presetButton.value?.focus())
    return
  }
  const ids = store.presets.map((p) => p.id)
  if (!ids.length) return
  const current = ids.indexOf(document.activeElement?.dataset?.presetId || store.activePresetId)
  let next = current < 0 ? 0 : current
  if (e.key === 'ArrowDown') next = (next + 1) % ids.length
  else if (e.key === 'ArrowUp') next = (next - 1 + ids.length) % ids.length
  else if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = ids.length - 1
  else return
  e.preventDefault()
  focusPresetOption(ids[next])
}

function saveCurrentPrompt() {
  const t = prompt.value.trim()
  if (!t) return
  const r = addPrompt(t, store.activeWorkspaceId)
  if (r.ok) {
    loadSavedPrompts()
    promptLibToast.value = { type: 'success', text: '已收藏 prompt' }
  } else if (r.reason === 'duplicate') {
    promptLibToast.value = { type: 'warn', text: '已收藏过该 prompt' }
  }
  setTimeout(() => { promptLibToast.value = null }, 2000)
}

function fillPrompt(text) {
  prompt.value = text
  showPromptLib.value = false
  nextTick(() => composerInput.value?.focus())
}

function deletePrompt(id) {
  removePrompt(id, store.activeWorkspaceId)
  loadSavedPrompts()
}

// 点击外部关闭 popover
function onDocClick(e) {
  const el = e.target
  if (showPromptLib.value && !el.closest('.prompt-lib-wrap')) showPromptLib.value = false
  if (presetMenuOpen.value && !el.closest('.preset-pick-wrap')) presetMenuOpen.value = false
  if (moreParamsOpen.value && !el.closest('.params-section')) moreParamsOpen.value = false
}

function onComposerKeydown(e) {
  if (e.key !== 'Escape') return
  if (showPromptLib.value) {
    e.preventDefault()
    showPromptLib.value = false
    nextTick(() => promptLibButton.value?.focus())
  } else if (presetMenuOpen.value) {
    e.preventDefault()
    presetMenuOpen.value = false
    nextTick(() => presetButton.value?.focus())
  } else if (moreParamsOpen.value) {
    e.preventDefault()
    moreParamsOpen.value = false
    nextTick(() => paramsSummaryButton.value?.focus())
  }
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onComposerKeydown)
  // 粘贴监听挂 document:无论焦点是否在输入框,Ctrl/Cmd+V 都能贴图(单一监听,避免重复触发)
  document.addEventListener('paste', onPaste)
})
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onComposerKeydown)
  document.removeEventListener('paste', onPaste)
  if (referenceNoticeTimer) clearTimeout(referenceNoticeTimer)
  nHoldStop()
})

// 参考图走 images/edits 改图;多张参考图全部发送(官方上限 16 张)。
const MAX_REFERENCES = 16
const assetById = computed(() => new Map(
  store.assets
    .filter((asset) => !store.activeWorkspaceId || asset.workspaceId === store.activeWorkspaceId)
    .map((asset) => [asset.id, asset]),
))
const refAssets = computed(() =>
  refImageIds.value.map((id) => assetById.value.get(id)).filter(Boolean)
)
const referenceNotice = ref('')
let referenceNoticeTimer = null

function showReferenceNotice(text) {
  referenceNotice.value = text
  if (referenceNoticeTimer) clearTimeout(referenceNoticeTimer)
  referenceNoticeTimer = setTimeout(() => { referenceNotice.value = '' }, 5000)
}

// 素材可能在另一处被删除/导入覆盖。同步清掉失效 id 并提示，避免缩略图消失后状态仍暗中残留。
watch([
  () => [...assetById.value.keys()],
  () => [...refImageIds.value],
], ([assetIds]) => {
  const available = new Set(assetIds)
  const valid = refImageIds.value.filter((id) => available.has(id))
  const removed = refImageIds.value.length - valid.length
  if (!removed) return
  refImageIds.value = valid
  showReferenceNotice(`${removed} 张参考图已不存在，已从本次生成中移除。`)
})

// quiet:内部路径(上传/拖入)不弹提示,缩略图就在眼前;外部路径(素材库/预览设为参考)给反馈。
function addReference(id, { quiet = false } = {}) {
  if (refImageIds.value.includes(id)) return
  if (refImageIds.value.length >= MAX_REFERENCES) {
    showReferenceNotice(`参考图最多 ${MAX_REFERENCES} 张，已忽略新添加的图片。`)
    return
  }
  refImageIds.value = [...refImageIds.value, id]
  if (!quiet) showReferenceNotice(`已加入参考图（当前 ${refImageIds.value.length} 张）`)
}
function removeReference(id) {
  refImageIds.value = refImageIds.value.filter((x) => x !== id)
}

// ── 参考图排序:拖拽 chip 调整顺序(多图改图时顺序 = 图 1 / 图 2)──
const dragRefId = ref(null)
const dragOverRefId = ref(null)
function onRefDragStart(e, id) {
  dragRefId.value = id
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', id)
}
function onRefDragOver(e, id) {
  e.preventDefault()
  e.stopPropagation()
  dragOverRefId.value = id
}
function onRefDrop(e, targetId) {
  e.preventDefault()
  e.stopPropagation()
  const from = dragRefId.value || e.dataTransfer.getData('text/plain')
  dragRefId.value = null
  dragOverRefId.value = null
  if (!from || from === targetId) return
  const list = [...refImageIds.value]
  const fromIdx = list.indexOf(from)
  const toIdx = list.indexOf(targetId)
  if (fromIdx < 0 || toIdx < 0) return
  list.splice(fromIdx, 1)
  list.splice(toIdx, 0, from)
  refImageIds.value = list
}
function onRefDragEnd() {
  dragRefId.value = null
  dragOverRefId.value = null
}
function hasDraft() {
  return !!prompt.value.trim() || refImageIds.value.length > 0
}

// ── 参考图上传(design D3)──
const fileInput = ref(null)
const dropActive = ref(false)
let dragDepth = 0
async function uploadRefImage(file) {
  if (!file || !file.type.startsWith('image/')) return
  try {
    // 走 store:落库并刷新响应式 assets,否则 refAssets 找不到新图、缩略图不显示。
    const asset = await store.addReferenceAsset(file)
    addReference(asset.id, { quiet: true })
  } catch (e) {
    showReferenceNotice(`参考图添加失败：${e?.message || '请重试'}`)
  } finally {
    if (fileInput.value) fileInput.value.value = ''
  }
}
function onFilePick(e) {
  // 支持一次多选:按选择顺序逐张入库(与拖入/粘贴行为一致)
  const files = Array.from(e.target?.files || []).filter((f) => f.type.startsWith('image/'))
  if (files.length) uploadInOrder(files, uploadRefImage)
}
// 从剪贴板事件提取第一张图片(files / items 两条路径,见 lib/clipboard.js)
function onPaste(e) {
  // 只处理图片粘贴,不拦截文本(design 明确:不要拦截纯文本粘贴)
  const file = imageFromClipboard(e.clipboardData)
  if (file) {
    e.preventDefault()
    uploadRefImage(file)
  }
}

// ── DnD(design D4):整个输入区都是拖放目标。用深度计数避免在子元素间移动时闪烁。
function onDragEnter(e) {
  if (dragRefId.value) return // chip 排序拖拽不走整区拖放
  e.preventDefault()
  dragDepth += 1
  dropActive.value = true
}
function onDragOver(e) {
  if (dragRefId.value) return
  e.preventDefault()
}
function onDragLeave() {
  if (dragRefId.value) return
  dragDepth = Math.max(0, dragDepth - 1)
  if (!dragDepth) dropActive.value = false
}
async function onDrop(e) {
  if (dragRefId.value) { dragRefId.value = null; return }
  e.preventDefault()
  dropActive.value = false
  dragDepth = 0
  // 1) 素材库拖入(application/json)
  try {
    const raw = e.dataTransfer?.getData('application/json')
    if (raw) {
      const data = JSON.parse(raw)
      if (data.assetId) {
        addReference(data.assetId)
        return
      }
    }
  } catch { /* 继续尝试文件 */ }
  // 2) 系统文件 / 访达拖入
  const files = Array.from(e.dataTransfer?.files || []).filter((f) => f.type.startsWith('image/'))
  if (files.length) {
    // 串行入库以保留 DataTransfer.files 的用户顺序；全部参考图随请求一并发送。
    await uploadInOrder(files, uploadRefImage)
  }
}
function applyPrefill(prefill) {
  if (!prefill) return
  if (Array.isArray(prefill.refImageIds) && prefill.refImageIds.length > MAX_REFERENCES) {
    showReferenceNotice(`配方最多支持 ${MAX_REFERENCES} 张参考图，未载入。`)
    return
  }
  prompt.value = prefill.prompt || ''
  // 「填入输入框」场景:始终展开画质/数量,避免用户改参时还要再点「更多」。
  moreParamsOpen.value = true
  if (prefill.params?.size) {
    // 向后兼容:旧格式 "1024x1024" 尝试解析,新格式用 ratio+resolution
    const s = prefill.params.size
    if (prefill.params.ratio && prefill.params.resolution) {
      ratio.value = prefill.params.ratio
      resolution.value = prefill.params.resolution
    } else {
      // 旧格式:推算一个近似的 ratio+resolution
      const parts = s.split('x').map(Number)
      if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
        const maxDim = Math.max(parts[0], parts[1])
        if (maxDim <= 1024) resolution.value = '1k'
        else if (maxDim <= 2048) resolution.value = '2k'
        else resolution.value = '4k'
        // ratio:简化分数
        const g = gcd(parts[0], parts[1])
        ratio.value = `${parts[0] / g}:${parts[1] / g}`
      }
    }
  } else if (prefill.params?.ratio === 'auto') {
    // 新格式 Auto:无 size,直接还原为 auto
    ratio.value = 'auto'
    if (prefill.params.resolution) resolution.value = prefill.params.resolution
  }
  if (prefill.params?.n) n.value = clampN(prefill.params.n)
  if (prefill.params?.quality) quality.value = prefill.params.quality
  // 配方回填同样收敛到官方上限，避免把必然失败的请求发出去。
  refImageIds.value = Array.isArray(prefill.refImageIds) ? [...prefill.refImageIds] : []
  nextTick(() => composerInput.value?.focus())
}
function gcd(a, b) { return b ? gcd(b, a % b) : a }
function focusInput() {
  nextTick(() => composerInput.value?.focus())
}
function clear() {
  prompt.value = ''
  refImageIds.value = []
}
defineExpose({ addReference, applyPrefill, clear, fillPrompt, focusInput, hasDraft })

async function submit() {
  if (!canGenerate.value) {
    if (missingKey.value) {
      store.lastError = '当前接口缺少 API Key,请先在接口设置中填写。'
    }
    return
  }
  presetMenuOpen.value = false
  const text = prompt.value.trim()
  const refs = [...refImageIds.value]
  const sizeVal = computeSize(ratio.value, resolution.value)
  // 立即清空输入:乐观上屏已把本轮请求推上对话流,输入框无需等生成完成(请求即时上屏)。
  clear()
  // 发送给接口的 prompt 就是用户原文;画质走真实 quality 参数,不再往 prompt 拼形容词。
  let result = null
  try {
    result = await store.generate({
      prompt: text,
      fullPrompt: text,
      refImageIds: refs,
      params: {
        size: sizeVal,
        ratio: ratio.value,
        resolution: resolution.value,
        quality: quality.value,
        n: clampN(n.value),
      },
    })
  } catch {
    // store normally converts errors to a failed result; keep the draft if an unexpected error escapes.
  }
  // 失败/空结果/主动取消时恢复,但不覆盖用户已经开始输入的下一轮草稿。
  if (!result?.ok && !prompt.value.trim() && !refImageIds.value.length) {
    prompt.value = text
    refImageIds.value = refs
  }
}

// 普通 Enter 保留 textarea 换行;仅 Ctrl/Cmd+Enter 提交,并避开中文输入法候选确认。
function onEnter(e) {
  if (e.isComposing || e.keyCode === 229) return
  if (!e.ctrlKey && !e.metaKey) return
  e.preventDefault()
  submit()
}

function autogrow(e) {
  const el = e?.target || composerInput.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 200) + 'px'
}

// 程序化改 prompt(清空/填回输入框/导入配方)不会触发 @input,
// 这里兜底同步高度,避免清空后空输入框仍占着长 prompt 的高度。
watch(prompt, () => { nextTick(() => autogrow()) })

const settingsRelatedError = computed(() => {
  const msg = store.lastError || ''
  return /API Key|接口|预设|Key/i.test(msg)
})

function dismissError() { store.clearLastError() }
function onErrorAction() {
  if (settingsRelatedError.value) {
    emit('open-settings')
    store.clearLastError()
  } else {
    store.clearLastError()
  }
}
</script>

<template>
  <div
    class="composer-wrap"
    @dragenter="onDragEnter" @dragover="onDragOver"
    @dragleave="onDragLeave" @drop="onDrop"
  >
    <!-- 整区拖放提示:覆盖整个输入区,松开即添加 -->
    <div v-if="dropActive" class="drop-overlay" aria-hidden="true">
      <AppIcon name="layers" :size="18" />
      <span>松开以添加参考图</span>
    </div>

    <!-- 无接口 / 缺 Key:提示本身可点,文案不写死「左侧」(移动端侧栏在汉堡里) -->
    <button
      v-if="!store.activePreset"
      type="button"
      class="hint hint-btn"
      @click="emit('open-settings', { create: true })"
    >
      <AppIcon name="alert" :size="14" /> 还没有可用接口 —— 点此添加,填好即可开始。
    </button>
    <button
      v-else-if="missingKey"
      type="button"
      class="hint hint-btn"
      @click="emit('open-settings')"
    >
      <AppIcon name="alert" :size="14" /> 当前接口缺少 API Key —— 点此填写后即可生成。
    </button>
    <div v-if="store.lastError" class="err-bar" role="alert">
      <AppIcon name="alert" :size="14" />
      <span class="err-text">{{ store.lastError }}</span>
      <button
        v-if="settingsRelatedError"
        type="button"
        class="err-action"
        @click="onErrorAction"
      >去设置</button>
      <button class="err-close" @click="dismissError" aria-label="关闭错误">
        <AppIcon name="x" :size="12" />
      </button>
    </div>

    <div v-if="referenceNotice" class="ref-notice" role="status" aria-live="polite">
      <AppIcon name="alert" :size="13" /> {{ referenceNotice }}
    </div>

    <!-- 参考图 chips 与上传 + DnD 目标(上传按钮始终可见) -->
    <div class="ref-strip" role="group" aria-label="参考图设置">
      <div
        v-for="(a, i) in refAssets" :key="a.id"
        class="ref-thumb" :class="{ 'drag-over': dragOverRefId === a.id, dragging: dragRefId === a.id }"
        draggable="true"
        title="将作为参考图发送（可拖拽排序）"
        @dragstart="onRefDragStart($event, a.id)"
        @dragover="onRefDragOver($event, a.id)"
        @drop="onRefDrop($event, a.id)"
        @dragend="onRefDragEnd"
      >
        <button
          type="button"
          class="ref-preview"
          @click="emit('preview', { asset: a, list: refAssets })"
          :aria-label="`预览第 ${i + 1} 张参考图`"
          title="预览参考图"
        >
          <AssetImage :asset="a" alt="参考图" />
          <span class="ref-badge">{{ i + 1 }}</span>
        </button>
        <button type="button" class="ref-remove" @click="removeReference(a.id)" aria-label="移除参考图" title="移除此参考图">
          <AppIcon name="x" :size="11" />
        </button>
      </div>
      <button
        v-if="refAssets.length < MAX_REFERENCES"
        type="button"
        class="ref-add"
        @click="fileInput?.click()"
        title="上传参考图"
        aria-label="上传参考图"
      >
        <AppIcon name="plus" :size="14" />
      </button>
      <input ref="fileInput" type="file" accept="image/*" multiple class="hidden-input" @change="onFilePick" />
      <span class="ref-tip">
        {{ refAssets.length >= MAX_REFERENCES
          ? `已添加 ${MAX_REFERENCES} 张参考图`
          : (refAssets.length ? `${refAssets.length} 张参考图 · 点击缩略图预览` : '上传、粘贴或拖入参考图') }}
      </span>
    </div>

    <!-- 主输入框 -->
    <div class="composer" :class="{ disabled: !store.activePreset }">
      <!-- Prompt 是主操作;参数默认收起,只保留一个摘要入口。 -->
      <textarea
        ref="composerInput"
        v-model="prompt" rows="3" class="composer-input"
        placeholder="描述你想画的画面…"
        @input="autogrow"
        @keydown.enter="onEnter"
      />

      <div class="params-section">
        <button
          ref="paramsSummaryButton"
          class="settings-summary"
          :class="{ open: moreParamsOpen, dirty: moreParamsDirty }"
          type="button"
          @click="toggleAdvanced"
          :aria-expanded="moreParamsOpen"
          aria-controls="composer-params"
          :title="moreParamsOpen ? '收起生成参数' : '展开生成参数'"
        >
          <AppIcon name="settings" :size="12" />
          <span>参数 · {{ settingsSummary }}</span>
          <AppIcon :name="moreParamsOpen ? 'chevron-down' : 'chevron-right'" :size="11" />
        </button>

        <div v-if="moreParamsOpen" id="composer-params" class="params-panel" @click.stop>
          <div class="params-row">
            <span class="params-tag-label">比例</span>
            <div class="ratio-grid">
              <button
                class="tag ratio-auto" :class="{ active: ratio === 'auto' }"
                type="button" @click="ratio = 'auto'"
              >
                <AppIcon v-if="ratio === 'auto'" name="check" :size="10" />
                Auto
              </button>
              <button
                v-for="r in RATIO_GRID" :key="r.key"
                class="tag" :class="{ active: ratio === r.key }"
                type="button" @click="ratio = r.key"
              >
                <AppIcon v-if="ratio === r.key" name="check" :size="10" />
                {{ r.label }}
              </button>
            </div>
          </div>

          <div class="params-row">
            <span class="params-tag-label">预设</span>
            <div class="tag-group">
              <button
                v-for="p in QUALITY_PRESETS" :key="p.key"
                class="tag preset-tag" :class="{ active: activePresetKey === p.key }"
                type="button" @click="selectPreset(p)"
              >
                <AppIcon v-if="activePresetKey === p.key" name="check" :size="10" />
                {{ p.label }}
              </button>
            </div>
          </div>

          <div class="params-row params-row-settings">
            <span class="params-tag-label">分辨率</span>
            <div class="tag-group">
              <button
                v-for="r in RESOLUTIONS" :key="r.key"
                class="tag accent-tag" :class="{ active: resolution === r.key }"
                type="button" @click="resolution = r.key"
              >
                <AppIcon v-if="resolution === r.key" name="check" :size="10" />
                {{ r.label }}
              </button>
            </div>
            <span class="params-tag-label params-tag-label-n">画质</span>
            <div class="tag-group">
              <button
                v-for="q in QUALITIES" :key="q.key"
                class="tag accent-tag" :class="{ active: quality === q.key }"
                type="button" @click="quality = q.key"
              >
                <AppIcon v-if="quality === q.key" name="check" :size="10" />
                {{ q.label }}
              </button>
            </div>
            <span class="params-tag-label params-tag-label-n">数量</span>
            <div class="n-stepper" title="生成数量（1-4）">
              <button
                class="n-btn" type="button" aria-label="减少数量"
                @pointerdown.prevent="nHoldStart(-1)"
                @pointerup="nHoldStop" @pointerleave="nHoldStop" @pointercancel="nHoldStop"
              >
                <AppIcon name="minus" :size="12" />
              </button>
              <input
                class="n-input" type="number" min="1" max="4"
                v-model.number="n" @change="onNChange" aria-label="生成数量"
              />
              <button
                class="n-btn" type="button" aria-label="增加数量"
                @pointerdown.prevent="nHoldStart(1)"
                @pointerup="nHoldStop" @pointerleave="nHoldStop" @pointercancel="nHoldStop"
              >
                <AppIcon name="plus" :size="12" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="composer-bar">
        <span class="proto-tip">{{ refAssets.length ? '改图 · 带参考图' : '文生图' }}</span>

        <!-- 当前接口:跟随生成上下文,紧挨输入区切换 -->
        <div class="preset-pick-wrap">
          <button
            ref="presetButton"
            class="preset-pick" :class="{ open: presetMenuOpen }"
            @click="togglePresetMenu"
            @keydown="onPresetButtonKeydown"
            :aria-expanded="presetMenuOpen" aria-haspopup="listbox"
            :title="store.activePreset ? store.activePreset.name || '未命名' : ''"
          >
            <AppIcon name="settings" :size="12" />
            <span class="preset-pick-name">{{ store.activePreset?.name || '未命名' }}</span>
            <span
              v-if="store.activePreset && !store.activePreset.apiKey"
              class="badge badge-warn preset-key-badge"
              @click.stop="presetMenuOpen = false; emit('open-settings')"
              title="填写 API Key"
            >缺 Key</span>
            <AppIcon name="chevron-down" :size="11" class="preset-pick-chev" />
          </button>
          <div v-if="presetMenuOpen" class="preset-pop" role="listbox" aria-label="选择接口" @keydown="onPresetMenuKeydown">
            <div class="preset-pop-head">切换接口</div>
            <button
              v-for="p in store.presets" :key="p.id"
              :ref="(el) => setPresetOptionRef(el, p.id)"
              :data-preset-id="p.id"
              :id="`preset-option-${p.id}`"
              class="preset-pop-item" :class="{ active: p.id === store.activePresetId }"
              role="option" :aria-selected="p.id === store.activePresetId"
              @click="selectPresetUi(p.id)"
            >
              <span class="preset-pop-main">
                <span class="preset-pop-name">{{ p.name || '未命名' }}</span>
                <span class="preset-pop-meta">{{ p.model || '未设模型' }} · {{ p.baseURL || '' }}</span>
              </span>
              <span v-if="!p.apiKey" class="badge badge-warn preset-key-badge">缺 Key</span>
              <AppIcon v-if="p.id === store.activePresetId" name="check" :size="12" />
            </button>
            <div class="preset-pop-divider" />
            <button class="preset-pop-item" @click="presetMenuOpen = false; emit('open-settings')">
              <AppIcon name="settings" :size="13" /> 管理接口
            </button>
          </div>
        </div>

        <div class="spacer" />

        <div class="prompt-lib-wrap">
          <button
            ref="promptLibButton"
            class="chip star-btn" :class="{ active: showPromptLib, highlight: prompt.trim() && !showPromptLib }"
            @click.stop="togglePromptLib"
            :title="prompt.trim() ? '收藏 / 打开 Prompt 库' : '打开 Prompt 库'"
            aria-label="Prompt 库"
          >
            <AppIcon name="heart" :size="13" />
          </button>

          <div v-if="showPromptLib" class="prompt-pop" @click.stop>
            <div v-if="promptLibToast" class="prompt-toast" :class="promptLibToast.type">{{ promptLibToast.text }}</div>
            <div class="prompt-pop-head">
              <span class="prompt-pop-title">已收藏</span>
              <button class="pop-save" :disabled="!prompt.trim()" @click="saveCurrentPrompt" title="收藏当前 prompt">
                <AppIcon name="plus" :size="13" /> 收藏当前
              </button>
            </div>
            <div v-if="!savedPrompts.length" class="prompt-empty">暂无收藏的 prompt</div>
            <div v-else class="prompt-list">
              <div
                v-for="p in savedPrompts" :key="p.id"
                class="prompt-item" @click="fillPrompt(p.text)"
              >
                <span class="prompt-text">{{ p.text }}</span>
                <button class="prompt-del" @click.stop="deletePrompt(p.id)" title="删除">
                  <AppIcon name="x" :size="11" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <button
          v-if="store.generating"
          class="btn btn-ghost send cancel"
          @click="store.cancelActiveGeneration()"
          aria-label="取消生成"
        >
          <AppIcon name="x" :size="16" />
          取消
        </button>
        <button
          v-else
          class="btn btn-primary send"
          :disabled="!canGenerate"
          @click="submit" aria-label="生成图片"
          :title="missingKey ? '请先填写 API Key' : (!store.activePreset ? '请先添加接口' : '生成图片')"
        >
          <AppIcon name="sparkles" :size="16" />
          生成
        </button>
      </div>
    </div>
    <p class="composer-foot">Enter 换行 · Ctrl/Cmd+Enter 生成</p>
  </div>
</template>

<style scoped>
.composer-wrap {
  width: 100%; max-width: 780px; margin: 0 auto; position: relative;
}
.drop-overlay {
  position: absolute; inset: 0; z-index: 30;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; border-radius: 20px;
  background: color-mix(in srgb, var(--color-bg) 80%, transparent);
  border: 2px dashed var(--color-primary);
  color: var(--color-primary); font-size: 14px; font-weight: 650;
  backdrop-filter: blur(3px);
  pointer-events: none;
}
.hint {
  display: flex; align-items: center; gap: 8px; font-size: 12px;
  color: var(--color-warning); margin-bottom: var(--space-2);
  padding: 8px 12px; border-radius: 999px;
  background: color-mix(in srgb, var(--color-warning) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-warning) 24%, transparent);
}
.hint-btn {
  width: 100%; text-align: left; cursor: pointer;
  transition: background var(--dur) var(--ease);
}
.hint-btn:hover {
  background: color-mix(in srgb, var(--color-warning) 16%, transparent);
}
.err-bar {
  display: flex; align-items: center; gap: 8px; font-size: 12px;
  color: var(--color-destructive); margin-bottom: var(--space-2);
  padding: 8px 12px; border-radius: 12px;
  background: color-mix(in srgb, var(--color-destructive) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-destructive) 24%, transparent);
}
.err-text { flex: 1; min-width: 0; line-height: 1.4; }
.err-action {
  flex-shrink: 0; font-size: 12px; font-weight: 650;
  color: var(--color-destructive); padding: 4px 8px; border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--color-destructive) 30%, transparent);
  background: color-mix(in srgb, var(--color-destructive) 8%, transparent);
}
.err-action:hover { background: color-mix(in srgb, var(--color-destructive) 14%, transparent); }
.err-close {
  flex-shrink: 0; width: 22px; height: 22px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 999px; color: var(--color-destructive);
}
.err-close:hover { background: color-mix(in srgb, var(--color-destructive) 12%, transparent); }
.ref-notice {
  display: flex; align-items: center; gap: 7px;
  margin-bottom: var(--space-2); padding: 8px 12px; border-radius: 12px;
  font-size: 12px; color: var(--color-warning);
  background: color-mix(in srgb, var(--color-warning) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-warning) 24%, transparent);
}

.ref-strip {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: var(--space-2); padding: 8px 10px;
  flex-wrap: wrap; border: 1px solid var(--color-border);
  border-radius: 16px; background: color-mix(in srgb, var(--color-surface) 82%, transparent);
}
.ref-thumb {
  position: relative; width: 76px; height: 76px; border-radius: 12px;
  overflow: hidden; border: 1px solid var(--color-border-strong);
  box-shadow: var(--shadow-1); cursor: grab;
  transition: opacity var(--dur) var(--ease), outline-color var(--dur) var(--ease);
}
.ref-thumb:active { cursor: grabbing; }
.ref-thumb.dragging { opacity: 0.45; }
.ref-thumb.drag-over {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  opacity: 0.8;
}
.ref-preview {
  position: relative; display: block; width: 100%; height: 100%; padding: 0;
  overflow: hidden; cursor: zoom-in; background: var(--color-surface-2);
}
.ref-preview :deep(.asset-img) { object-fit: contain; }
.ref-badge {
  position: absolute; top: 3px; left: 3px;
  width: auto; min-height: 0; font-size: 10px; font-weight: 700; line-height: 1;
  padding: 3px 5px; border: 0; border-radius: 5px;
  color: #fff; background: rgba(0,0,0,0.62); backdrop-filter: blur(4px);
  text-align: center; pointer-events: none;
}
.ref-remove {
  position: absolute; top: 4px; right: 4px; width: 22px; height: 22px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.5); color: #fff; border-radius: 999px;
  backdrop-filter: blur(4px);
  opacity: 0.55;
  transition: opacity var(--dur) var(--ease), background var(--dur) var(--ease), transform var(--dur) var(--ease);
}
.ref-thumb:hover .ref-remove { opacity: 1; background: rgba(0,0,0,0.72); }
@media (hover: none) {
  .ref-remove { opacity: 0.9; }
}
.ref-add {
  width: 76px; height: 76px; display: flex; align-items: center; justify-content: center;
  border-radius: 12px; border: 1px dashed var(--color-border-strong);
  color: var(--color-fg-muted);
  transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.ref-add:hover {
  border-color: var(--color-primary); color: var(--color-primary);
  background: var(--color-primary-soft);
}
.hidden-input { display: none; }
.ref-tip { flex: 1; min-width: 150px; font-size: 11px; line-height: 1.4; color: var(--color-fg-subtle); }

@media (max-width: 520px) {
  .ref-strip { gap: 8px; padding: 7px 8px; }
  .ref-thumb, .ref-add { width: 64px; height: 64px; border-radius: 10px; }
  .ref-remove { top: 3px; right: 3px; width: 20px; height: 20px; }
  .ref-tip { min-width: 130px; }
}

.composer {
  background: color-mix(in srgb, var(--color-surface) 94%, transparent);
  border: 1px solid var(--color-border-strong);
  border-radius: 24px;
  padding: 14px 14px 10px;
  box-shadow: var(--shadow-2);
  backdrop-filter: blur(16px);
  transition: border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}
.composer:focus-within {
  border-color: color-mix(in srgb, var(--color-primary) 55%, var(--color-border-strong));
  box-shadow: var(--shadow-glow);
}
.composer.disabled { opacity: 0.72; }
.composer-input {
  min-height: 80px; height: 80px; box-sizing: border-box;
  border: none; background: transparent; padding: 8px;
  font-size: 15px; max-height: 200px; overflow-y: auto; line-height: 1.5;
}
.composer-input:focus { outline: none; }

.composer-bar { display: flex; align-items: center; gap: var(--space-2); margin-top: 4px; position: relative; flex-wrap: wrap; }
.chip {
  display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--color-fg-muted);
  padding: 6px 10px; border-radius: 999px; border: 1px solid var(--color-border);
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease), border-color var(--dur) var(--ease);
}
.chip:hover { background: var(--color-surface-2); color: var(--color-fg); }

/* 生成参数:输入区下方只保留一个摘要入口。 */
.params-section {
  display: flex; flex-direction: column; gap: 8px;
  margin-top: 8px; padding: 0 2px;
}
.settings-summary {
  display: inline-flex; align-items: center; gap: 6px;
  align-self: flex-start; max-width: min(100%, 420px);
  min-height: 30px; padding: 5px 12px; border-radius: 999px;
  font-size: 11.5px; color: var(--color-fg-muted);
  background: var(--color-surface-2); border: 1px solid var(--color-border);
  transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease),
    background var(--dur) var(--ease);
}
.settings-summary:hover { color: var(--color-fg); border-color: var(--color-border-strong); }
.settings-summary span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.settings-summary.open {
  color: var(--color-primary);
  border-color: color-mix(in srgb, var(--color-primary) 40%, transparent);
  background: var(--color-primary-soft);
}
.settings-summary.dirty:not(.open) { color: var(--color-primary); }
.params-panel {
  display: flex; flex-direction: column; gap: 10px;
  padding: 10px; border: 1px solid var(--color-border);
  border-radius: 14px; background: var(--color-surface-2);
  animation: params-in 160ms var(--ease-out);
}
.params-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.params-tag-label {
  font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--color-fg-subtle); flex-shrink: 0;
}
.params-tag-label-n { margin-left: 4px; }
.ratio-grid {
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px;
  flex: 1; min-width: 220px;
}
.ratio-auto { border-style: dashed; }
@keyframes params-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: none; }
}
.tag-group { display: flex; gap: 4px; flex-wrap: wrap; }
.tag {
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  padding: 5px 10px; font-size: 12px; border-radius: 999px;
  border: 1px solid transparent; color: var(--color-fg-muted);
  background: var(--color-surface-2);
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease),
    border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}
.tag:hover { color: var(--color-fg); background: var(--color-elevated); }
.tag.active {
  /* 比例维度:primary 蓝 — 描边 + 柔和底 + 微光,不再纯黑底白字 */
  color: var(--color-primary);
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 15%, transparent),
    0 4px 12px color-mix(in srgb, var(--color-primary) 22%, transparent);
}
.tag.accent-tag.active {
  /* 画质/分辨率维度:accent 绿,与比例维度区分 */
  color: var(--color-accent);
  border-color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 15%, transparent),
    0 4px 12px color-mix(in srgb, var(--color-accent) 22%, transparent);
}
.preset-tag { font-weight: 600; padding: 6px 12px; }
.n-stepper { display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; }
.n-btn {
  width: 28px; height: 28px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--color-fg-muted); background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease),
    background var(--dur) var(--ease), transform var(--dur) var(--ease);
}
.n-btn:hover {
  color: var(--color-fg); border-color: var(--color-border-strong);
  background: var(--color-elevated);
}
.n-btn:active { transform: scale(0.92); }
.n-input {
  width: 48px; min-height: 30px; border-radius: 999px; text-align: center;
  font-size: 13px; color: var(--color-fg);
  background: var(--color-surface-2); border: 1px solid var(--color-border);
}
.n-input:focus { outline: none; border-color: var(--color-primary); }
.n-input::-webkit-outer-spin-button,
.n-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.n-input { -moz-appearance: textfield; }
.tnum {
  width: 52px; min-height: 30px; border-radius: 999px;
  background: var(--color-surface-2); border-color: transparent; text-align: center;
}
.proto-tip {
  font-size: 11px; color: var(--color-fg-subtle);
  padding: 4px 10px; border-radius: 999px;
  background: var(--color-surface-2); border: 1px solid var(--color-border);
}
.preset-pick-wrap { position: relative; }
.preset-pick {
  display: inline-flex; align-items: center; gap: 5px;
  max-width: 200px; min-height: 28px; padding: 0 10px;
  border-radius: 999px; font-size: 12px; color: var(--color-fg-muted);
  background: var(--color-surface-2); border: 1px solid var(--color-border);
  transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease),
    background var(--dur) var(--ease);
}
.preset-pick:hover, .preset-pick.open {
  color: var(--color-fg); border-color: var(--color-border-strong);
  background: var(--color-elevated);
}
.preset-pick-name {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.preset-key-badge { flex-shrink: 0; padding: 1px 6px; font-size: 10px; }
.preset-pick-chev { flex-shrink: 0; color: var(--color-fg-subtle); transition: transform var(--dur) var(--ease); }
.preset-pick.open .preset-pick-chev { transform: rotate(180deg); }
.preset-pop {
  position: absolute; bottom: calc(100% + 8px); left: 0; z-index: 35;
  width: min(300px, 80vw); max-height: 300px; overflow-y: auto;
  padding: var(--space-1);
  background: var(--color-elevated); border: 1px solid var(--color-border-strong);
  border-radius: 14px; box-shadow: var(--shadow-pop);
  display: flex; flex-direction: column; gap: 1px;
}
.preset-pop-head {
  padding: 6px 10px 4px; font-size: 10px; font-weight: 650;
  text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-fg-subtle);
}
.preset-pop-item {
  display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
  padding: 8px 10px; border-radius: 8px; font-size: 12.5px; color: var(--color-fg-muted);
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
}
.preset-pop-item:hover { background: var(--color-surface-2); color: var(--color-fg); }
.preset-pop-item.active { background: var(--color-primary-soft); color: var(--color-primary); }
.preset-pop-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.preset-pop-name {
  color: inherit; font-weight: 600;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.preset-pop-meta {
  font-size: 10.5px; opacity: 0.75;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.preset-pop-divider { height: 1px; background: var(--color-border); margin: 4px 8px; }
.spacer { flex: 1; }

/* Prompt 收藏 */
.prompt-lib-wrap { position: relative; }
.star-btn.active {
  background: color-mix(in srgb, var(--color-heart) 14%, transparent);
  color: var(--color-heart); border-color: color-mix(in srgb, var(--color-heart) 35%, transparent);
}
.star-btn.highlight { color: var(--color-heart); border-color: color-mix(in srgb, var(--color-heart) 40%, transparent); }

.prompt-pop {
  position: absolute; bottom: 44px; right: 0; z-index: 30;
  width: 320px; max-height: 280px; display: flex; flex-direction: column;
  background: var(--color-elevated); border: 1px solid var(--color-border-strong);
  border-radius: 16px; box-shadow: var(--shadow-pop);
  overflow: hidden; backdrop-filter: blur(12px);
}
.prompt-pop-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px; border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.prompt-pop-title { font-size: 11px; font-weight: 650; color: var(--color-fg-subtle); text-transform: uppercase; letter-spacing: 0.05em; }
.pop-save { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; color: var(--color-primary); padding: 4px 8px; border-radius: 999px; }
.pop-save:hover:not(:disabled) { background: var(--color-primary-soft); }
.pop-save:disabled { opacity: 0.4; }
.prompt-toast { padding: 6px 12px; font-size: 11px; flex-shrink: 0; }
.prompt-toast.success { background: var(--color-primary-soft); color: var(--color-primary); }
.prompt-toast.warn { background: color-mix(in srgb, var(--color-warning) 12%, transparent); color: var(--color-warning); }

.prompt-empty { padding: var(--space-6) var(--space-3); text-align: center; font-size: 12px; color: var(--color-fg-subtle); }
.prompt-list { overflow-y: auto; flex: 1; }
.prompt-item {
  display: flex; align-items: center; gap: var(--space-2);
  padding: 10px 12px; cursor: pointer;
  border-bottom: 1px solid var(--color-border); font-size: 13px;
  transition: background var(--dur) var(--ease);
}
.prompt-item:hover { background: var(--color-surface-2); }
.prompt-item:last-child { border-bottom: none; }
.prompt-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-fg); }
.prompt-del { flex-shrink: 0; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-sm); color: var(--color-fg-subtle); }
.prompt-del:hover { background: var(--color-surface-2); color: var(--color-destructive); }

.send { border-radius: 999px; min-height: 40px; padding: 0 18px; }
.send.cancel {
  border: 1px solid var(--color-border-strong); color: var(--color-fg-muted);
  background: var(--color-surface-2); box-shadow: none;
}
.send.cancel:hover {
  color: var(--color-destructive); border-color: color-mix(in srgb, var(--color-destructive) 45%, transparent);
  background: color-mix(in srgb, var(--color-destructive) 10%, transparent);
}
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.composer-foot { text-align: center; font-size: 11px; color: var(--color-fg-subtle); margin: 10px 0 0; }
</style>
