<script setup>
// 底部固定输入区(composer,对话式布局)。prompt + 内联参数 + 参考图 chips + 生成。
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWorkbenchStore, MAX_GENERATION_QUEUE } from '../stores/workbench.js'
import AppIcon from './AppIcon.vue'
import AssetImage from './AssetImage.vue'
import { addPrompt, removePrompt, updatePrompt, getAllPrompts } from '../lib/promptLibrary.js'
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
  { key: 'high' },
  { key: 'medium' },
  { key: 'low' },
]
const RES_LABELS = { '1k': '1K', '2k': '2K', '4k': '4K' }
// 画质预设:分辨率 × 画质 的快捷组合;「标准」为默认(1K+中)
const QUALITY_PRESETS = [
  { key: 'standard', res: '1k', q: 'medium' },
  { key: 'hd', res: '2k', q: 'high' },
  { key: 'uhd', res: '4k', q: 'high' },
]

function computeSize(r, res) {
  if (r === 'auto') return null
  const base = RES_MAP[res]
  const [w, h] = r.split(':').map(Number)
  if (w === h) return `${base}x${base}`
  if (w > h) return `${base}x${Math.round(base * h / w)}`
  return `${Math.round(base * w / h)}x${base}`
}

const { t } = useI18n()
const store = useWorkbenchStore()
const emit = defineEmits(['open-settings', 'preview'])

function labelForQuality(key) {
  return t(`composer.qualities.${key}`)
}
function labelForPreset(key) {
  return t(`composer.qualityPresets.${key}`)
}

const prompt = ref('')
const MAX_PROMPT_LENGTH = 1000
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
const promptQuery = ref('')
const editingPromptId = ref(null)
const editingPromptText = ref('')
// 收藏多了以后只能靠翻页,搜索是这里最低成本的补救。
const visiblePrompts = computed(() => {
  const q = promptQuery.value.trim().toLowerCase()
  if (!q) return savedPrompts.value
  return savedPrompts.value.filter((p) => (p.text || '').toLowerCase().includes(q))
})
const promptLibToast = ref(null)
// 接口切换(跟随生成上下文,放输入区而非侧栏导航树)
const presetMenuOpen = ref(false)
// 同一接口下的模型切换:仅在保存了多个模型时出现。
const modelMenuOpen = ref(false)
const modelButton = ref(null)
const modelWrap = ref(null)
const modelOptions = computed(() => {
  const preset = store.activePreset
  if (!preset) return []
  const list = Array.isArray(preset.models) ? preset.models : []
  if (list.length) return list
  return preset.model ? [preset.model] : []
})
const currentModel = computed(() => {
  const preset = store.activePreset
  if (preset?.model && modelOptions.value.includes(preset.model)) return preset.model
  return modelOptions.value[0] || ''
})
function presetMeta(p) {
  const models = Array.isArray(p.models) && p.models.length
    ? p.models
    : (p.model ? [p.model] : [])
  if (!models.length) return t('composer.preset.noModel')
  const current = models.includes(p.model) ? p.model : models[0]
  return models.length > 1 ? `${current} +${models.length - 1}` : current
}
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
  const qLabel = labelForQuality(quality.value)
  return t('composer.params.summary', { ratio: ratioLabel, res: resLabel, quality: qLabel, count: clampN(n.value) })
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
const generateDisabledReason = computed(() => {
  if (store.generating) return ''
  if (!store.activePreset) return t('composer.generate.noPreset')
  if (missingKey.value) return t('composer.generate.noApiKey')
  if (!prompt.value.trim()) return t('composer.generate.noPrompt')
  return ''
})
const canGenerate = computed(() => !generateDisabledReason.value && !store.generating)
// 生成中把快捷键含义写出来:此时 Ctrl/Cmd+Enter 是「加入队列」而不是「生成」。
const composerFootHint = computed(() => store.generating
  ? t('composer.footHint.generating', { current: store.generationQueue.length, max: MAX_GENERATION_QUEUE })
  : t('composer.footHint.idle'))
const promptLength = computed(() => prompt.value.length)
const promptPlaceholder = computed(() => refAssets.value.length
  ? t('composer.prompt.placeholderWithRefs')
  : t('composer.prompt.placeholderDefault'))
const promptLengthClass = computed(() => ({
  'near-limit': promptLength.value >= MAX_PROMPT_LENGTH * 0.9,
  'at-limit': promptLength.value >= MAX_PROMPT_LENGTH,
}))

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
    modelMenuOpen.value = false
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
  modelMenuOpen.value = false
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

function toggleModelMenu() {
  modelMenuOpen.value = !modelMenuOpen.value
  if (modelMenuOpen.value) {
    presetMenuOpen.value = false
    nextTick(() => modelWrap.value?.querySelector('.model-pop-item')?.focus())
  } else {
    nextTick(() => modelButton.value?.focus())
  }
}
function onModelButtonKeydown(e) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  e.preventDefault()
  if (!modelMenuOpen.value) toggleModelMenu()
  else onModelMenuKeydown(e)
}
function onModelMenuKeydown(e) {
  if (e.key === 'Escape') {
    e.preventDefault()
    modelMenuOpen.value = false
    nextTick(() => modelButton.value?.focus())
    return
  }
  const options = [...(modelWrap.value?.querySelectorAll('.model-pop-item') || [])]
  if (!options.length) return
  const current = options.indexOf(document.activeElement)
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const offset = e.key === 'ArrowDown' ? 1 : -1
    const next = current < 0 ? 0 : (current + offset + options.length) % options.length
    options[next]?.focus()
  } else if (e.key === 'Home' || e.key === 'End') {
    e.preventDefault()
    options[e.key === 'Home' ? 0 : options.length - 1]?.focus()
  }
}
function selectModelUi(model) {
  store.setActiveModel(model)
  modelMenuOpen.value = false
  nextTick(() => modelButton.value?.focus())
}

function saveCurrentPrompt() {
  const text = prompt.value.trim()
  if (!text) return
  const r = addPrompt(text, store.activeWorkspaceId)
  if (r.ok) {
    loadSavedPrompts()
    promptLibToast.value = { type: 'success', text: t('composer.promptLib.saved') }
  } else if (r.reason === 'duplicate') {
    promptLibToast.value = { type: 'warn', text: t('composer.promptLib.alreadySaved') }
  }
  setTimeout(() => { promptLibToast.value = null }, 2000)
}

