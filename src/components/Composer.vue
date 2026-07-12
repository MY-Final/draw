<script setup>
// 底部固定输入区(composer,对话式布局)。prompt + 内联参数 + 参考图 chips + 生成。
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useWorkbenchStore } from '../stores/workbench.js'
import AppIcon from './AppIcon.vue'
import AssetImage from './AssetImage.vue'
import { addPrompt, removePrompt, getAllPrompts } from '../lib/promptLibrary.js'
import { putAsset } from '../lib/assetRepo.js'

// ── 尺寸计算(宽高比 × 分辨率组合,design D1)──
const RES_MAP = { '1k': 1024, '2k': 2048, '4k': 4096 }
const QUALITY_MAP = { '1k': '', '2k': ', high detail, sharp focus', '4k': ', ultra detailed, 4k, ultra sharp, intricate details' }
const RATIOS = [
  { key: '1:1', label: '方形' },
  { key: '16:9', label: '横屏' },
  { key: '9:16', label: '竖屏' },
  { key: '4:3', label: '横屏' },
  { key: '3:4', label: '竖屏' },
]
const RESOLUTIONS = [
  { key: '1k', label: '1K' },
  { key: '2k', label: '2K' },
  { key: '4k', label: '4K' },
]

function computeSize(r, res) {
  const base = RES_MAP[res]
  const [w, h] = r.split(':').map(Number)
  if (w === h) return `${base}x${base}`
  if (w > h) return `${base}x${Math.round(base * h / w)}`
  return `${Math.round(base * w / h)}x${base}`
}

const store = useWorkbenchStore()

const prompt = ref('')
const ratio = ref('1:1')
const resolution = ref('1k')
const n = ref(1)
const refImageIds = ref([])
const showParams = ref(false)
const showPromptLib = ref(false)
const savedPrompts = ref([])
const promptLibToast = ref(null)

function loadSavedPrompts() {
  savedPrompts.value = getAllPrompts(store.activeWorkspaceId).slice(0, 50)
}

function togglePromptLib() {
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

onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))

const isChat = computed(() => store.isChatProtocol)
// 参考图现在两种协议都支持(images 走 edits 改图)。多张时 images 只用第一张。
const refAssets = computed(() =>
  refImageIds.value.map((id) => store.assets.find((a) => a.id === id)).filter(Boolean)
)
const multiRefOnImages = computed(() => !isChat.value && refImageIds.value.length > 1)

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
  const blob = file
  const asset = await putAsset({ blob, mime: blob.type, name: file.name, source: 'reference-uploaded', workspaceId: store.activeWorkspaceId })
  addReference(asset.id)
  if (fileInput.value) fileInput.value.value = ''
}
function onFilePick(e) {
  const file = e.target?.files?.[0]
  if (file) uploadRefImage(file)
}
function onPaste(e) {
  // 只处理图片粘贴,不拦截文本(design 明确:不要拦截纯文本粘贴)
  const file = e.clipboardData?.files?.[0]
  if (file && file.type.startsWith('image/')) {
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
  try {
    const data = JSON.parse(e.dataTransfer.getData('application/json'))
    if (data.assetId) addReference(data.assetId)
  } catch { /* 非素材库拖放,忽略 */ }
}
function applyPrefill(prefill) {
  if (!prefill) return
  prompt.value = prefill.prompt || ''
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
  }
  if (prefill.params?.n) n.value = prefill.params.n
  refImageIds.value = Array.isArray(prefill.refImageIds) ? [...prefill.refImageIds] : []
}
function gcd(a, b) { return b ? gcd(b, a % b) : a }
function clear() {
  prompt.value = ''
  refImageIds.value = []
}
defineExpose({ addReference, applyPrefill, clear, fillPrompt })

