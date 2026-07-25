<script setup>
// 数据保护:居中弹窗。存储概览 + 导入导出 + 持久化 + 危险区。
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useWorkbenchStore } from '../stores/workbench.js'
import AppIcon from './AppIcon.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import { formatBytes } from '../lib/storageUsage.js'
import { exportLibraryZip, importLibraryZip, exportPresets, importPresets, importRecipe, ImportError } from '../lib/share.js'
import { loadPresets } from '../lib/presets.js'
import { downloadBlob, downloadJson, pickFile } from '../lib/download.js'

const store = useWorkbenchStore()
const emit = defineEmits(['recipe-imported', 'close'])
const busy = ref('')
const toast = ref(null)
const confirmReset = ref(false)
const persisted = ref(null) // null = 未检测, true/false

function showToast(msg, kind = 'ok') {
  toast.value = { msg, kind }
  setTimeout(() => (toast.value = null), 4000)
}

const usagePct = computed(() => {
  const u = store.usage
  if (!u?.browserQuota) return 0
  return Math.min(100, Math.round((u.browserUsage / u.browserQuota) * 100))
})

const health = computed(() => {
  const bytes = store.usage?.businessBytes || 0
  if (bytes < 500 * 1024 * 1024) return { level: 'good', label: '正常', color: 'var(--color-success)' }
  if (bytes < 2 * 1024 * 1024 * 1024) return { level: 'warn', label: '较多,建议导出备份', color: 'var(--color-warning)' }
  return { level: 'danger', label: '很大,建议立即导出备份', color: 'var(--color-destructive)' }
})

async function checkPersisted() {
  try {
    persisted.value = await navigator.storage.persisted()
  } catch { persisted.value = false }
}
async function doPersist() {
  try {
    persisted.value = await navigator.storage.persist()
    showToast(persisted.value ? '持久化存储已启用' : '启用失败,浏览器可能不支持')
  } catch { showToast('启用失败', 'danger') }
}

async function doExportLibrary() {
  busy.value = 'x'
  try {
    const { blob, filename } = await exportLibraryZip()
    downloadBlob(blob, filename)
    showToast('备份成功')
  } finally { busy.value = '' }
}
async function doImportLibrary() {
  const f = await pickFile('.zip'); if (!f) return
  busy.value = 'i'
  try {
    const r = await importLibraryZip(f)
    await store.init()
    let parts = [`图片 ${r.assetCount} 张`, `记录 ${r.genCount} 条`]
    if (r.promptCount) parts.push(`Prompt ${r.promptCount} 条`)
    showToast(`恢复完成: ${parts.join(' · ')}`)
  } catch (e) { showToast(e instanceof ImportError ? e.message : String(e), 'danger') }
  finally { busy.value = '' }
}

function doExportPresets() {
  const d = exportPresets()
  if (!d.presets.length) return showToast('没有可导出的接口预设', 'warn')
  downloadJson(d, 'presets-share.json'); showToast('接口预设已导出(已剥离 Key)')
}
async function doImportPresets() {
  const f = await pickFile('.json'); if (!f) return
  try { const r = importPresets(await f.text()); store.presets = loadPresets(); showToast(`已导入 ${r.presets.length} 个预设,请分别填写 Key`) }
  catch (e) { showToast(e instanceof ImportError ? e.message : String(e), 'danger') }
}
async function doImportRecipe() {
  const f = await pickFile('.json'); if (!f) return
  try {
    const { prefill, needsProtocolNotice } = await importRecipe(await f.text(), store.presets)
    await store.refreshAll(); emit('recipe-imported', prefill)
    showToast(needsProtocolNotice || '配方已载入,可在底部发起复现', needsProtocolNotice ? 'warn' : 'ok')
  } catch (e) { showToast(e instanceof ImportError ? e.message : String(e), 'danger') }
}

async function doReset() {
  confirmReset.value = false
  busy.value = 'r'
  try { await store.resetWorkbench(); showToast('已清空全部素材与记录') }
  finally { busy.value = '' }
}