function fillPrompt(text) {
  prompt.value = String(text || '')
  showPromptLib.value = false
  nextTick(() => composerInput.value?.focus())
}

function clearPrompt() {
  prompt.value = ''
  nextTick(() => composerInput.value?.focus())
}

function deletePrompt(id) {
  removePrompt(id, store.activeWorkspaceId)
  if (editingPromptId.value === id) editingPromptId.value = null
  loadSavedPrompts()
}
function startEditPrompt(p) {
  editingPromptId.value = p.id
  editingPromptText.value = p.text
}
function savePromptEdit(p) {
  const r = updatePrompt(p.id, editingPromptText.value, store.activeWorkspaceId)
  if (!r.ok) {
    promptLibToast.value = { type: 'warn', text: r.reason === 'duplicate' ? t('composer.promptLib.duplicate') : t('composer.promptLib.emptyContent') }
    setTimeout(() => { promptLibToast.value = null }, 2000)
    return
  }
  editingPromptId.value = null
  loadSavedPrompts()
}
function onPromptEditKeydown(e, p) {
  if (e.isComposing || e.keyCode === 229) return
  if (e.key === 'Enter') { e.preventDefault(); savePromptEdit(p) }
  else if (e.key === 'Escape') { e.preventDefault(); editingPromptId.value = null }
}
// 点击外部关闭 popover
function onDocClick(e) {
  const el = e.target
  if (showPromptLib.value && !el.closest('.prompt-lib-wrap')) showPromptLib.value = false
  if (presetMenuOpen.value && !el.closest('.preset-pick-wrap')) presetMenuOpen.value = false
  if (modelMenuOpen.value && !el.closest('.model-pick-wrap')) modelMenuOpen.value = false
  if (moreParamsOpen.value && !el.closest('.params-section')) moreParamsOpen.value = false
}

function onComposerKeydown(e) {
  if (e.key !== 'Escape') return
  if (showPromptLib.value) {
    e.preventDefault()
    showPromptLib.value = false
    nextTick(() => promptLibButton.value?.focus())
  } else if (modelMenuOpen.value) {
    e.preventDefault()
    modelMenuOpen.value = false
    nextTick(() => modelButton.value?.focus())
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
// 单条提示栏:参考图提醒与队列提醒共用,避免同时堆两三条横幅把输入区顶下去。
const notice = ref(null) // { text, tone: 'warn' | 'info' }
const referenceOrderAnnouncement = ref('')
const refItemEls = new Map()
let referenceNoticeTimer = null

function setRefItemRef(el, id) {
  if (el) refItemEls.set(id, el)
  else refItemEls.delete(id)
}

function showNotice(text, tone = 'warn') {
  notice.value = { text, tone }
  if (referenceNoticeTimer) clearTimeout(referenceNoticeTimer)
  referenceNoticeTimer = setTimeout(() => { notice.value = null }, 5000)
}
function showReferenceNotice(text) { showNotice(text, 'warn') }

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
  showReferenceNotice(t('composer.ref.missingRemoved', { count: removed }))
})

// quiet:内部路径(上传/拖入)不弹提示,缩略图就在眼前;外部路径(素材库/预览设为参考)给反馈。
function addReference(id, { quiet = false } = {}) {
  if (refImageIds.value.includes(id)) return
  if (refImageIds.value.length >= MAX_REFERENCES) {
    showReferenceNotice(t('composer.ref.maxReached', { max: MAX_REFERENCES }))
    return
  }
  refImageIds.value = [...refImageIds.value, id]
  if (!quiet) showReferenceNotice(t('composer.ref.added', { count: refImageIds.value.length }))
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
function moveReference(id, targetIndex) {
  const list = [...refImageIds.value]
  const fromIndex = list.indexOf(id)
  if (fromIndex < 0) return
  const nextIndex = Math.max(0, Math.min(list.length - 1, targetIndex))
  if (fromIndex === nextIndex) return
  list.splice(fromIndex, 1)
  list.splice(nextIndex, 0, id)
  refImageIds.value = list
  const message = t('composer.ref.moved', { from: fromIndex + 1, to: nextIndex + 1 })
  referenceOrderAnnouncement.value = ''
  showReferenceNotice(message)
  nextTick(() => {
    refItemEls.get(id)?.focus()
    referenceOrderAnnouncement.value = message
  })
}
function onRefKeydown(e, id) {
  // 排序键只在参考图外层获得焦点时生效,避免删除按钮的方向键被父层抢走。
  if (e.currentTarget !== e.target) return
  const index = refImageIds.value.indexOf(id)
  if (index < 0) return
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    const asset = refAssets.value.find((item) => item.id === id)
    if (asset) emit('preview', { asset, list: refAssets.value })
    return
  }
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    moveReference(id, index - 1)
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    moveReference(id, index + 1)
  } else if (e.key === 'Home') {
    e.preventDefault()
    moveReference(id, 0)
  } else if (e.key === 'End') {
    e.preventDefault()
    moveReference(id, refImageIds.value.length - 1)
  }
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
    showReferenceNotice(t('composer.ref.uploadFailed', { error: e?.message || t('composer.ref.retry') }))
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
    showReferenceNotice(t('composer.ref.recipeOverLimit', { max: MAX_REFERENCES }))
    return
  }
  prompt.value = String(prefill.prompt || '')
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
const vFocus = { mounted: (el) => el.focus() }
defineExpose({ addReference, applyPrefill, clear, fillPrompt, focusInput, hasDraft })

function currentParams() {
  return {
    size: computeSize(ratio.value, resolution.value),
    ratio: ratio.value,
    resolution: resolution.value,
    quality: quality.value,
    n: clampN(n.value),
  }
}

// 生成中再提交 = 排队。之前这里静默 return,用户会以为快捷键失灵。
function enqueueCurrentDraft() {
  const text = prompt.value.trim()
  if (!text) {
    showNotice(t('composer.queue.empty'), 'warn')
    return false
  }
  const r = store.enqueueGeneration({
    prompt: text,
    refImageIds: [...refImageIds.value],
    params: currentParams(),
  })
  if (r.ok) {
    clear()
    showNotice(t('composer.queue.enqueued', { position: r.position }), 'info')
    return true
  }
  if (r.reason === 'full') {
    showNotice(t('composer.queue.full', { max: r.max }), 'warn')
  } else if (r.reason === 'no-preset') {
    showNotice(t('composer.queue.noPreset'), 'warn')
  } else if (r.reason === 'no-key') {
    store.lastError = t('composer.queue.noKey')
  }
  return false
}