async function submit() {
  if (!prompt.value.trim() || store.generating || !store.activePreset) return
  const text = prompt.value.trim()
  const refs = [...refImageIds.value]
  const sizeVal = computeSize(ratio.value, resolution.value)
  const qualitySuffix = QUALITY_MAP[resolution.value]
  const fullPrompt = qualitySuffix ? text + qualitySuffix : text
  // 立即清空输入:乐观上屏已把本轮请求推上对话流,输入框无需等生成完成(请求即时上屏)。
  clear()
  await store.generate({ prompt: text, fullPrompt, refImageIds: refs, params: { size: sizeVal, ratio: ratio.value, resolution: resolution.value, n: Number(n.value) } })
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
</script>

<template>
  <div class="composer-wrap" @paste="onPaste">
    <!-- 无接口时的引导条 -->
    <div v-if="!store.activePreset" class="hint">
      <AppIcon name="alert" :size="14" /> 还没有可用接口 —— 点左侧「设置」添加一个,即可开始。
    </div>

    <!-- 参考图 chips 与上传 + DnD 目标(上传按钮始终可见) -->
    <div
      class="ref-strip" :class="{ 'drop-active': dropActive }"
      @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop"
    >
      <div v-for="a in refAssets" :key="a.id" class="ref-thumb">
        <AssetImage :asset="a" alt="参考图" />
        <button class="ref-remove" @click="removeReference(a.id)" aria-label="移除参考图">
          <AppIcon name="x" :size="11" />
        </button>
      </div>
      <button class="ref-add" @click="fileInput?.click()" title="上传参考图" aria-label="上传参考图">
        <AppIcon name="plus" :size="14" />
      </button>
      <input ref="fileInput" type="file" accept="image/*" class="hidden-input" @change="onFilePick" />
      <span class="ref-tip">{{ refAssets.length ? (multiRefOnImages ? '参考图(images 仅用第一张)' : '参考图') : '上传或从素材库拖入参考图' }}</span>
    </div>

    <!-- 主输入框 -->
    <div class="composer" :class="{ disabled: !store.activePreset }">
      <textarea
        v-model="prompt" rows="1" class="composer-input"
        :placeholder="isChat ? '描述你想画的,或把图设为参考再改图…' : '描述你想画的,或把图设为参考改图…'"
        @input="autogrow"
        @keydown.enter.exact="onEnter"
        @keydown.shift.enter.stop
      />

      <div class="composer-bar">
        <!-- 参数(折叠,默认收起,保持干净) -->
        <button class="chip" @click="showParams = !showParams" :aria-expanded="showParams">
          <AppIcon name="settings" :size="13" /> {{ computeSize(ratio, resolution) }} · ×{{ n }}
        </button>
        <div v-if="showParams" class="params-pop">
          <div class="params-section">
            <span class="params-label">宽高比</span>
            <div class="btn-group">
              <button
                v-for="r in RATIOS" :key="r.key"
                class="btn-group-item" :class="{ active: ratio === r.key }"
                @click="ratio = r.key"
              >{{ r.label }}</button>
            </div>
          </div>
          <div class="params-section">
            <span class="params-label">分辨率</span>
            <div class="btn-group">
              <button
                v-for="r in RESOLUTIONS" :key="r.key"
                class="btn-group-item" :class="{ active: resolution === r.key }"
                @click="resolution = r.key"
              >{{ r.label }}</button>
            </div>
          </div>
          <label>数量
            <input class="tnum" type="number" min="1" max="4" v-model="n" />
          </label>
        </div>

        <span v-if="!isChat" class="proto-tip">images 协议 · 改图</span>
        <span v-else class="proto-tip">chat 协议 · 可参考图</span>

        <div class="spacer" />

        <div class="prompt-lib-wrap">
          <button
            class="chip star-btn" :class="{ active: showPromptLib, highlight: prompt.trim() && !showPromptLib }"
            @click.stop="togglePromptLib" :disabled="!prompt.trim() && !showPromptLib"
            title="收藏 prompt"
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
          class="btn btn-primary send"
          :disabled="store.generating || !prompt.trim() || !store.activePreset"
          @click="submit" aria-label="生成图片"
        >
          <AppIcon :name="store.generating ? 'refresh' : 'sparkles'" :size="16" :class="{ spin: store.generating }" />
          {{ store.generating ? '生成中' : '生成' }}
        </button>
      </div>
    </div>
    <p class="composer-foot">Enter 生成 · Shift+Enter 换行</p>
  </div>
</template>

<style scoped>
.composer-wrap { width: 100%; max-width: 760px; margin: 0 auto; }
.hint { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--color-warning); margin-bottom: var(--space-2); }

.ref-strip { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2); flex-wrap: wrap; transition: border-color var(--dur) var(--ease); }
.ref-strip.drop-active {
  border: 2px dashed var(--color-primary);
  border-radius: var(--radius-sm);
  padding: var(--space-2);
  margin-left: calc(-1 * var(--space-2) - 2px);
  margin-right: calc(-1 * var(--space-2) - 2px);
  margin-top: calc(-1 * var(--space-2) - 2px);
  position: relative;
  z-index: 1;
  background: var(--color-surface);
}
.ref-thumb { position: relative; width: 44px; height: 44px; border-radius: var(--radius-sm); overflow: hidden; border: 1px solid var(--color-border-strong); }
.ref-remove { position: absolute; top: 1px; right: 1px; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.65); color: #fff; border-radius: 999px; }
.ref-add {
  width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-sm); border: 1px dashed var(--color-border-strong);
  color: var(--color-fg-muted); transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease);
}
.ref-add:hover { border-color: var(--color-primary); color: var(--color-primary); }
.hidden-input { display: none; }
.ref-tip { font-size: 11px; color: var(--color-fg-subtle); }

