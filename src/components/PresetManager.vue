<script setup>
// 接口预设:居中弹窗。列表为主,新建/编辑在同一弹窗内切换(不叠第二层)。
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { useWorkbenchStore } from '../stores/workbench.js'
import AppIcon from './AppIcon.vue'
import ConfirmDialog from './ConfirmDialog.vue'

const props = defineProps({
  // 为 true 时直接打开新建表单(侧栏「添加接口」入口用)
  startCreate: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

const store = useWorkbenchStore()

const mode = ref('list') // 'list' | 'edit'
const form = reactive({ id: null, name: '', baseURL: '', apiKey: '', model: '', protocol: 'images' })
const testing = ref(false)
const testResult = ref(null)
const showKey = ref(false)
const confirmRemove = ref(false)
const confirmClear = ref(false)

const title = computed(() => {
  if (mode.value === 'list') return '接口设置'
  return form.id ? '编辑接口' : '添加接口'
})

function blankForm() {
  Object.assign(form, { id: null, name: '', baseURL: '', apiKey: '', model: '', protocol: 'images' })
  testResult.value = null
  showKey.value = false
}

function startNew() {
  blankForm()
  mode.value = 'edit'
}

function startEdit(p) {
  Object.assign(form, { ...p })
  testResult.value = null
  showKey.value = false
  mode.value = 'edit'
}

function cancelEdit() {
  // 无任何预设时取消 = 关掉弹窗,避免回到空列表再点一次
  if (!store.presets.length) {
    emit('close')
    return
  }
  mode.value = 'list'
  blankForm()
}

function save() {
  if (!form.baseURL || !form.model) return
  const saved = store.upsertPreset({ ...form })
  store.selectPreset(saved.id)
  // 首次添加成功后关掉弹窗,回到主界面开画
  if (store.presets.length === 1) {
    emit('close')
    return
  }
  mode.value = 'list'
  blankForm()
}

async function test() {
  testing.value = true
  testResult.value = null
  try {
    testResult.value = await store.testConnection({ ...form })
  } finally {
    testing.value = false
  }
}

function askRemoveCurrent() {
  if (!form.id) return
  confirmRemove.value = true
}
function doRemoveCurrent() {
  confirmRemove.value = false
  if (!form.id) return
  store.removePreset(form.id)
  if (!store.presets.length) {
    emit('close')
    return
  }
  mode.value = 'list'
  blankForm()
}

function askClearKeys() {
  confirmClear.value = true
}
function doClearKeys() {
  confirmClear.value = false
  store.clearKeys()
}

function usePreset(p) {
  store.selectPreset(p.id)
}

function enterInitial() {
  if (props.startCreate || !store.presets.length) startNew()
  else mode.value = 'list'
}

function onKey(e) {
  if (e.key === 'Escape') {
    if (mode.value === 'edit' && store.presets.length) cancelEdit()
    else emit('close')
  }
}

onMounted(() => {
  enterInitial()
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => window.removeEventListener('keydown', onKey))

watch(() => props.startCreate, (v) => {
  if (v) startNew()
})
</script>

<template>
  <div class="scrim" @click.self="emit('close')">
    <div class="modal" role="dialog" :aria-label="title">
      <header class="modal-head">
        <div class="head-left">
          <button
            v-if="mode === 'edit' && store.presets.length"
            class="icon-btn"
            @click="cancelEdit"
            aria-label="返回列表"
          >
            <AppIcon name="chevron-right" :size="15" class="back-icon" />
          </button>
          <strong>{{ title }}</strong>
        </div>
        <button class="icon-btn" @click="emit('close')" aria-label="关闭">
          <AppIcon name="x" :size="15" />
        </button>
      </header>

      <div class="modal-body">
        <!-- 列表 -->
        <template v-if="mode === 'list'">
          <div class="list-toolbar">
            <p class="list-hint">选择当前使用的接口,或新建一个 OpenAI / NewAPI 兼容端点。</p>
            <button class="btn btn-sm btn-primary" @click="startNew">
              <AppIcon name="plus" :size="14" /> 新建
            </button>
          </div>

          <div v-if="store.presets.length" class="preset-list">
            <div
              v-for="p in store.presets" :key="p.id"
              class="preset-row" :class="{ active: p.id === store.activePresetId }"
              @click="usePreset(p)"
            >
              <div class="preset-radio" :class="{ on: p.id === store.activePresetId }" aria-hidden="true">
                <span v-if="p.id === store.activePresetId" class="radio-dot" />
              </div>
              <div class="preset-main">
                <div class="preset-name-row">
                  <span class="preset-name">{{ p.name || '未命名' }}</span>
                  <span v-if="!p.apiKey" class="badge badge-warn">缺 Key</span>
                </div>
                <span class="preset-meta">{{ p.model || '未设模型' }} · {{ p.baseURL || '未设 URL' }}</span>
              </div>
              <button class="btn btn-sm btn-ghost edit-btn" @click.stop="startEdit(p)" aria-label="编辑">
                编辑
              </button>
            </div>
          </div>
          <div v-else class="empty">
            <div class="empty-icon"><AppIcon name="settings" :size="18" /></div>
            <p>还没有接口</p>
            <button class="btn btn-primary" @click="startNew">
              <AppIcon name="plus" :size="14" /> 添加第一个接口
            </button>
          </div>

          <div class="key-notice">
            <span class="helper">API Key 仅存本机浏览器,不会上传;请勿在公共设备保存。</span>
            <button class="btn btn-sm" @click="askClearKeys" v-if="store.presets.some(p => p.apiKey)">
              一键清除凭据
            </button>
          </div>
        </template>

        <!-- 新建 / 编辑 -->
        <template v-else>
          <p class="intro">填 Base URL、API Key 和模型即可。兼容标准 images 接口。</p>

          <div class="field">
            <label>名称 <span class="opt">可选</span></label>
            <input v-model="form.name" placeholder="如:我的中转 / OpenAI 官方" />
          </div>
          <div class="field">
            <label>Base URL <span class="req">必填</span></label>
            <input v-model="form.baseURL" placeholder="https://api.example.com" autocomplete="off" />
            <p class="helper">不含 /v1;程序会自动拼 /v1/images/generations 或 /v1/images/edits。</p>
          </div>
          <div class="field">
            <label>API Key</label>
            <div class="key-input">
              <input :type="showKey ? 'text' : 'password'" v-model="form.apiKey" placeholder="sk-..." autocomplete="off" />
              <button class="btn btn-sm btn-ghost" @click="showKey = !showKey" type="button">
                {{ showKey ? '隐藏' : '显示' }}
              </button>
            </div>
          </div>
          <div class="field">
            <label>模型 <span class="req">必填</span></label>
            <input v-model="form.model" placeholder="如:gpt-image-1 / dall-e-3" autocomplete="off" />
          </div>

          <div v-if="testResult" class="note" :class="{
            'note-danger': !testResult.ok, 'note-warn': testResult.category === 'auth'
          }">
            <AppIcon :name="testResult.ok ? 'check' : 'alert'" :size="14" />
            <span>
              {{ testResult.message }}
              <span v-if="testResult.category && !testResult.ok" class="helper">（{{ testResult.category }}）</span>
            </span>
          </div>
        </template>
      </div>

      <footer v-if="mode === 'edit'" class="modal-foot">
        <button class="btn" @click="test" :disabled="testing || !form.baseURL">
          <AppIcon name="refresh" :size="14" :class="{ spin: testing }" />
          {{ testing ? '检测中…' : '测试连接' }}
        </button>
        <div class="spacer" />
        <button v-if="form.id" class="btn btn-sm btn-danger" @click="askRemoveCurrent">删除</button>
        <button class="btn" @click="cancelEdit">取消</button>
        <button class="btn btn-primary" @click="save" :disabled="!form.baseURL || !form.model">
          保存并使用
        </button>
      </footer>

      <ConfirmDialog
        v-if="confirmRemove"
        title="删除接口"
        :message="`将删除接口「${form.name || '未命名'}」,此操作不可撤销。`"
        confirm-text="删除" danger
        @confirm="doRemoveCurrent" @cancel="confirmRemove = false"
      />
      <ConfirmDialog
        v-if="confirmClear"
        title="清除凭据"
        message="将清除所有接口预设中的 API Key(其余配置保留)。用于离开公共设备时快速抹除。"
        confirm-text="清除" danger
        @confirm="doClearKeys" @cancel="confirmClear = false"
      />
    </div>
  </div>
</template>

<style scoped>
.scrim {
  position: fixed; inset: 0; z-index: 140;
  background: var(--color-scrim);
  display: flex; align-items: center; justify-content: center;
  padding: var(--space-4);
  backdrop-filter: blur(3px);
  animation: fade 160ms var(--ease);
}
.modal {
  width: min(100%, 480px);
  max-height: min(88vh, 720px);
  display: flex; flex-direction: column;
  background: var(--color-elevated);
  border: 1px solid var(--color-border-strong);
  border-radius: 18px;
  box-shadow: var(--shadow-pop);
  overflow: hidden;
  animation: pop 200ms var(--ease-out);
}
.modal-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--space-2);
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.head-left {
  display: flex; align-items: center; gap: 6px; min-width: 0;
}
.head-left strong {
  font-size: 15px; font-weight: 650; letter-spacing: -0.01em;
}
.icon-btn {
  width: 32px; height: 32px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 10px; color: var(--color-fg-muted); flex-shrink: 0;
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
}
.icon-btn:hover { background: var(--color-surface-2); color: var(--color-fg); }
.back-icon { transform: rotate(180deg); }

.modal-body {
  padding: 16px;
  overflow-y: auto;
  flex: 1; min-height: 0;
  display: flex; flex-direction: column; gap: var(--space-3);
}

.list-toolbar {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: var(--space-3);
}
.list-hint {
  margin: 0; font-size: 12.5px; line-height: 1.5; color: var(--color-fg-muted);
  max-width: 28em;
}

.preset-list { display: flex; flex-direction: column; gap: 8px; }
.preset-row {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 12px 12px 14px;
  border-radius: 14px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-2);
  cursor: pointer;
  transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}