async function submit() {
  // 已有任务在跑:不打断当前请求,把这一单排到队尾。
  if (store.generating) {
    enqueueCurrentDraft()
    return
  }
  if (!canGenerate.value) {
    if (missingKey.value) {
      store.lastError = t('composer.queue.noKey')
    }
    return
  }
  presetMenuOpen.value = false
  const text = prompt.value.trim()
  const refs = [...refImageIds.value]
  const params = currentParams()
  // 立即清空输入:乐观上屏已把本轮请求推上对话流,输入框无需等生成完成(请求即时上屏)。
  clear()
  // 发送给接口的 prompt 就是用户原文;画质走真实 quality 参数,不再往 prompt 拼形容词。
  let result = null
  try {
    result = await store.generate({
      prompt: text,
      refImageIds: refs,
      params,
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

function onPromptInput(e) {
  if (prompt.value.length > MAX_PROMPT_LENGTH) {
    prompt.value = prompt.value.slice(0, MAX_PROMPT_LENGTH)
  }
  autogrow(e)
}

// 程序化改 prompt(清空/填回输入框/导入配方)不会触发 @input,
// 这里兜底同步高度,避免清空后空输入框仍占着长 prompt 的高度。
watch(prompt, () => { nextTick(() => autogrow()) })

const settingsRelatedError = computed(() => store.lastErrorKind === 'settings')

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
      <span>{{ t('composer.drop.overlay') }}</span>
    </div>

    <!-- 无接口 / 缺 Key:提示本身可点,文案不写死「左侧」(移动端侧栏在汉堡里) -->
    <button
      v-if="!store.activePreset"
      type="button"
      class="hint hint-btn"
      @click="emit('open-settings', { create: true })"
    >
      <AppIcon name="alert" :size="14" /> {{ t('composer.hint.noPreset') }}
    </button>
    <button
      v-else-if="missingKey"
      type="button"
      class="hint hint-btn"
      @click="emit('open-settings')"
    >
      <AppIcon name="alert" :size="14" /> {{ t('composer.hint.missingKey') }}
    </button>
    <div v-if="store.lastError" class="err-bar" role="alert">
      <AppIcon name="alert" :size="14" />
      <span class="err-text">{{ store.lastError }}</span>
      <button
        v-if="settingsRelatedError"
        type="button"
        class="err-action"
        @click="onErrorAction"
      >{{ t('composer.error.goSettings') }}</button>
      <button class="err-close" @click="dismissError" :aria-label="t('composer.error.close')">
        <AppIcon name="x" :size="12" />
      </button>
    </div>

    <div v-if="notice" class="ref-notice" :class="notice.tone" role="status" aria-live="polite">
      <AppIcon :name="notice.tone === 'info' ? 'layers' : 'alert'" :size="13" /> {{ notice.text }}
    </div>
    <div class="sr-only" role="status" aria-live="polite">{{ referenceOrderAnnouncement }}</div>

    <div class="brief-head">
      <span class="mono-label">{{ t('composer.brief') }}</span>
      <span class="brief-rule" aria-hidden="true" />
      <span class="brief-mode">{{ refAssets.length ? t('composer.mode.edit') : t('composer.mode.generate') }}</span>
      <span v-if="refAssets.length" class="brief-count tnum">{{ refAssets.length }}/{{ MAX_REFERENCES }}</span>
    </div>

    <!-- 主输入框:一张创作稿纸 -->
    <div class="composer" :class="{ disabled: !store.activePreset }">
      <!-- 参考图与 Prompt 同属一次创作,保持在同一个输入容器内。 -->
      <div class="ref-strip" :class="{ empty: !refAssets.length }" role="group" :aria-label="t('composer.ref.groupAria')">
        <div v-if="refAssets.length" class="ref-head">
          <span class="ref-title">{{ t('composer.ref.title') }}</span>
          <span class="ref-count tnum">{{ refAssets.length }}/{{ MAX_REFERENCES }}</span>
        </div>
        <div class="ref-items" role="list" :aria-label="t('composer.ref.listAria')">
          <div
            v-for="(a, i) in refAssets" :key="a.id"
            class="ref-thumb" :class="{ 'drag-over': dragOverRefId === a.id, dragging: dragRefId === a.id }"
            :ref="(el) => setRefItemRef(el, a.id)"
            role="listitem" tabindex="0"
            draggable="true"
            :aria-label="t('composer.ref.itemAria', { index: i + 1 })"
            :title="t('composer.ref.itemTitle')"
            @dragstart="onRefDragStart($event, a.id)"
            @dragover="onRefDragOver($event, a.id)"
            @drop="onRefDrop($event, a.id)"
            @dragend="onRefDragEnd"
            @keydown="onRefKeydown($event, a.id)"
          >
            <button
              type="button"
              class="ref-preview"
              tabindex="-1"
              @click="emit('preview', { asset: a, list: refAssets })"
              :aria-label="t('composer.ref.previewAria', { index: i + 1 })"
              :title="t('composer.ref.previewTitle')"
            >
              <AssetImage :asset="a" :alt="t('composer.ref.alt')" />
              <span class="ref-badge">{{ i + 1 }}</span>
            </button>
            <button type="button" class="ref-remove" @click="removeReference(a.id)" :aria-label="t('composer.ref.removeAria')" :title="t('composer.ref.removeTitle')">
              <AppIcon name="x" :size="11" />
            </button>
          </div>
          <button
            v-if="refAssets.length < MAX_REFERENCES"
            type="button"
            class="ref-add"
            :class="{ 'ref-add-empty': !refAssets.length }"
            @click="fileInput?.click()"
            :title="t('composer.ref.uploadTitle')"
            :aria-label="t('composer.ref.uploadAria')"
          >
            <AppIcon name="plus" :size="14" />
            <span v-if="!refAssets.length" class="ref-add-label">{{ t('composer.ref.add') }}</span>
          </button>
          <input ref="fileInput" type="file" accept="image/*" multiple class="hidden-input" @change="onFilePick" />
        </div>
        <span class="ref-tip">
          {{ refAssets.length >= MAX_REFERENCES
            ? t('composer.ref.tipFull', { count: MAX_REFERENCES })
            : (refAssets.length ? t('composer.ref.tipReorder') : t('composer.ref.tipEmpty')) }}
        </span>
      </div>

      <!-- Prompt 是主操作;参数默认收起,只保留一个摘要入口。 -->
      <div class="composer-input-wrap">
        <textarea
          ref="composerInput"
          v-model="prompt" rows="3" class="composer-input"
          :maxlength="MAX_PROMPT_LENGTH"
          :placeholder="promptPlaceholder"
          :aria-label="t('composer.prompt.inputAria')"
          @input="onPromptInput"
          @keydown.enter="onEnter"
        />
        <div id="composer-input-meta" class="composer-input-meta">
          <button
            v-if="prompt"
            type="button"
            class="clear-prompt"
            :aria-label="t('composer.prompt.clearAria')"
            :title="t('composer.prompt.clearTitle')"
            @click="clearPrompt"
          >
            <AppIcon name="x" :size="12" />
          </button>
          <span class="char-count" :class="promptLengthClass" aria-live="polite">{{ promptLength }}/{{ MAX_PROMPT_LENGTH }}</span>
        </div>
      </div>

      <div class="params-section">
        <button
          ref="paramsSummaryButton"
          class="settings-summary"
          :class="{ open: moreParamsOpen, dirty: moreParamsDirty }"
          type="button"
          @click="toggleAdvanced"
          :aria-expanded="moreParamsOpen"
          aria-controls="composer-params"
          :title="moreParamsOpen ? t('composer.params.collapse') : t('composer.params.expand')"
        >
          <AppIcon name="settings" :size="12" />
          <span>{{ t('composer.params.label') }} · {{ settingsSummary }}</span>
          <AppIcon :name="moreParamsOpen ? 'chevron-down' : 'chevron-right'" :size="11" />
        </button>

        <div v-if="moreParamsOpen" id="composer-params" class="params-panel" @click.stop>
          <div class="params-row">
            <span class="params-tag-label">{{ t('composer.params.ratio') }}</span>
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
            <span class="params-tag-label">{{ t('composer.params.preset') }}</span>
            <div class="tag-group">
              <button
                v-for="p in QUALITY_PRESETS" :key="p.key"
                class="tag preset-tag" :class="{ active: activePresetKey === p.key }"
                type="button" @click="selectPreset(p)"
              >
                <AppIcon v-if="activePresetKey === p.key" name="check" :size="10" />
                {{ labelForPreset(p.key) }}
              </button>
            </div>
          </div>

          <div class="params-row params-row-settings">
            <span class="params-tag-label">{{ t('composer.params.resolution') }}</span>
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
            <span class="params-tag-label params-tag-label-n">{{ t('composer.params.quality') }}</span>
            <div class="tag-group">
              <button
                v-for="q in QUALITIES" :key="q.key"
                class="tag accent-tag" :class="{ active: quality === q.key }"
                type="button" @click="quality = q.key"
              >
                <AppIcon v-if="quality === q.key" name="check" :size="10" />
                {{ labelForQuality(q.key) }}
              </button>
            </div>
            <span class="params-tag-label params-tag-label-n">{{ t('composer.params.count') }}</span>
            <div class="n-stepper" :title="t('composer.params.countTitle')">
              <button
                class="n-btn" type="button" :aria-label="t('composer.params.decrease')"
                @pointerdown.prevent="nHoldStart(-1)"
                @pointerup="nHoldStop" @pointerleave="nHoldStop" @pointercancel="nHoldStop"
              >
                <AppIcon name="minus" :size="12" />
              </button>
              <input
                class="n-input" type="number" min="1" max="4"
                v-model.number="n" @change="onNChange" :aria-label="t('composer.params.countAria')"
              />
              <button
                class="n-btn" type="button" :aria-label="t('composer.params.increase')"
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
        <!-- 当前接口与模型:跟随生成上下文,紧挨输入区切换 -->
        <div class="provider-picks">
          <div class="preset-pick-wrap">
            <button
              ref="presetButton"
              class="preset-pick" :class="{ open: presetMenuOpen }"
              @click="togglePresetMenu"
              @keydown="onPresetButtonKeydown"
              :aria-expanded="presetMenuOpen" aria-haspopup="listbox"
              :title="store.activePreset ? store.activePreset.name || t('composer.preset.unnamed') : ''"
            >
              <AppIcon name="settings" :size="12" />
              <span class="preset-pick-name">{{ store.activePreset?.name || t('composer.preset.unnamed') }}</span>
              <span
                v-if="store.activePreset && !store.activePreset.apiKey"
                class="badge badge-warn preset-key-badge"
                @click.stop="presetMenuOpen = false; emit('open-settings')"
                :title="t('composer.preset.keyTitle')"
              >{{ t('composer.preset.keyBadge') }}</span>
              <AppIcon name="chevron-down" :size="11" class="preset-pick-chev" />
            </button>
            <div v-if="presetMenuOpen" class="preset-pop" role="listbox" :aria-label="t('composer.preset.selectAria')" @keydown="onPresetMenuKeydown">
              <div class="preset-pop-head">{{ t('composer.preset.switch') }}</div>
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
                  <span class="preset-pop-name">{{ p.name || t('composer.preset.unnamed') }}</span>
                  <span class="preset-pop-meta">{{ presetMeta(p) }} · {{ p.baseURL || '' }}</span>
                </span>
                <span v-if="!p.apiKey" class="badge badge-warn preset-key-badge">{{ t('composer.preset.keyBadge') }}</span>
                <AppIcon v-if="p.id === store.activePresetId" name="check" :size="12" />
              </button>
              <div class="preset-pop-divider" />
              <button class="preset-pop-item" @click="presetMenuOpen = false; emit('open-settings')">
                <AppIcon name="settings" :size="13" /> {{ t('composer.preset.manage') }}
              </button>
            </div>
          </div>

          <div v-if="modelOptions.length > 1" ref="modelWrap" class="preset-pick-wrap model-pick-wrap">
            <button
              ref="modelButton"
              class="preset-pick model-pick" :class="{ open: modelMenuOpen }"
              @click="toggleModelMenu"
              @keydown="onModelButtonKeydown"
              :aria-expanded="modelMenuOpen" aria-haspopup="listbox"
              :title="currentModel"
            >
              <span class="preset-pick-name">{{ currentModel }}</span>
              <AppIcon name="chevron-down" :size="11" class="preset-pick-chev" />
            </button>
            <div
              v-if="modelMenuOpen"
              class="preset-pop model-pop"
              role="listbox"
              :aria-label="t('composer.model.selectAria')"
              @keydown="onModelMenuKeydown"
            >
              <div class="preset-pop-head">{{ t('composer.model.switch') }}</div>
              <button
                v-for="m in modelOptions" :key="m"
                :data-model="m"
                class="preset-pop-item model-pop-item" :class="{ active: m === currentModel }"
                role="option" :aria-selected="m === currentModel"
                @click="selectModelUi(m)"
              >
                <span class="preset-pop-name model-pop-name">{{ m }}</span>
                <AppIcon v-if="m === currentModel" name="check" :size="12" />
              </button>
            </div>
          </div>
        </div>

        <div class="spacer" />

        <div class="prompt-lib-wrap">
          <button
            ref="promptLibButton"
            class="chip star-btn" :class="{ active: showPromptLib, highlight: prompt.trim() && !showPromptLib }"
            @click.stop="togglePromptLib"
            :title="prompt.trim() ? t('composer.promptLib.starTitleWithText') : t('composer.promptLib.starTitle')"
            :aria-label="t('composer.promptLib.aria')"
          >
            <AppIcon name="heart" :size="13" />
          </button>

          <div v-if="showPromptLib" class="prompt-pop" @click.stop>
            <div v-if="promptLibToast" class="prompt-toast" :class="promptLibToast.type">{{ promptLibToast.text }}</div>
            <div class="prompt-pop-head">
              <span class="prompt-pop-title">{{ t('composer.promptLib.title') }}</span>
              <button class="pop-save" :disabled="!prompt.trim()" @click="saveCurrentPrompt" :title="t('composer.promptLib.saveTitle')">
                <AppIcon name="plus" :size="13" /> {{ t('composer.promptLib.save') }}
              </button>
            </div>
            <div v-if="!savedPrompts.length" class="prompt-empty">{{ t('composer.promptLib.empty') }}</div>
            <template v-else>
              <div class="prompt-search">
                <AppIcon name="search" :size="12" />
                <input
                  v-model="promptQuery" class="prompt-search-input"
                  :placeholder="t('composer.promptLib.searchPlaceholder')" :aria-label="t('composer.promptLib.searchAria')"
                />
                <button v-if="promptQuery" class="prompt-search-clear" @click="promptQuery = ''" :aria-label="t('composer.promptLib.searchClear')">
                  <AppIcon name="x" :size="11" />
                </button>
              </div>
              <div v-if="!visiblePrompts.length" class="prompt-empty">{{ t('composer.promptLib.noMatch') }}</div>
              <div v-else class="prompt-list">
                <div
                  v-for="p in visiblePrompts" :key="p.id"
                  class="prompt-item" @click="editingPromptId === p.id ? null : fillPrompt(p.text)"
                >
                  <input
                    v-if="editingPromptId === p.id"
                    v-model="editingPromptText" class="prompt-edit-input" v-focus
                    @click.stop
                    @keydown="onPromptEditKeydown($event, p)"
                    @blur="savePromptEdit(p)"
                  />
                  <span v-else class="prompt-text">{{ p.text }}</span>
                  <button class="prompt-edit" @click.stop="startEditPrompt(p)" :title="t('composer.promptLib.editTitle')" :aria-label="t('composer.promptLib.editAria')">
                    <AppIcon name="edit" :size="11" />
                  </button>
                  <button class="prompt-del" @click.stop="deletePrompt(p.id)" :title="t('common.delete')" :aria-label="t('composer.promptLib.deleteAria')">
                    <AppIcon name="x" :size="11" />
                  </button>
                </div>
              </div>
            </template>
          </div>
        </div>

        <button
          v-if="store.generating"
          class="btn btn-ghost send cancel"
          @click="store.cancelActiveGeneration()"
          :aria-label="t('composer.generate.cancelAria')"
        >
          <AppIcon name="x" :size="16" />
          {{ t('common.cancel') }}
        </button>
        <button
          v-else
           class="btn btn-primary send"
           :disabled="!canGenerate"
           @click="submit" :aria-label="t('composer.generate.aria')"
           aria-describedby="generate-disabled-reason"
           :title="generateDisabledReason || t('composer.generate.title')"
        >
          <AppIcon name="sparkles" :size="15" />
          {{ t('composer.generate.short') }}
          <span class="send-arrow" aria-hidden="true">↗</span>
        </button>
       </div>
       <p
         id="generate-disabled-reason"
         class="generate-disabled-reason"
         :class="{ visible: !!generateDisabledReason }"
         role="status"
         aria-live="polite"
       >{{ generateDisabledReason }}</p>
     </div>
    <p class="composer-foot">{{ composerFootHint }}</p>
  </div>
</template>

<style scoped>
.composer-wrap {
  width: 100%; max-width: 900px; margin: 0 auto; position: relative;
}
.drop-overlay {
  position: absolute; inset: 0; z-index: 30;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; border-radius: var(--radius);
  background: var(--color-elevated);
  border: 2px dashed var(--color-primary);
  color: var(--color-primary);
  font-family: var(--font-mono); font-size: 15px; letter-spacing: 0.06em;
  pointer-events: none;
}
.hint {
  display: flex; align-items: center; gap: 8px;
  font-family: var(--font-mono); font-size: 14px; letter-spacing: 0.02em;
  color: var(--color-warning); margin-bottom: var(--space-2);
  padding: 7px 10px; border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-warning) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-warning) 30%, transparent);
}
.hint-btn {
  width: 100%; text-align: left; cursor: pointer;
  transition: background var(--dur) var(--ease);
}
.hint-btn:hover { background: color-mix(in srgb, var(--color-warning) 14%, transparent); }
.err-bar {
  display: flex; align-items: center; gap: 8px;
  font-size: 15px;
  color: var(--color-destructive); margin-bottom: var(--space-2);
  padding: 7px 10px; border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-destructive) 7%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-destructive) 30%, transparent);
}
.err-text { flex: 1; min-width: 0; line-height: 1.4; }
.err-action {
  flex-shrink: 0; font-family: var(--font-mono); font-size: 14px;
  color: var(--color-destructive); padding: 2px 7px; border-radius: var(--radius-sm);
  border: 1px solid color-mix(in srgb, var(--color-destructive) 35%, transparent);
}
.err-action:hover { background: color-mix(in srgb, var(--color-destructive) 12%, transparent); }
.err-close {
  flex-shrink: 0; width: 20px; height: 20px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: var(--radius-sm); color: var(--color-destructive);
}
.err-close:hover { background: color-mix(in srgb, var(--color-destructive) 10%, transparent); }
.ref-notice {
  display: flex; align-items: center; gap: 7px;
  margin-bottom: var(--space-2); padding: 7px 10px; border-radius: var(--radius-sm);
  font-family: var(--font-mono); font-size: 14px; letter-spacing: 0.02em;
  color: var(--color-warning);
  background: color-mix(in srgb, var(--color-warning) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-warning) 30%, transparent);
}
.ref-notice.info {
  color: var(--color-primary);
  background: var(--color-primary-soft);
  border-color: color-mix(in srgb, var(--color-primary) 30%, transparent);
}