function onKey(e) {
  if (e.key === 'Escape' && !confirmReset.value) emit('close')
}
onMounted(() => {
  checkPersisted()
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="scrim" @click.self="emit('close')">
    <div class="modal" role="dialog" aria-label="数据保护">
      <header class="modal-head">
        <strong>数据保护</strong>
        <button class="icon-btn" @click="emit('close')" aria-label="关闭">
          <AppIcon name="x" :size="15" />
        </button>
      </header>

      <div class="modal-body">
        <!-- 存储概览 -->
        <section class="dp-section">
          <div class="dp-stats">
            <div class="stat-row">
              <span class="stat-label">素材占用</span>
              <span class="stat-value tnum">{{ formatBytes(store.usage?.businessBytes) }}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">素材数量</span>
              <span class="stat-value tnum">{{ store.assets.length }} 张</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">浏览器剩余</span>
              <span class="stat-value tnum">{{ store.usage?.browserQuota ? formatBytes(store.usage.browserQuota - (store.usage.browserUsage || 0)) : '—' }}</span>
            </div>
            <div class="usage-bar-wrap">
              <div class="usage-bar" role="img" :aria-label="`已用 ${usagePct}%`">
                <div class="usage-fill" :style="{ width: usagePct + '%' }" />
              </div>
            </div>
            <div class="health-row" :style="{ color: health.color }">
              <span class="health-dot" :style="{ background: health.color }" />
              <span class="health-label">{{ health.label }}</span>
            </div>
          </div>
        </section>

        <div class="dp-divider" />

        <section class="dp-section">
          <button class="dp-btn" @click="doExportLibrary" :disabled="busy === 'x'">
            <AppIcon name="download" :size="16" /> 导出备份
          </button>
          <button class="dp-btn" @click="doImportLibrary" :disabled="busy === 'i'">
            <AppIcon name="upload" :size="16" /> 导入备份
          </button>
        </section>

        <div class="dp-divider" />

        <section class="dp-section">
          <div class="persist-row">
            <span class="stat-label">持久化存储</span>
            <span v-if="persisted === true" class="persist-status persist-on">● 已启用</span>
            <span v-else class="persist-status persist-off">● 未启用</span>
          </div>
          <p v-if="persisted === false" class="helper persist-helper">
            启用后浏览器将尽可能避免因空间不足自动清理本应用数据。
          </p>
          <button v-if="persisted === false" class="dp-btn dp-btn-sm" @click="doPersist">
            立即启用
          </button>
        </section>

        <div class="dp-divider" />

        <section class="dp-section dp-secondary">
          <div class="sec-title">分享与导入</div>
          <div class="share-row">
            <button class="btn btn-sm" @click="doExportPresets"><AppIcon name="share" :size="13"/> 导出接口预设</button>
            <button class="btn btn-sm" @click="doImportPresets"><AppIcon name="upload" :size="13"/> 导入接口预设</button>
          </div>
          <button class="btn btn-sm full" @click="doImportRecipe"><AppIcon name="upload" :size="13"/> 导入生成配方</button>
          <p class="helper">所有分享导出均强制剥离 API Key。</p>
        </section>

        <div class="dp-divider" />

        <section class="dp-section dp-danger">
          <div class="sec-title">危险区</div>
          <p class="helper">清空全部素材与生成记录,保留接口预设与 Key。不可撤销。</p>
          <button class="btn btn-sm btn-danger full" @click="confirmReset = true" :disabled="busy === 'r'">
            <AppIcon name="trash" :size="13" /> 清空全部
          </button>
        </section>
      </div>

      <div v-if="toast" class="toast" :class="`toast-${toast.kind}`" role="status" aria-live="polite">{{ toast.msg }}</div>

      <ConfirmDialog
        v-if="confirmReset"
        title="清空全部"
        :message="`将永久删除全部 ${store.assets.length} 张素材与所有生成记录。接口预设与 Key 会保留。此操作不可撤销。`"
        confirm-text="清空全部" danger
        @confirm="doReset" @cancel="confirmReset = false"
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
  position: relative;
}
.modal-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--space-2);
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.modal-head strong {
  font-size: 15px; font-weight: 650; letter-spacing: -0.01em;
}
.icon-btn {
  width: 32px; height: 32px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 10px; color: var(--color-fg-muted); flex-shrink: 0;
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
}
.icon-btn:hover { background: var(--color-surface-2); color: var(--color-fg); }

.modal-body {
  padding: 16px;
  overflow-y: auto;
  flex: 1; min-height: 0;
  display: flex; flex-direction: column; gap: var(--space-3);
}

.dp-section { display: flex; flex-direction: column; gap: var(--space-3); }
.dp-divider { height: 1px; background: var(--color-border); margin: 0; }

.dp-stats { display: flex; flex-direction: column; gap: var(--space-2); }
.stat-row { display: flex; align-items: center; justify-content: space-between; }
.stat-label { font-size: 13px; color: var(--color-fg-muted); }
.stat-value { font-size: 13px; font-weight: 500; color: var(--color-fg); }

.usage-bar-wrap { margin: var(--space-1) 0; }
.usage-bar { height: 6px; border-radius: 999px; background: var(--color-surface-2); overflow: hidden; border: 1px solid var(--color-border); }
.usage-fill { height: 100%; background: linear-gradient(90deg, var(--color-primary), var(--color-accent)); transition: width var(--dur) var(--ease); border-radius: 999px; }

.health-row { display: flex; align-items: center; gap: var(--space-2); font-size: 13px; font-weight: 500; }
.health-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }

.dp-btn {
  display: flex; align-items: center; justify-content: center; gap: var(--space-2);
  width: 100%; padding: var(--space-3); border-radius: var(--radius);
  font-size: 14px; font-weight: 500; color: var(--color-fg);
  background: var(--color-surface-2); border: 1px solid var(--color-border-strong);
  transition: background var(--dur) var(--ease);
}
.dp-btn:hover { background: var(--color-elevated); }
.dp-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.dp-btn-sm { padding: var(--space-2); font-size: 13px; }

.persist-row { display: flex; align-items: center; justify-content: space-between; }
.persist-status { font-size: 12px; font-weight: 500; }
.persist-on { color: var(--color-success); }
.persist-off { color: var(--color-fg-subtle); }
.persist-helper { margin: 0; }

.dp-secondary .sec-title { font-size: 12px; font-weight: 600; color: var(--color-fg-subtle); }
.share-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); }
.full { width: 100%; }

.dp-danger .sec-title { font-size: 12px; font-weight: 600; color: var(--color-destructive); }
.btn-danger.full { display: inline-flex; align-items: center; justify-content: center; gap: 5px; }

.toast {
  position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
  z-index: 5; padding: 10px 14px; border-radius: 999px;
  background: var(--color-elevated); border: 1px solid var(--color-border-strong);
  box-shadow: var(--shadow-2); font-size: 13px; white-space: nowrap;
}
.toast-danger { border-color: var(--color-destructive); }
.toast-warn { border-color: var(--color-warning); }

.helper { font-size: 12px; color: var(--color-fg-subtle); line-height: 1.5; }

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