.preset-row:hover {
  border-color: var(--color-border-strong);
  background: color-mix(in srgb, var(--color-elevated) 70%, var(--color-surface-2));
}
.preset-row.active {
  border-color: color-mix(in srgb, var(--color-primary) 45%, var(--color-border-strong));
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-elevated));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-primary) 12%, transparent);
}
.preset-radio {
  width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0;
  border: 1.5px solid var(--color-border-strong);
  display: flex; align-items: center; justify-content: center;
  background: var(--color-bg);
  transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.preset-radio.on {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 12%, var(--color-bg));
}
.radio-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--color-primary);
}
.preset-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
.preset-name-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.preset-name {
  font-size: 13.5px; font-weight: 600;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.preset-meta {
  font-size: 11.5px; color: var(--color-fg-subtle);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.edit-btn { flex-shrink: 0; opacity: 0.85; }
.preset-row:hover .edit-btn { opacity: 1; }

.empty {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  padding: 28px 12px; text-align: center; color: var(--color-fg-muted);
}
.empty-icon {
  width: 44px; height: 44px; border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  background: var(--color-surface-2); border: 1px solid var(--color-border);
  color: var(--color-fg-subtle);
}
.empty p { margin: 0; font-size: 13px; }

.key-notice {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--space-2); flex-wrap: wrap;
  padding-top: 4px; border-top: 1px solid var(--color-border);
  margin-top: 4px;
}

.intro {
  margin: 0; font-size: 12.5px; line-height: 1.55; color: var(--color-fg-muted);
  padding: 10px 12px; border-radius: 12px;
  background: var(--color-surface-2); border: 1px solid var(--color-border);
}
.key-input { display: flex; gap: var(--space-2); }
.key-input input { flex: 1; min-width: 0; }
.req {
  font-size: 10px; font-weight: 600; color: var(--color-primary);
  margin-left: 4px;
}
.opt {
  font-size: 10px; font-weight: 500; color: var(--color-fg-subtle);
  margin-left: 4px;
}

.modal-foot {
  display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;
  padding: 12px 16px 14px;
  border-top: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-surface-2) 55%, transparent);
  flex-shrink: 0;
}
.spacer { flex: 1; min-width: 8px; }

.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes pop {
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to { opacity: 1; transform: none; }
}

@media (max-width: 520px) {
  .scrim { padding: 0; align-items: flex-end; }
  .modal {
    width: 100%; max-height: 92vh;
    border-radius: 18px 18px 0 0;
    border-left: none; border-right: none; border-bottom: none;
  }
}
</style>