/* ── 稿纸抬头 ── */
.brief-head {
  display: flex; align-items: center; gap: 9px;
  padding: 0 2px 7px;
}
.brief-rule { flex: 1; height: 1px; background: var(--color-border); }
.brief-mode {
  font-family: var(--font-mono); font-size: 13px; letter-spacing: 0.04em;
  color: var(--color-fg-muted);
}
.brief-count {
  font-family: var(--font-mono); font-size: 13px; color: var(--color-primary);
}

/* ── 稿纸 ── */
.composer {
  background: var(--color-elevated);
  border: 1px solid var(--color-border-strong);
  border-top: 2px solid var(--color-fg);
  border-radius: var(--radius);
  padding: 12px 14px 10px;
  transition: border-color var(--dur) var(--ease);
}
.composer:focus-within {
  border-color: var(--color-primary);
  border-top-color: var(--color-primary);
}
.composer.disabled { opacity: 0.7; }

/* 参考图 */
.ref-strip {
  display: flex; align-items: center; gap: 10px;
  margin: 0 0 4px; padding: 0 0 10px;
  flex-wrap: wrap;
  border-bottom: 1px dashed var(--color-border);
}
.ref-strip.empty { min-height: 0; }
.ref-head { display: inline-flex; align-items: center; gap: 7px; flex-shrink: 0; }
.ref-title {
  font-family: var(--font-mono); font-size: 13px; font-weight: 600;
  letter-spacing: 0.08em; color: var(--color-fg-muted);
}
.ref-count {
  padding: 1px 5px; border-radius: var(--radius-sm);
  font-family: var(--font-mono); font-size: 13px; color: var(--color-fg-subtle);
  border: 1px solid var(--color-border);
}
.ref-items { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
.ref-thumb {
  position: relative; flex: 0 0 64px; width: 64px; height: 64px;
  border-radius: var(--radius-sm);
  overflow: hidden; border: 1px solid var(--color-border-strong); cursor: grab;
  transition: opacity var(--dur) var(--ease), border-color var(--dur) var(--ease);
}
.ref-thumb:focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; }
.ref-thumb:active { cursor: grabbing; }
.ref-thumb.dragging { opacity: 0.4; }
.ref-thumb.drag-over { border-color: var(--color-primary); box-shadow: inset 0 0 0 1px var(--color-primary); }
.ref-preview {
  position: relative; display: block; width: 100%; height: 100%; padding: 0;
  overflow: hidden; cursor: zoom-in; background: var(--color-surface-2);
}
.ref-preview :deep(.asset-img) { object-fit: contain; }
.ref-badge {
  position: absolute; top: 3px; left: 3px;
  min-height: 0; font-family: var(--font-mono); font-size: 13px; font-weight: 600;
  line-height: 1; padding: 3px 4px; border: 0; border-radius: 1px;
  color: #fff; background: rgba(15, 14, 10, 0.64);
  text-align: center; pointer-events: none;
}
.ref-remove {
  position: absolute; top: 3px; right: 3px; width: 18px; height: 18px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(15, 14, 10, 0.6); color: #fff; border-radius: var(--radius-sm);
  opacity: 0.55;
  transition: opacity var(--dur) var(--ease), background var(--dur) var(--ease);
}
.ref-thumb:hover .ref-remove { opacity: 1; background: rgba(15, 14, 10, 0.82); }
@media (hover: none) { .ref-remove { opacity: 0.9; } }
.ref-add {
  flex: 0 0 40px; width: 40px; height: 40px;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-sm); border: 1px dashed var(--color-border-strong);
  color: var(--color-fg-muted); flex-shrink: 0;
  transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.ref-add-empty {
  flex: 0 0 auto; width: auto; min-width: 42px; height: 34px; gap: 6px; padding: 0 10px;
  border-style: solid; border-color: var(--color-border);
  background: transparent; color: var(--color-fg-muted);
}
.ref-add-label { font-size: 15px; white-space: nowrap; }
.ref-add:hover {
  border-color: var(--color-primary); color: var(--color-primary);
  background: var(--color-primary-soft);
}
.hidden-input { display: none; }
.ref-tip {
  flex: 1; min-width: 140px;
  font-family: var(--font-mono); font-size: 13px; line-height: 1.5;
  color: var(--color-fg-subtle);
}

