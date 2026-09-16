<script setup>
// 接口预设:居中弹窗。列表为主,新建/编辑在同一弹窗内切换(不叠第二层)。
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWorkbenchStore } from '../stores/workbench.js'
import AppIcon from './AppIcon.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import { DEFAULT_REQUEST_TIMEOUT_MS, MIN_REQUEST_TIMEOUT_MS, MAX_REQUEST_TIMEOUT_MS } from '../lib/presets.js'
import { fetchModels as fetchModelList, MODEL_LIST_TIMEOUT_MS } from '../lib/models.js'
import { useDialogA11y } from '../composables/useDialogA11y.js'

const props = defineProps({
  // 为 true 时直接打开新建表单(侧栏「添加接口」入口用)
  startCreate: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

const store = useWorkbenchStore()
const { t } = useI18n()

const mode = ref('list') // 'list' | 'edit'
const form = reactive({ id: null, name: '', baseURL: '', apiKey: '', model: '', protocol: 'images', requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS })
const testing = ref(false)
const testResult = ref(null)
const showKey = ref(false)
const confirmRemove = ref(false)
const confirmClear = ref(false)
// 未保存编辑保护:点外面/X 不再直接丢表单(用户填了半天被误关)。
const confirmDiscard = ref(false)
const discardTarget = ref('close')
const originalJson = ref('')
const dirty = computed(() => JSON.stringify({ ...form }) !== originalJson.value)
const modal = ref(null)
const modelField = ref(null)
const modelInput = ref(null)
const modelFilter = ref('')
const models = ref([])
const modelsOpen = ref(false)
const modelsLoading = ref(false)
const modelsError = ref('')
const modelFilterInput = ref(null)
let modelRequestId = 0
useDialogA11y(modal, close)

const title = computed(() => {
  if (mode.value === 'list') return t('sidebar.apiSettings')
  return form.id ? t('presets.editTitle') : t('presets.addTitle')
})

function blankForm() {
  Object.assign(form, { id: null, name: '', baseURL: '', apiKey: '', model: '', protocol: 'images', requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS })
  originalJson.value = JSON.stringify({ ...form })
  testResult.value = null
  showKey.value = false
  resetModelDiscovery()
}

function startNew() {
  blankForm()
  mode.value = 'edit'
}

function startEdit(p) {
  Object.assign(form, { ...p, requestTimeoutMs: p.requestTimeoutMs || DEFAULT_REQUEST_TIMEOUT_MS })
  originalJson.value = JSON.stringify({ ...form })
  testResult.value = null
  showKey.value = false
  resetModelDiscovery()
  mode.value = 'edit'
}

function cancelEdit() {
  if (dirty.value) {
    discardTarget.value = 'list'
    confirmDiscard.value = true
    return
  }
  leaveEdit()
}
function leaveEdit() {
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

// 统一关闭入口:编辑态且有未保存修改时先确认,避免误关丢数据。
function close() {
  if (mode.value === 'edit' && dirty.value) {
    discardTarget.value = 'close'
    confirmDiscard.value = true
    return
  }
  emit('close')
}
function doDiscard() {
  confirmDiscard.value = false
  if (discardTarget.value === 'list') leaveEdit()
  else emit('close')
}

function usePreset(p) {
  store.selectPreset(p.id)
}

function setTimeoutSeconds(value) {
  const seconds = Math.min(MAX_REQUEST_TIMEOUT_MS / 1000, Math.max(MIN_REQUEST_TIMEOUT_MS / 1000, Number(value) || DEFAULT_REQUEST_TIMEOUT_MS / 1000))
  form.requestTimeoutMs = Math.round(seconds) * 1000
}

const filteredModels = computed(() => {
  const query = modelFilter.value.trim().toLowerCase()
  const list = query
    ? models.value.filter((model) => model.toLowerCase().includes(query))
    : models.value
  return list.slice(0, 100)
})

function resetModelDiscovery() {
  modelRequestId += 1
  models.value = []
  modelFilter.value = ''
  modelsOpen.value = false
  modelsLoading.value = false
  modelsError.value = ''
}

async function fetchAvailableModels() {
  if (!form.baseURL || modelsLoading.value) return
  const requestId = ++modelRequestId
  const baseURL = form.baseURL
  const apiKey = form.apiKey
  modelsLoading.value = true
  modelsError.value = ''
  modelsOpen.value = false
  try {
    const result = await fetchModelList({
      baseURL,
      apiKey,
      timeoutMs: MODEL_LIST_TIMEOUT_MS,
    })
    if (requestId !== modelRequestId) return
    models.value = result.models
    modelFilter.value = ''
    if (!result.models.length) {
      modelsError.value = t('presets.modelsEmptyList')
    } else {
      modelsOpen.value = true
      revealModelPicker()
    }
  } catch (error) {
    if (requestId !== modelRequestId) return
    modelsError.value = error?.message || t('presets.modelsFetchFailed')
  } finally {
    if (requestId === modelRequestId) modelsLoading.value = false
  }
}

function openModelList() {
  if (!models.value.length) return
  modelsOpen.value = true
  revealModelPicker()
}

function revealModelPicker() {
  nextTick(() => {
    modelFilter.value = ''
    modelFilterInput.value?.focus()
    modelField.value?.querySelector('.model-picker')?.scrollIntoView({ block: 'nearest' })
  })
}

function closeModelList() {
  modelsOpen.value = false
  nextTick(() => modelInput.value?.focus())
}

function selectModel(model) {
  form.model = model
  modelsOpen.value = false
  nextTick(() => modelInput.value?.focus())
}

function onModelInputKeydown(event) {
  if (event.key === 'ArrowDown' && models.value.length) {
    event.preventDefault()
    modelsOpen.value = true
    nextTick(() => modelField.value?.querySelector('.model-option')?.focus())
  } else if (event.key === 'Escape' && modelsOpen.value) {
    event.preventDefault()
    closeModelList()
  }
}

function onModelPickerKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    closeModelList()
    return
  }
  const options = [...(modelField.value?.querySelectorAll('.model-option') || [])]
  if (!options.length) return
  const currentIndex = options.indexOf(document.activeElement)
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const offset = event.key === 'ArrowDown' ? 1 : -1
    const nextIndex = currentIndex < 0
      ? (event.key === 'ArrowDown' ? 0 : options.length - 1)
      : (currentIndex + offset + options.length) % options.length
    options[nextIndex]?.focus()
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    options[event.key === 'Home' ? 0 : options.length - 1]?.focus()
  }
}

