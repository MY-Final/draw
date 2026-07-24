<script setup>
// 底部固定输入区(composer,对话式布局)。prompt + 内联参数 + 参考图 chips + 生成。
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useWorkbenchStore } from '../stores/workbench.js'
import AppIcon from './AppIcon.vue'
import AssetImage from './AssetImage.vue'
import { addPrompt, removePrompt, getAllPrompts } from '../lib/promptLibrary.js'
import { imageFromClipboard } from '../lib/clipboard.js'

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

function computeSize(r, res) {
  if (r === 'auto') return null
  const base = RES_MAP[res]
  const [w, h] = r.split(':').map(Number)
  if (w === h) return `${base}x${base}`
  if (w > h) return `${base}x${Math.round(base * h / w)}`
  return `${Math.round(base * w / h)}x${base}`
}

const store = useWorkbenchStore()
const emit = defineEmits(['open-settings'])

const prompt = ref('')
const ratio = ref('auto')
const resolution = ref('1k')
const quality = ref('high')
const n = ref(1)
const refImageIds = ref([])
const showPromptLib = ref(false)
const savedPrompts = ref([])
const promptLibToast = ref(null)
// 次要参数(画质/数量)默认收起,给输入区更多呼吸感;非默认值时自动展开提示。
const moreParamsOpen = ref(false)
const moreParamsDirty = computed(() => quality.value !== 'high' || Number(n.value) !== 1)
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
}

function deletePrompt(id) {
  removePrompt(id, store.activeWorkspaceId)
  loadSavedPrompts()
}

// 点击外部关闭 popover
function onDocClick(e) {
  if (!showPromptLib.value) return
  const el = e.target
  if (!el.closest('.prompt-lib-wrap')) showPromptLib.value = false
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  // 粘贴监听挂 document:无论焦点是否在输入框,Ctrl/Cmd+V 都能贴图(单一监听,避免重复触发)
  document.addEventListener('paste', onPaste)
})
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('paste', onPaste)
})

// 参考图走 images/edits 改图;多张时只用第一张。
const refAssets = computed(() =>
  refImageIds.value.map((id) => store.assets.find((a) => a.id === id)).filter(Boolean)
)
const multiRefOnImages = computed(() => refImageIds.value.length > 1)

function addReference(id) {
  if (!refImageIds.value.includes(id)) refImageIds.value = [...refImageIds.value, id]
}
function removeReference(id) {
  refImageIds.value = refImageIds.value.filter((x) => x !== id)
}

// ── 参考图上传(design D3)──
const fileInput = ref(null)
const dropActive = ref(false)
async function uploadRefImage(file) {
  if (!file || !file.type.startsWith('image/')) return
  // 走 store:落库并刷新响应式 assets,否则 refAssets 找不到新图、缩略图不显示。
  const asset = await store.addReferenceAsset(file)
  addReference(asset.id)
  if (fileInput.value) fileInput.value.value = ''
}
function onFilePick(e) {
  const file = e.target?.files?.[0]
  if (file) uploadRefImage(file)
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

// ── DnD 从素材库拖放(design D4)──
function onDragOver(e) {
  e.preventDefault()
  dropActive.value = true
}
function onDragLeave() {
  dropActive.value = false
}
function onDrop(e) {
  e.preventDefault()
  dropActive.value = false
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
    // 多文件时逐张入库;改图协议实际只用第一张,但允许用户先摆好再删
    files.forEach((f) => uploadRefImage(f))
  }
}
function applyPrefill(prefill) {
  if (!prefill) return
  prompt.value = prefill.prompt || ''
  // 非默认画质/数量时展开次要参数,避免用户看不到被还原的值。
  if (prefill.params?.quality && prefill.params.quality !== 'high') moreParamsOpen.value = true
  if (prefill.params?.n && Number(prefill.params.n) !== 1) moreParamsOpen.value = true
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
  if (prefill.params?.n) n.value = prefill.params.n
  if (prefill.params?.quality) quality.value = prefill.params.quality
  refImageIds.value = Array.isArray(prefill.refImageIds) ? [...prefill.refImageIds] : []
}
function gcd(a, b) { return b ? gcd(b, a % b) : a }
function clear() {
  prompt.value = ''
  refImageIds.value = []
}
defineExpose({ addReference, applyPrefill, clear, fillPrompt })

async function submit() {
  if (!canGenerate.value) {
    if (missingKey.value) {
      store.lastError = '当前接口缺少 API Key,请先在接口设置中填写。'
    }
    return
  }
  const text = prompt.value.trim()
  const refs = [...refImageIds.value]
  const sizeVal = computeSize(ratio.value, resolution.value)
  // 立即清空输入:乐观上屏已把本轮请求推上对话流,输入框无需等生成完成(请求即时上屏)。
  clear()
  // 发送给接口的 prompt 就是用户原文;画质走真实 quality 参数,不再往 prompt 拼形容词。
  await store.generate({ prompt: text, fullPrompt: text, refImageIds: refs, params: { size: sizeVal, ratio: ratio.value, resolution: resolution.value, quality: quality.value, n: Number(n.value) } })
}