/* Prompt */
.composer-input-wrap { position: relative; }
.composer-input {
  min-height: 80px; height: 80px; box-sizing: border-box;
  border: none; background: transparent; padding: 10px 2px 28px;
  font-family: var(--font-sans);
  font-size: 17.5px; letter-spacing: -0.01em;
  max-height: 200px; overflow-y: auto; line-height: 1.6;
  border-radius: 0;
}
.composer-input:focus { outline: none; border: none; }
.composer-input-meta {
  position: absolute; right: 2px; bottom: 4px;
  display: flex; align-items: center; gap: 6px;
  color: var(--color-fg-subtle); font-size: 14px; line-height: 1;
  pointer-events: none;
}
.char-count { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.char-count.near-limit { color: var(--color-warning); }
.char-count.at-limit { color: var(--color-destructive); font-weight: 600; }
.clear-prompt {
  width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--color-border); border-radius: var(--radius-sm);
  color: var(--color-fg-muted); background: transparent;
  pointer-events: auto;
  transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.clear-prompt:hover { color: var(--color-fg); border-color: var(--color-border-strong); background: var(--color-surface-2); }

/* 参数 */
.params-section {
  display: flex; flex-direction: column; gap: 8px;
  margin-top: 2px; padding: 0 2px;
}
.settings-summary {
  display: inline-flex; align-items: center; gap: 6px;
  align-self: flex-start; max-width: min(100%, 460px);
  min-height: 26px; padding: 3px 0;
  font-family: var(--font-mono); font-size: 13.5px; letter-spacing: 0.03em;
  color: var(--color-fg-muted);
  background: transparent; border: none;
  transition: color var(--dur) var(--ease);
}
.settings-summary span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.settings-summary:hover { color: var(--color-fg); }
.settings-summary.open, .settings-summary.dirty { color: var(--color-primary); }
.params-panel {
  display: flex; flex-direction: column; gap: 10px;
  padding: 12px; border: 1px solid var(--color-border-strong);
  border-radius: var(--radius); background: var(--color-surface);
  animation: params-in 140ms var(--ease-out);
}
@keyframes params-in {
  from { opacity: 0; transform: translateY(-3px); }
  to { opacity: 1; transform: none; }
}
.params-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.params-tag-label {
  font-family: var(--font-mono); font-size: 13px; font-weight: 600;
  letter-spacing: 0.08em; color: var(--color-fg-subtle);
  flex-shrink: 0; min-width: 34px;
}
.params-tag-label-n { margin-left: 6px; min-width: 0; }
.ratio-grid {
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px;
  flex: 1; min-width: 220px;
}
.tag-group { display: flex; gap: 4px; flex-wrap: wrap; }
.tag {
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  min-height: 27px; padding: 0 9px;
  font-family: var(--font-mono); font-size: 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border); color: var(--color-fg-muted);
  background: transparent;
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease),
    border-color var(--dur) var(--ease);
}
.tag:hover { color: var(--color-fg); border-color: var(--color-border-strong); background: var(--color-surface-2); }
.tag.active {
  color: var(--color-on-ink); background: var(--color-ink); border-color: var(--color-ink);
}
:root[data-theme='dark'] .tag.active { color: var(--color-on-ink); }
.tag.accent-tag.active {
  color: var(--color-on-primary); background: var(--color-primary); border-color: var(--color-primary);
}
.ratio-auto { border-style: dashed; }
.preset-tag { font-weight: 600; }
.n-stepper { display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0; }
.n-btn {
  width: 26px; height: 26px; border-radius: var(--radius-sm);
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--color-fg-muted);
  border: 1px solid var(--color-border);
  transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.n-btn:hover { color: var(--color-fg); border-color: var(--color-border-strong); background: var(--color-surface-2); }
