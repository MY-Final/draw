<script setup>
// 接口预设管理(Task 3.2/3.3/3.4)。新建默认 images 协议;Key 告知 + 一键清除;连通性检查。
import { ref, reactive } from 'vue'
import { useWorkbenchStore } from '../stores/workbench.js'
import AppIcon from './AppIcon.vue'

const store = useWorkbenchStore()

const editing = ref(false)
const form = reactive({ id: null, name: '', baseURL: '', apiKey: '', model: '', protocol: 'images' })
const testing = ref(false)
const testResult = ref(null)
const showKey = ref(false)

function startNew() {
  Object.assign(form, { id: null, name: '', baseURL: '', apiKey: '', model: '', protocol: 'images' })
  testResult.value = null
  editing.value = true
}
function startEdit(p) {
  Object.assign(form, { ...p })
  testResult.value = null
  editing.value = true
}
function save() {
  if (!form.baseURL || !form.model) return
  const saved = store.upsertPreset({ ...form })
  store.selectPreset(saved.id)
  editing.value = false
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
function confirmClearKeys() {
  if (confirm('将清除所有接口预设中的 API Key(其余配置保留)。用于离开公共设备时快速抹除。继续?')) {
    store.clearKeys()
  }
}
</script>

<template>
  <section class="presets">
    <header class="sec-head">
      <div class="sec-title"><AppIcon name="settings" :size="15" /> 接口预设</div>
      <button class="btn btn-sm btn-ghost" @click="startNew" aria-label="新建接口预设">
        <AppIcon name="plus" :size="14" /> 新建
      </button>
    </header>

    <!-- 预设选择 + 列表 -->
    <div v-if="store.presets.length" class="preset-list">
      <div
        v-for="p in store.presets" :key="p.id"
        class="preset-row" :class="{ active: p.id === store.activePresetId }"
        @click="store.selectPreset(p.id)"
      >
        <div class="preset-main">
          <span class="preset-name">{{ p.name || '未命名' }}</span>
          <span v-if="!p.apiKey" class="badge badge-warn">缺 Key</span>
        </div>
        <button class="btn btn-sm btn-ghost" @click.stop="startEdit(p)" aria-label="编辑">编辑</button>
      </div>
    </div>
    <p v-else class="helper">还没有接口。点「新建」添加一个 OpenAI/NewAPI 兼容接口。</p>

    <!-- Key 安全说明 + 一键清除 -->
    <div class="key-notice">
      <span class="helper">API Key 仅存本机浏览器,不会上传;请勿在公共设备保存。</span>
      <button class="btn btn-sm" @click="confirmClearKeys" v-if="store.presets.some(p => p.apiKey)">
        一键清除凭据
      </button>
    </div>

    <!-- 编辑弹层 -->
    <div v-if="editing" class="editor-scrim" @click.self="editing = false">
      <div class="editor" role="dialog" aria-label="编辑接口预设">
        <div class="editor-head">
          <strong>{{ form.id ? '编辑接口' : '新建接口' }}</strong>
          <button class="btn btn-sm btn-ghost" @click="editing = false"><AppIcon name="x" :size="14" /></button>
        </div>

        <div class="field">
          <label>名称</label>
          <input v-model="form.name" placeholder="如:我的中转 / OpenAI 官方" />
        </div>
        <div class="field">
          <label>Base URL</label>
          <input v-model="form.baseURL" placeholder="https://api.example.com" />
          <p class="helper">不含 /v1;程序会自动拼接 /v1/images/generations(文生图)或 /v1/images/edits(带参考图改图)。</p>
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
          <label>模型</label>
          <input v-model="form.model" placeholder="如:gpt-image-1 / dall-e-3 / gemini-..." />
        </div>

        <!-- 连通性结果(区分原因) -->
        <div v-if="testResult" class="note" :class="{
          'note-danger': !testResult.ok, 'note-warn': testResult.category === 'auth'
        }">
          <AppIcon :name="testResult.ok ? 'check' : 'alert'" :size="14" />
          {{ testResult.message }}
          <span v-if="testResult.category && !testResult.ok" class="helper">（{{ testResult.category }}）</span>
        </div>

        <div class="editor-actions">
          <button class="btn" @click="test" :disabled="testing || !form.baseURL">
            <AppIcon name="refresh" :size="14" /> {{ testing ? '检测中…' : '测试连接' }}
          </button>
          <div class="spacer" />
          <button class="btn-danger btn btn-sm" v-if="form.id" @click="store.removePreset(form.id); editing = false">删除</button>
          <button class="btn btn-primary" @click="save" :disabled="!form.baseURL || !form.model">保存</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.presets { display: flex; flex-direction: column; gap: var(--space-3); }
.sec-head { display: flex; align-items: center; justify-content: space-between; }
.sec-title { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--color-fg); }
.preset-list { display: flex; flex-direction: column; gap: var(--space-1); }
.preset-row {
  display: flex; align-items: center; justify-content: space-between; gap: var(--space-2);
  padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm);
  border: 1px solid var(--color-border); background: var(--color-surface-2); cursor: pointer;
  transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.preset-row:hover { border-color: var(--color-border-strong); }
.preset-row.active { border-color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 12%, var(--color-surface-2)); }
.preset-main { display: flex; align-items: center; gap: 6px; min-width: 0; }
.preset-name { font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.key-notice { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); flex-wrap: wrap; }
.key-input { display: flex; gap: var(--space-2); }

.editor-scrim {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.55);
  display: flex; align-items: center; justify-content: center; z-index: 100; padding: var(--space-4);
}
.editor {
  width: 100%; max-width: 440px; max-height: 90vh; overflow-y: auto;
  background: var(--color-surface); border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-lg); padding: var(--space-6); box-shadow: var(--shadow-2);
}
.editor-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-4); }
.editor-actions { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-4); }
.spacer { flex: 1; }
</style>