function onDocumentClick(event) {
  if (modelsOpen.value && !event.target.closest('.model-field')) closeModelList()
}

function enterInitial() {
  if (props.startCreate || !store.presets.length) startNew()
  else mode.value = 'list'
}

onMounted(() => {
  enterInitial()
  document.addEventListener('click', onDocumentClick)
})

onUnmounted(() => {
  modelRequestId += 1
  document.removeEventListener('click', onDocumentClick)
})

watch(() => props.startCreate, (v) => {
  if (v) startNew()
})

watch(() => [form.baseURL, form.apiKey], () => {
  if (models.value.length || modelsError.value) resetModelDiscovery()
})
</script>

<template>
  <!-- 点弹窗外层不关闭:误触概率太高;只保留叉号关闭,避免白填 -->
  <div class="scrim">
    <div ref="modal" class="modal" role="dialog" aria-modal="true" :aria-label="title" tabindex="-1">
      <header class="modal-head">
        <div class="head-left">
          <button
            v-if="mode === 'edit' && store.presets.length"
            class="icon-btn"
            @click="cancelEdit"
            :aria-label="t('presets.backToList')"
          >
            <AppIcon name="chevron-right" :size="15" class="back-icon" />
          </button>
          <strong>{{ title }}</strong>
        </div>
        <button class="icon-btn" @click="close" :aria-label="t('common.close')">
          <AppIcon name="x" :size="15" />
        </button>
      </header>

      <div class="modal-body">
        <!-- 列表 -->
        <template v-if="mode === 'list'">
          <div class="list-toolbar">
            <p class="list-hint">{{ t('presets.listHint') }}</p>
            <button class="btn btn-sm btn-primary" @click="startNew">
              <AppIcon name="plus" :size="14" /> {{ t('presets.new') }}
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
                  <span class="preset-name">{{ p.name || t('presets.unnamed') }}</span>
                  <span v-if="!p.apiKey" class="badge badge-warn">{{ t('presets.missingKey') }}</span>
                </div>
                <span class="preset-meta">{{ p.model || t('presets.noModel') }} · {{ p.baseURL || t('presets.noUrl') }}</span>
              </div>
              <button class="btn btn-sm btn-ghost edit-btn" @click.stop="startEdit(p)" :aria-label="t('presets.edit')">
                {{ t('presets.edit') }}
              </button>
            </div>
          </div>
          <div v-else class="empty">
            <div class="empty-icon"><AppIcon name="settings" :size="18" /></div>
            <p>{{ t('presets.noPresets') }}</p>
            <button class="btn btn-primary" @click="startNew">
              <AppIcon name="plus" :size="14" /> {{ t('presets.addFirst') }}
            </button>
          </div>

          <div class="key-notice">
            <span class="helper">{{ t('presets.keyNotice') }}</span>
            <button class="btn btn-sm" @click="askClearKeys" v-if="store.presets.some(p => p.apiKey)">
              {{ t('presets.clearKeys') }}
            </button>
          </div>
        </template>

        <!-- 新建 / 编辑 -->
        <template v-else>
          <p class="intro">{{ t('presets.intro') }}</p>

          <div class="field">
            <label>{{ t('presets.nameLabel') }} <span class="opt">{{ t('presets.optional') }}</span></label>
            <input v-model="form.name" :placeholder="t('presets.namePlaceholder')" />
          </div>
          <div class="field">
            <label>Base URL <span class="req">{{ t('presets.required') }}</span></label>
            <input v-model="form.baseURL" placeholder="https://api.example.com" autocomplete="off" />
            <p class="helper">{{ t('presets.baseUrlHelper') }}</p>
          </div>
          <div class="field">
            <label>API Key</label>
            <div class="key-input">
              <input :type="showKey ? 'text' : 'password'" v-model="form.apiKey" placeholder="sk-..." autocomplete="off" />
              <button class="btn btn-sm btn-ghost" @click="showKey = !showKey" type="button">
                {{ showKey ? t('presets.hide') : t('presets.show') }}
              </button>
            </div>
          </div>
          <div class="field">
            <label>{{ t('presets.modelLabel') }} <span class="req">{{ t('presets.required') }}</span></label>
            <div ref="modelField" class="model-field" @click.stop>
              <div class="model-input-row">
                <input
                  ref="modelInput"
                  v-model="form.model"
                  :placeholder="t('presets.modelPlaceholder')"
                  autocomplete="off"
                  role="combobox"
                  aria-controls="model-picker"
                  :aria-expanded="modelsOpen"
                  aria-autocomplete="list"
                  @keydown="onModelInputKeydown"
                />
                <button
                  type="button"
                  class="btn btn-sm model-fetch"
                  :disabled="modelsLoading || !form.baseURL"
                  @click="fetchAvailableModels"
                  :title="models.length ? t('presets.refetchModels') : t('presets.fetchModels')"
                >
                  <AppIcon name="refresh" :size="13" :class="{ spin: modelsLoading }" />
                  {{ modelsLoading ? t('presets.fetching') : (models.length ? t('presets.refreshModels') : t('presets.getModels')) }}
                </button>
              </div>
              <div v-if="models.length" class="model-picker-toggle">
                <span class="helper">{{ t('presets.fetchedCount', { count: models.length }) }}</span>
                <button type="button" class="model-list-link" @click="modelsOpen ? closeModelList() : openModelList()">
                  {{ modelsOpen ? t('presets.collapseList') : t('presets.chooseModel') }}
                </button>
              </div>
              <div v-if="modelsError" class="model-fetch-error" role="alert">
                <AppIcon name="alert" :size="13" />
                <span>{{ modelsError }}</span>
              </div>
              <div
                v-if="modelsOpen && models.length"
                id="model-picker"
                class="model-picker"
                role="listbox"
                :aria-label="t('presets.availableModels')"
                @keydown="onModelPickerKeydown"
              >
                <div class="model-picker-head">
                  <span>{{ t('presets.availableModels') }}</span>
                  <span class="helper">{{ filteredModels.length }} / {{ models.length }}</span>
                </div>
                <input
                  ref="modelFilterInput"
                  v-model="modelFilter"
                  class="model-filter"
                  type="search"
                  :placeholder="t('presets.filterModels')"
                  :aria-label="t('presets.filterModels')"
                  @keydown.esc.stop="closeModelList"
                />
                <div class="model-options">
                  <button
                    v-for="model in filteredModels"
                    :key="model"
                    type="button"
                    class="model-option"
                    role="option"
                    :aria-selected="form.model === model"
                    @click="selectModel(model)"
                  >
                    <span>{{ model }}</span>
                    <AppIcon v-if="form.model === model" name="check" :size="13" />
                  </button>
                  <p v-if="!filteredModels.length" class="model-empty">{{ t('presets.noMatchingModels') }}</p>
                </div>
              </div>
            </div>
          </div>
          <div class="field">
            <label>{{ t('presets.timeoutLabel') }} <span class="opt">{{ t('presets.timeoutRange') }}</span></label>
            <input
              type="number" min="30" max="1800" step="1"
              :value="Math.round(form.requestTimeoutMs / 1000)"
              @input="setTimeoutSeconds($event.target.value)"
              inputmode="numeric"
            />
            <p class="helper">{{ t('presets.timeoutHelper') }}</p>
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
          {{ testing ? t('presets.testing') : t('presets.testConnection') }}
        </button>
        <div class="spacer" />
        <button v-if="form.id" class="btn btn-sm btn-danger" @click="askRemoveCurrent">{{ t('common.delete') }}</button>
        <button class="btn" @click="cancelEdit">{{ t('common.cancel') }}</button>
        <button class="btn btn-primary" @click="save" :disabled="!form.baseURL || !form.model">
          {{ t('presets.saveAndUse') }}
        </button>
      </footer>

      <ConfirmDialog
        v-if="confirmRemove"
        :title="t('presets.removeTitle')"
        :message="t('presets.removeMessage', { name: form.name || t('presets.unnamed') })"
        :confirm-text="t('common.delete')" danger
        @confirm="doRemoveCurrent" @cancel="confirmRemove = false"
      />
      <ConfirmDialog
        v-if="confirmClear"
        :title="t('presets.clearTitle')"
        :message="t('presets.clearMessage')"
        :confirm-text="t('presets.clear')" danger
        @confirm="doClearKeys" @cancel="confirmClear = false"
      />
      <ConfirmDialog
        v-if="confirmDiscard"
        :title="t('presets.discardTitle')"
        :message="t('presets.discardMessage')"
        :confirm-text="t('presets.discard')" danger
        @confirm="doDiscard" @cancel="confirmDiscard = false"
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
  animation: fade 160ms var(--ease);
}
.modal {
  width: min(100%, 480px);
  max-height: min(88vh, 720px);
  display: flex; flex-direction: column;
  background: var(--color-elevated);
  border: 1px solid var(--color-border-strong);
  border-radius: 18px;
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
  transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.preset-row:hover {
  border-color: var(--color-border-strong);
  background: color-mix(in srgb, var(--color-elevated) 70%, var(--color-surface-2));
}
.preset-row.active {
  border-color: color-mix(in srgb, var(--color-primary) 45%, var(--color-border-strong));
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-elevated));
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
.model-field { position: relative; z-index: 2; }
.model-input-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
.model-input-row input { min-width: 0; }
.model-fetch { white-space: nowrap; min-width: 86px; }
.model-picker-toggle {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; margin-top: 6px;
}
.model-list-link {
  padding: 2px 0; color: var(--color-primary); font-size: 11px; font-weight: 600;
}
.model-list-link:hover { text-decoration: underline; }
.model-fetch-error {
  display: flex; align-items: flex-start; gap: 6px; margin-top: 7px;
  color: var(--color-warning); font-size: 11px; line-height: 1.45;
}
.model-fetch-error svg { flex-shrink: 0; margin-top: 1px; }
.model-picker {
  margin-top: 8px;
  padding: 8px; background: var(--color-elevated);
  border: 1px solid var(--color-border-strong); border-radius: 10px;
  animation: pop 160ms var(--ease-out);
}
.model-picker-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; padding: 2px 2px 7px; font-size: 11px; font-weight: 650;
  color: var(--color-fg-muted);
}
.model-filter { margin-bottom: 6px; min-height: 32px; font-size: 12px; }
.model-options { max-height: 180px; overflow-y: auto; }
.model-option {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  width: 100%; min-height: 32px; padding: 6px 8px; border-radius: 7px;
  text-align: left; color: var(--color-fg-muted); font-size: 12px;
}
.model-option span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.model-option:hover, .model-option[aria-selected='true'] {
  color: var(--color-primary); background: var(--color-primary-soft);
}
.model-empty { margin: 0; padding: 12px 6px; color: var(--color-fg-subtle); font-size: 11px; text-align: center; }
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