.n-input {
  width: 42px; min-height: 26px; border-radius: var(--radius-sm); text-align: center;
  font-family: var(--font-mono); font-size: 15px; color: var(--color-fg);
  background: transparent; border: 1px solid var(--color-border);
  padding: 0;
}
.n-input:focus { border-color: var(--color-primary); }
.n-input::-webkit-outer-spin-button,
.n-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.n-input { -moz-appearance: textfield; }

/* 底栏 */
.composer-bar {
  display: flex; align-items: center; gap: var(--space-2);
  margin-top: 6px; padding-top: 10px;
  border-top: 1px solid var(--color-border);
  position: relative; flex-wrap: wrap;
}
.provider-picks { display: flex; align-items: center; gap: 6px; min-width: 0; }
.provider-picks .preset-pick-wrap { min-width: 0; }
.preset-pick-wrap { position: relative; min-width: 0; }
.preset-pick {
  display: inline-flex; align-items: center; gap: 6px;
  max-width: 220px; min-height: 30px; padding: 0 8px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono); font-size: 13.5px; letter-spacing: 0.02em;
  color: var(--color-fg-muted);
  border: 1px solid var(--color-border);
  transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.preset-pick::before {
  content: ''; width: 5px; height: 5px; flex-shrink: 0;
  background: var(--color-success);
}
.preset-pick:hover, .preset-pick.open {
  color: var(--color-fg); border-color: var(--color-border-strong);
  background: var(--color-surface-2);
}
.preset-pick-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.model-pick { max-width: 190px; }
.model-pick::before { display: none; }
.preset-key-badge { flex-shrink: 0; padding: 1px 5px; font-size: 13px; }
.preset-pick-chev { flex-shrink: 0; color: var(--color-fg-subtle); transition: transform var(--dur) var(--ease); }
.preset-pick.open .preset-pick-chev { transform: rotate(180deg); }
.preset-pop {
  position: absolute; bottom: calc(100% + 8px); left: 0; z-index: 35;
  width: min(310px, 82vw); max-height: 300px; overflow-y: auto;
  padding: 3px;
  background: var(--color-elevated);
  border: 1px solid var(--color-ink);
  border-radius: var(--radius);
  box-shadow: var(--shadow-pop);
  display: flex; flex-direction: column; gap: 1px;
}
.preset-pop-head {
  padding: 7px 8px 4px;
  font-family: var(--font-mono); font-size: 13px; letter-spacing: 0.1em;
  color: var(--color-fg-subtle);
}
.preset-pop-item {
  display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
  padding: 7px 8px; border-radius: var(--radius-sm);
  font-size: 15.5px; color: var(--color-fg-muted);
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
}
.preset-pop-item:hover { background: var(--color-surface-2); color: var(--color-fg); }
.preset-pop-item.active { color: var(--color-primary); background: var(--color-primary-soft); }
.preset-pop-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.preset-pop-name {
  color: inherit; font-weight: 600;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.preset-pop-meta {
  font-family: var(--font-mono); font-size: 13px; opacity: 0.72;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.preset-pop-divider { height: 1px; background: var(--color-border); margin: 4px 6px; }
.model-pop { width: min(280px, 82vw); }
.model-pop-name { font-family: var(--font-mono); font-size: 14.5px; font-weight: 600; }
.spacer { flex: 1; }

/* 收藏 prompt */
.prompt-lib-wrap { position: relative; }
.star-btn {
  width: 30px; height: 30px; padding: 0; justify-content: center;
  border: 1px solid var(--color-border); border-radius: var(--radius-sm);
  color: var(--color-fg-subtle);
}
.star-btn:hover { color: var(--color-heart); border-color: color-mix(in srgb, var(--color-heart) 40%, transparent); }
.star-btn.active {
  background: color-mix(in srgb, var(--color-heart) 9%, transparent);
  color: var(--color-heart); border-color: color-mix(in srgb, var(--color-heart) 40%, transparent);
}
.star-btn.highlight { color: var(--color-heart); border-color: color-mix(in srgb, var(--color-heart) 40%, transparent); }

.prompt-pop {
  position: absolute; bottom: 40px; right: 0; z-index: 30;
  width: min(340px, calc(100vw - 32px)); max-height: 300px;
  display: flex; flex-direction: column;
  background: var(--color-elevated);
  border: 1px solid var(--color-ink);
  border-radius: var(--radius);
  box-shadow: var(--shadow-pop);
  overflow: hidden;
}
.prompt-pop-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 9px 10px; border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.prompt-pop-title {
  font-family: var(--font-mono); font-size: 13px; letter-spacing: 0.1em;
  color: var(--color-fg-subtle);
}
.pop-save {
  display: inline-flex; align-items: center; gap: 3px;
  font-family: var(--font-mono); font-size: 13.5px;
  color: var(--color-primary); padding: 3px 7px; border-radius: var(--radius-sm);
  border: 1px solid color-mix(in srgb, var(--color-primary) 32%, transparent);
}
.pop-save:hover:not(:disabled) { background: var(--color-primary-soft); }
.pop-save:disabled { opacity: 0.4; }
.prompt-toast {
  padding: 6px 10px; font-family: var(--font-mono); font-size: 13.5px; flex-shrink: 0;
}
.prompt-toast.success { background: var(--color-primary-soft); color: var(--color-primary); }
.prompt-toast.warn { background: color-mix(in srgb, var(--color-warning) 10%, transparent); color: var(--color-warning); }
.prompt-empty {
  padding: var(--space-6) var(--space-3); text-align: center;
  font-family: var(--font-mono); font-size: 14px; color: var(--color-fg-subtle);
}
.prompt-list { overflow-y: auto; flex: 1; }
.prompt-item {
  display: flex; align-items: center; gap: var(--space-2);
  padding: 9px 10px; cursor: pointer;
  border-bottom: 1px solid var(--color-border); font-size: 16px;
  transition: background var(--dur) var(--ease);
}
.prompt-item:hover { background: var(--color-surface-2); }
.prompt-item:last-child { border-bottom: none; }
.prompt-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-fg); }
.prompt-search {
  display: flex; align-items: center; gap: 6px; flex-shrink: 0;
  padding: 7px 10px; border-bottom: 1px solid var(--color-border);
  color: var(--color-fg-subtle);
}
.prompt-search-input {
  flex: 1; min-width: 0; padding: 0; border: none; background: transparent;
  font-size: 15px; color: var(--color-fg); border-radius: 0;
}
.prompt-search-input:focus { outline: none; border: none; }
.prompt-search-clear { flex-shrink: 0; display: flex; color: var(--color-fg-subtle); }
.prompt-edit-input {
  flex: 1; min-width: 0; padding: 3px 5px; font-size: 15px;
  border-radius: var(--radius-sm); background: var(--color-surface);
}
.prompt-edit, .prompt-del {
  flex-shrink: 0; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-sm); color: var(--color-fg-subtle);
}
.prompt-edit:hover { background: var(--color-surface-2); color: var(--color-fg); }
.prompt-del:hover { background: var(--color-surface-2); color: var(--color-destructive); }