.composer {
  background: var(--color-surface); border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-xl); padding: var(--space-3) var(--space-3) var(--space-2);
  box-shadow: var(--shadow-2); transition: border-color var(--dur) var(--ease);
}
.composer:focus-within { border-color: var(--color-primary); }
.composer.disabled { opacity: 0.7; }
.composer-input {
  border: none; background: transparent; padding: var(--space-1) var(--space-2);
  font-size: 15px; max-height: 200px; overflow-y: auto;
}
.composer-input:focus { outline: none; }

.composer-bar { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-1); position: relative; }
.chip {
  display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--color-fg-muted);
  padding: 4px 10px; border-radius: 999px; border: 1px solid var(--color-border);
  transition: background var(--dur) var(--ease);
}
.chip:hover { background: var(--color-surface-2); }
.params-pop {
  position: absolute; bottom: 40px; left: 0; z-index: 20;
  display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3);
  background: var(--color-elevated); border: 1px solid var(--color-border-strong);
  border-radius: var(--radius); box-shadow: var(--shadow-2); min-width: 200px;
}
.params-section { display: flex; flex-direction: column; gap: var(--space-1); }
.params-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-fg-subtle); }
.btn-group { display: flex; gap: 1px; border-radius: var(--radius-sm); overflow: hidden; border: 1px solid var(--color-border); }
.btn-group-item { flex: 1; padding: 4px 6px; font-size: 11px; text-align: center; color: var(--color-fg-muted); background: var(--color-surface); transition: background var(--dur) var(--ease), color var(--dur) var(--ease); }
.btn-group-item + .btn-group-item { border-left: 1px solid var(--color-border); }
.btn-group-item:hover { background: var(--color-surface-2); }
.btn-group-item.active { background: var(--color-primary); color: var(--color-on-primary); }
.params-pop label { font-size: 11px; display: flex; flex-direction: column; gap: 4px; }
.params-pop select, .params-pop input { min-width: 90px; }
.proto-tip { font-size: 11px; color: var(--color-fg-subtle); }
.spacer { flex: 1; }

/* Prompt 收藏 */
.prompt-lib-wrap { position: relative; }
.star-btn.active { background: var(--color-primary); color: var(--color-on-primary); border-color: var(--color-primary); }
.star-btn.highlight { color: var(--color-primary); border-color: var(--color-primary); }
.star-btn:disabled { opacity: 0.4; }

.prompt-pop {
  position: absolute; bottom: 40px; right: 0; z-index: 30;
  width: 320px; max-height: 280px; display: flex; flex-direction: column;
  background: var(--color-elevated); border: 1px solid var(--color-border-strong);
  border-radius: var(--radius); box-shadow: var(--shadow-pop);
  overflow: hidden;
}
.prompt-pop-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.prompt-pop-title { font-size: 11px; font-weight: 600; color: var(--color-fg-subtle); text-transform: uppercase; letter-spacing: 0.05em; }
.pop-save { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; color: var(--color-primary); padding: 2px 6px; border-radius: var(--radius-sm); }
.pop-save:hover:not(:disabled) { background: color-mix(in srgb, var(--color-primary) 10%, transparent); }
.pop-save:disabled { opacity: 0.4; }
.prompt-toast { padding: var(--space-1) var(--space-3); font-size: 11px; flex-shrink: 0; }
.prompt-toast.success { background: color-mix(in srgb, var(--color-primary) 10%, transparent); color: var(--color-primary); }
.prompt-toast.warn { background: color-mix(in srgb, var(--color-warning) 12%, transparent); color: var(--color-warning); }

.prompt-empty { padding: var(--space-6) var(--space-3); text-align: center; font-size: 12px; color: var(--color-fg-subtle); }
.prompt-list { overflow-y: auto; flex: 1; }
.prompt-item {
  display: flex; align-items: center; gap: var(--space-2);
  padding: var(--space-2) var(--space-3); cursor: pointer;
  border-bottom: 1px solid var(--color-border); font-size: 13px;
  transition: background var(--dur) var(--ease);
}
.prompt-item:hover { background: var(--color-surface-2); }
.prompt-item:last-child { border-bottom: none; }
.prompt-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-fg); }
.prompt-del { flex-shrink: 0; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-sm); color: var(--color-fg-subtle); }
.prompt-del:hover { background: var(--color-surface-2); color: var(--color-destructive); }

.send { border-radius: 999px; min-height: 38px; padding: 0 var(--space-5); }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.composer-foot { text-align: center; font-size: 11px; color: var(--color-fg-subtle); margin: var(--space-2) 0 0; }
</style>