// Enter 提交,但要避开中文输入法候选确认(isComposing 期间的 Enter 不算提交)。
function onEnter(e) {
  if (e.isComposing || e.keyCode === 229) return
  e.preventDefault()
  submit()
}

function autogrow(e) {
  const el = e.target
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 200) + 'px'
}

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
  <div class="composer-wrap">
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

    <!-- 参考图 chips 与上传 + DnD 目标(上传按钮始终可见) -->
    <div
      class="ref-strip" :class="{ 'drop-active': dropActive }"
      @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop"
    >
      <div
        v-for="(a, i) in refAssets" :key="a.id"
        class="ref-thumb" :class="{ secondary: i > 0 }"
        :title="i > 0 ? '不会发送:改图协议仅用第一张' : '将作为参考图发送'"
      >
        <AssetImage :asset="a" alt="参考图" />
        <span v-if="i === 0 && multiRefOnImages" class="ref-badge">用</span>
        <span v-else-if="i > 0" class="ref-badge ref-badge-off">未用</span>
        <button class="ref-remove" @click="removeReference(a.id)" aria-label="移除参考图">
          <AppIcon name="x" :size="11" />
        </button>
      </div>
      <button class="ref-add" @click="fileInput?.click()" title="上传参考图" aria-label="上传参考图">
        <AppIcon name="plus" :size="14" />
      </button>
      <input ref="fileInput" type="file" accept="image/*" class="hidden-input" @change="onFilePick" />
      <span class="ref-tip">{{ refAssets.length ? (multiRefOnImages ? '仅第一张会发送,其余未用' : '参考图') : '上传、粘贴或拖入参考图' }}</span>
    </div>

    <!-- 主输入框 -->
    <div class="composer" :class="{ disabled: !store.activePreset }">
      <!-- 生成参数:比例/分辨率常驻;画质/数量默认折叠(design D2/D3 + 呼吸感) -->
      <div class="params-tags">
        <div class="params-row">
          <span class="params-tag-label">比例</span>
          <div class="tag-group">
            <button
              v-for="r in RATIOS" :key="r.key"
              class="tag" :class="{ active: ratio === r.key }"
              @click="ratio = r.key"
            >{{ r.label }}</button>
          </div>
        </div>
        <div class="params-row">
          <span class="params-tag-label">分辨率</span>
          <div class="tag-group">
            <button
              v-for="r in RESOLUTIONS" :key="r.key"
              class="tag" :class="{ active: resolution === r.key }"
              @click="resolution = r.key"
            >{{ r.label }}</button>
          </div>
          <button
            class="more-params-btn"
            :class="{ open: moreParamsOpen, dirty: moreParamsDirty }"
            :aria-expanded="moreParamsOpen"
            @click="moreParamsOpen = !moreParamsOpen"
            :title="moreParamsOpen ? '收起更多参数' : '画质与数量'"
          >
            <span class="more-params-label">更多</span>
            <span v-if="moreParamsDirty && !moreParamsOpen" class="more-params-summary tnum">
              {{ quality === 'high' ? '高' : quality === 'medium' ? '中' : '低' }} · {{ n }}
            </span>
            <AppIcon :name="moreParamsOpen ? 'chevron-down' : 'chevron-right'" :size="12" />
          </button>
        </div>
        <div v-if="moreParamsOpen" class="params-row params-row-more">
          <span class="params-tag-label">画质</span>
          <div class="tag-group">
            <button
              v-for="q in QUALITIES" :key="q.key"
              class="tag" :class="{ active: quality === q.key }"
              @click="quality = q.key"
            >{{ q.label }}</button>
          </div>
          <span class="params-tag-label params-tag-label-n">数量</span>
          <input class="tnum" type="number" min="1" max="4" v-model="n" />
        </div>
      </div>

      <textarea
        v-model="prompt" rows="1" class="composer-input"
        placeholder="描述你想画的,或把图设为参考改图…"
        @input="autogrow"
        @keydown.enter.exact="onEnter"
        @keydown.shift.enter.stop
      />

      <div class="composer-bar">
        <span class="proto-tip">{{ refAssets.length ? '改图 · 带参考图' : '文生图' }}</span>

        <div class="spacer" />

        <div class="prompt-lib-wrap">
          <button
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
    <p class="composer-foot">Enter 生成 · Shift+Enter 换行</p>
  </div>
</template>

<style scoped>
.composer-wrap { width: 100%; max-width: 780px; margin: 0 auto; }
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