/* 生成 */
.send {
  min-height: 38px; padding: 0 14px;
  border-radius: var(--radius-sm);
  background: var(--color-ink); color: var(--color-on-ink);
  border: 1px solid var(--color-ink);
  font-size: 15.5px; font-weight: 650; letter-spacing: 0.02em;
}
.send:hover:not(:disabled) { background: var(--color-primary); border-color: var(--color-primary); color: var(--color-on-primary); }
.send:disabled { opacity: 0.35; }
.send-arrow { font-family: var(--font-mono); font-size: 15px; opacity: 0.6; margin-left: 2px; }
.send.cancel {
  background: transparent; color: var(--color-fg-muted);
  border: 1px solid var(--color-border-strong);
}
.send.cancel:hover {
  color: var(--color-destructive); border-color: color-mix(in srgb, var(--color-destructive) 45%, transparent);
  background: color-mix(in srgb, var(--color-destructive) 8%, transparent);
}
.generate-disabled-reason {
  min-height: 16px; margin: 5px 2px 0;
  font-family: var(--font-mono); font-size: 13px; line-height: 1.4;
  color: var(--color-fg-subtle); visibility: hidden; opacity: 0;
  transition: opacity var(--dur) var(--ease);
}
.generate-disabled-reason.visible { visibility: visible; opacity: 1; color: var(--color-warning); }
.composer-foot {
  text-align: center; margin: 8px 0 0;
  font-family: var(--font-mono); font-size: 13px; letter-spacing: 0.04em;
  color: var(--color-fg-subtle);
}
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 640px) {
  .ref-strip {
    display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center;
    gap: 8px; padding-bottom: 8px;
  }
  .ref-head { grid-column: 1; }
  .ref-items {
    grid-column: 2; width: 100%; min-width: 0; flex-wrap: nowrap; overflow-x: auto;
    padding: 2px 1px 4px; touch-action: pan-x; scroll-snap-type: x proximity;
    overscroll-behavior-x: contain;
  }
  .ref-strip.empty .ref-items { grid-column: 1 / -1; }
  .ref-thumb, .ref-add {
    flex: 0 0 64px; width: 64px; height: 64px; scroll-snap-align: start;
  }
  .ref-strip.empty .ref-add-empty { flex-basis: auto; width: auto; height: 30px; }
  .ref-strip.empty { gap: 6px; margin-bottom: 2px; padding-bottom: 6px; }
  .ref-strip.empty .ref-tip { display: none; }
  .ref-tip { grid-column: 1 / -1; width: 100%; min-width: 0; }
  .brief-head { padding-bottom: 4px; }
  .composer { padding: 8px 10px 6px; }
  .params-section { gap: 5px; margin-top: 0; }
  .composer-input { font-size: 19px; }
  .composer-bar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 6px; align-items: center;
  }
  .composer-bar .spacer { display: none; }
  .provider-picks { flex-wrap: wrap; width: 100%; min-width: 0; }
  .provider-picks .preset-pick-wrap { flex: 1 1 100%; }
  .preset-pick { width: 100%; max-width: none; }
  .preset-pick-name { max-width: none; }
  .star-btn { width: 34px; height: 34px; }
  .send { min-height: 36px; padding: 0 11px; }
  .send-arrow { display: none; }
  .ratio-grid { min-width: 0; flex-basis: 100%; }
}
</style>