.ref-strip {
  display: flex; align-items: center; gap: var(--space-2);
  margin-bottom: var(--space-2); flex-wrap: wrap;
  transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.ref-strip.drop-active {
  border: 1.5px dashed var(--color-primary);
  border-radius: var(--radius);
  padding: var(--space-2);
  margin-left: calc(-1 * var(--space-2));
  margin-right: calc(-1 * var(--space-2));
  position: relative; z-index: 1;
  background: var(--color-primary-soft);
}
.ref-thumb {
  position: relative; width: 48px; height: 48px; border-radius: 12px;
  overflow: hidden; border: 1px solid var(--color-border-strong);
  box-shadow: var(--shadow-1);
}
.ref-thumb.secondary { opacity: 0.55; }
.ref-thumb.secondary:hover { opacity: 0.85; }
.ref-badge {
  position: absolute; left: 3px; bottom: 3px;
  font-size: 9px; font-weight: 700; line-height: 1;
  padding: 2px 4px; border-radius: 4px;
  color: #fff; background: rgba(0,0,0,0.62); backdrop-filter: blur(4px);
}
.ref-badge-off {
  background: rgba(0,0,0,0.72);
  color: color-mix(in srgb, #fff 78%, var(--color-warning));
}
.ref-remove {
  position: absolute; top: 2px; right: 2px; width: 18px; height: 18px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.62); color: #fff; border-radius: 999px;
  backdrop-filter: blur(4px);
}
.ref-add {
  width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;
  border-radius: 12px; border: 1px dashed var(--color-border-strong);
  color: var(--color-fg-muted);
  transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.ref-add:hover {
  border-color: var(--color-primary); color: var(--color-primary);
  background: var(--color-primary-soft);
}
.hidden-input { display: none; }
.ref-tip { font-size: 11px; color: var(--color-fg-subtle); }

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
  border: none; background: transparent; padding: 6px 8px;
  font-size: 15px; max-height: 200px; overflow-y: auto; line-height: 1.5;
}
.composer-input:focus { outline: none; }

.composer-bar { display: flex; align-items: center; gap: var(--space-2); margin-top: 4px; position: relative; }
.chip {
  display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--color-fg-muted);
  padding: 6px 10px; border-radius: 999px; border: 1px solid var(--color-border);
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease), border-color var(--dur) var(--ease);
}
.chip:hover { background: var(--color-surface-2); color: var(--color-fg); }

/* 生成参数 */
.params-tags {
  display: flex; flex-direction: column; gap: 8px;
  margin-bottom: 8px; padding: 2px 2px 10px;
  border-bottom: 1px solid var(--color-border);
}
.params-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.params-tag-label {
  font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--color-fg-subtle); flex-shrink: 0;
}
.params-tag-label-n { margin-left: 4px; }
.params-row-more {
  padding-top: 2px;
  animation: params-in 160ms var(--ease-out);
}
@keyframes params-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: none; }
}
.more-params-btn {
  display: inline-flex; align-items: center; gap: 4px;
  margin-left: auto; min-height: 28px; padding: 0 10px;
  border-radius: 999px; font-size: 11px; font-weight: 550;
  color: var(--color-fg-subtle); border: 1px solid transparent;
  background: transparent;
  transition: color var(--dur) var(--ease), background var(--dur) var(--ease),
    border-color var(--dur) var(--ease);
}
.more-params-btn:hover {
  color: var(--color-fg-muted); background: var(--color-surface-2);
  border-color: var(--color-border);
}
.more-params-btn.open {
  color: var(--color-fg-muted); background: var(--color-surface-2);
  border-color: var(--color-border);
}
.more-params-btn.dirty {
  color: var(--color-primary);
  border-color: color-mix(in srgb, var(--color-primary) 28%, transparent);
  background: var(--color-primary-soft);
}
.more-params-summary { font-size: 10px; opacity: 0.9; }
.tag-group { display: flex; gap: 4px; flex-wrap: wrap; }
.tag {
  padding: 5px 10px; font-size: 12px; border-radius: 999px;
  border: 1px solid transparent; color: var(--color-fg-muted);
  background: var(--color-surface-2);
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease),
    border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}
.tag:hover { color: var(--color-fg); background: var(--color-elevated); }
.tag.active {
  background: var(--color-primary); color: var(--color-on-primary);
  border-color: color-mix(in srgb, var(--color-primary) 70%, #000);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--color-primary) 28%, transparent);
}
.tnum {
  width: 52px; min-height: 30px; border-radius: 999px;
  background: var(--color-surface-2); border-color: transparent; text-align: center;
}
.proto-tip {
  font-size: 11px; color: var(--color-fg-subtle);
  padding: 4px 10px; border-radius: 999px;
  background: var(--color-surface-2); border: 1px solid var(--color-border);
}
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
