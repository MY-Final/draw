<script setup>
// 数据保护:居中弹窗。存储概览 + 导入导出 + 持久化 + 危险区。
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWorkbenchStore } from '../stores/workbench.js'
import AppIcon from './AppIcon.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import { formatBytes } from '../lib/storageUsage.js'
import { exportLibraryZip, importLibraryZip, exportPresets, importPresets, importRecipe, ImportError } from '../lib/share.js'
import { loadPresets } from '../lib/presets.js'
import { downloadBlob, downloadJson, pickFile } from '../lib/download.js'
import { useDialogA11y } from '../composables/useDialogA11y.js'

const store = useWorkbenchStore()
const { t } = useI18n()
const emit = defineEmits(['recipe-imported', 'close'])
const busy = ref('')
const toast = ref(null)
const confirmReset = ref(false)
const confirmClearImages = ref(false)
const persisted = ref(null) // null = 未检测, true/false
const modal = ref(null)
useDialogA11y(modal, () => { if (!confirmReset.value) emit('close') })

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
  if (bytes < 500 * 1024 * 1024) return { level: 'good', label: t('backup.healthGood'), color: 'var(--color-success)' }
  if (bytes < 2 * 1024 * 1024 * 1024) return { level: 'warn', label: t('backup.healthWarn'), color: 'var(--color-warning)' }
  return { level: 'danger', label: t('backup.healthDanger'), color: 'var(--color-destructive)' }
})

async function checkPersisted() {
  try {
    persisted.value = await navigator.storage.persisted()
  } catch { persisted.value = false }
}
async function doPersist() {
  try {
    persisted.value = await navigator.storage.persist()
    showToast(persisted.value ? t('backup.persistEnabled') : t('backup.persistUnsupported'))
  } catch { showToast(t('backup.persistFailed'), 'danger') }
}

async function doExportLibrary() {
  busy.value = 'x'
  try {
    const { blob, filename } = await exportLibraryZip()
    downloadBlob(blob, filename)
    showToast(t('backup.backupSuccess'))
  } catch (e) {
    showToast(t('backup.backupFailed', { message: e?.message || t('backup.retryHint') }), 'danger')
  } finally { busy.value = '' }
}
// 整库导入可能持续几十秒,所以既要有进度,也要把「合并而不是清空」讲清楚。
const importProgress = ref(null) // { label, percent }
async function doImportLibrary() {
  const f = await pickFile('.zip'); if (!f) return
  busy.value = 'i'
  importProgress.value = { label: t('backup.readingBackup'), percent: 0 }
  try {
    const r = await importLibraryZip(f, {
      onProgress: ({ phase, done, total }) => {
        if (phase === 'read') {
          const percent = total ? Math.round((done / total) * 90) : 0
          importProgress.value = { label: t('backup.importingImages', { done, total: total || '?' }), percent }
        } else {
          importProgress.value = { label: t('backup.writingDatabase'), percent: 95 }
        }
      },
    })
    await store.init()
    let parts = [t('backup.importDoneAssets', { count: r.assetCount }), t('backup.importDoneGenerations', { count: r.genCount })]
    if (r.promptCount) parts.push(t('backup.importDonePrompts', { count: r.promptCount }))
    showToast(t('backup.restoreComplete', { parts: parts.join(' · ') }))
  } catch (e) { showToast(e instanceof ImportError ? e.message : String(e), 'danger') }
  finally { busy.value = ''; importProgress.value = null }
}

function doExportPresets() {
  const d = exportPresets()
  if (!d.presets.length) return showToast(t('backup.noPresetsToExport'), 'warn')
  downloadJson(d, 'presets-share.json'); showToast(t('backup.presetsExported'))
}
async function doImportPresets() {
  const f = await pickFile('.json'); if (!f) return
  try { const r = importPresets(await f.text()); store.presets = loadPresets(); showToast(t('backup.presetsImported', { count: r.presets.length })) }
  catch (e) { showToast(e instanceof ImportError ? e.message : String(e), 'danger') }
}
async function doImportRecipe() {
  const f = await pickFile('.json'); if (!f) return
  try {
    const { prefill, needsProtocolNotice } = await importRecipe(await f.text(), store.presets, store.activeWorkspaceId)
    await store.refreshAll(); emit('recipe-imported', prefill)
    showToast(needsProtocolNotice || t('backup.recipeLoaded'), needsProtocolNotice ? 'warn' : 'ok')
  } catch (e) { showToast(e instanceof ImportError ? e.message : String(e), 'danger') }
}

async function doReset() {
  confirmReset.value = false
  busy.value = 'r'
  try {
    await store.resetWorkbench()
    showToast(t('backup.resetSuccess'))
  } catch (e) {
    await store.refreshAll().catch(() => {})
    showToast(t('backup.resetFailed', { message: e?.message || t('backup.retryHint') }), 'danger')
  }
  finally { busy.value = '' }
}

async function doClearImages() {
  confirmClearImages.value = false
  busy.value = 'images'
  try {
    await store.clearStoredImages()
    showToast(t('backup.clearImagesSuccess'))
  } catch (e) {
    await store.refreshAll().catch(() => {})
    showToast(t('backup.clearImagesFailed', { message: e?.message || t('backup.retryHint') }), 'danger')
  }
  finally { busy.value = '' }
}

onMounted(() => {
  checkPersisted()
})
</script>

<template>
  <div class="scrim" @click.self="emit('close')">
    <div ref="modal" class="modal" role="dialog" aria-modal="true" :aria-label="t('sidebar.dataProtection')" tabindex="-1">
      <header class="modal-head">
        <strong>{{ t('sidebar.dataProtection') }}</strong>
        <button class="icon-btn" @click="emit('close')" :aria-label="t('common.close')">
          <AppIcon name="x" :size="15" />
        </button>
      </header>

      <div class="modal-body">
        <!-- 存储概览 -->
        <section class="dp-section">
          <div class="dp-stats">
            <div class="stat-row">
              <span class="stat-label">{{ t('backup.storageUsed') }}</span>
              <span class="stat-value tnum">{{ formatBytes(store.usage?.businessBytes) }}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">{{ t('backup.assetCount') }}</span>
              <span class="stat-value tnum">{{ t('backup.assetCountValue', { count: store.assets.length }) }}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">{{ t('backup.browserFree') }}</span>
              <span class="stat-value tnum">{{ store.usage?.browserQuota ? formatBytes(store.usage.browserQuota - (store.usage.browserUsage || 0)) : '—' }}</span>
            </div>
            <div class="usage-bar-wrap">
              <div class="usage-bar" role="img" :aria-label="t('backup.usedPercent', { percent: usagePct })">
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
            <AppIcon name="download" :size="16" /> {{ t('backup.exportBackup') }}
          </button>
          <button class="dp-btn" @click="doImportLibrary" :disabled="busy === 'i'">
            <AppIcon name="upload" :size="16" /> {{ t('backup.importBackup') }}
          </button>
          <div v-if="importProgress" class="import-progress" role="status" aria-live="polite">
            <div class="import-progress-text">{{ importProgress.label }}</div>
            <div class="usage-bar" :aria-label="t('backup.importProgressAria', { percent: importProgress.percent })">
              <div class="usage-fill" :style="{ width: importProgress.percent + '%' }" />
            </div>
          </div>
          <p v-else class="helper">
            {{ t('backup.importMergeHint') }}
          </p>
        </section>

        <div class="dp-divider" />

        <section class="dp-section">
          <div class="persist-row">
            <span class="stat-label">{{ t('backup.persistentStorage') }}</span>
            <span v-if="persisted === true" class="persist-status persist-on">{{ t('backup.persistOn') }}</span>
            <span v-else class="persist-status persist-off">{{ t('backup.persistOff') }}</span>
          </div>
          <p v-if="persisted === false" class="helper persist-helper">
            {{ t('backup.persistHint') }}
          </p>
          <button v-if="persisted === false" class="dp-btn dp-btn-sm" @click="doPersist">
            {{ t('backup.enableNow') }}
          </button>
        </section>

        <div class="dp-divider" />

        <section class="dp-section dp-secondary">
          <div class="sec-title">{{ t('backup.shareAndImport') }}</div>
          <div class="share-row">
            <button class="btn btn-sm" @click="doExportPresets"><AppIcon name="share" :size="13"/> {{ t('backup.exportPresets') }}</button>
            <button class="btn btn-sm" @click="doImportPresets"><AppIcon name="upload" :size="13"/> {{ t('backup.importPresets') }}</button>
          </div>
          <button class="btn btn-sm full" @click="doImportRecipe"><AppIcon name="upload" :size="13"/> {{ t('backup.importRecipe') }}</button>
          <p class="helper">{{ t('backup.shareStripsKeys') }}</p>
        </section>

        <div class="dp-divider" />

        <section class="dp-section dp-danger">
          <div class="sec-title">{{ t('backup.dangerZone') }}</div>
          <div class="danger-action">
            <div>
              <strong>{{ t('backup.clearImages') }}</strong>
              <p class="helper">{{ t('backup.clearImagesHint') }}</p>
            </div>
            <button class="btn btn-sm btn-danger full" @click="confirmClearImages = true" :disabled="busy || !store.assets.length">
              <AppIcon name="trash" :size="13" /> {{ t('backup.clearImagesAction') }}
            </button>
          </div>
          <div class="danger-action">
            <div>
              <strong>{{ t('backup.resetAll') }}</strong>
              <p class="helper">{{ t('backup.resetAllHint') }}</p>
            </div>
            <button class="btn btn-sm btn-danger full" @click="confirmReset = true" :disabled="busy || (!store.assets.length && !store.generations.length)">
              <AppIcon name="trash" :size="13" /> {{ t('backup.resetAllAction') }}
            </button>
          </div>
        </section>
      </div>

      <div v-if="toast" class="toast" :class="`toast-${toast.kind}`" role="status" aria-live="polite">{{ toast.msg }}</div>

      <ConfirmDialog
        v-if="confirmClearImages"
        :title="t('backup.clearImages')"
        :message="t('backup.clearImagesConfirm', { count: store.assets.length })"
        :confirm-text="t('backup.clearImagesAction')" danger
        @confirm="doClearImages" @cancel="confirmClearImages = false"
      />
      <ConfirmDialog
        v-if="confirmReset"
        :title="t('backup.resetAllAction')"
        :message="t('backup.resetConfirm', { count: store.assets.length })"
        :confirm-text="t('backup.resetAllAction')" danger
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
.usage-fill { height: 100%; background: var(--color-primary); transition: width var(--dur) var(--ease); border-radius: 999px; }

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
.danger-action { display: flex; flex-direction: column; gap: 8px; }
.danger-action + .danger-action { padding-top: 12px; border-top: 1px solid color-mix(in srgb, var(--color-destructive) 16%, var(--color-border)); }
.danger-action strong { font-size: 13px; font-weight: 600; color: var(--color-fg); }
.danger-action .helper { margin: 3px 0 0; }
.btn-danger.full { display: inline-flex; align-items: center; justify-content: center; gap: 5px; }

.toast {
  position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
  z-index: 5; padding: 10px 14px; border-radius: 999px;
  background: var(--color-elevated); border: 1px solid var(--color-border-strong);
  font-size: 13px; white-space: nowrap;
}
.toast-danger { border-color: var(--color-destructive); }
.toast-warn { border-color: var(--color-warning); }

.helper { font-size: 12px; color: var(--color-fg-subtle); line-height: 1.5; }
.import-progress { display: flex; flex-direction: column; gap: 6px; padding: 2px 0; }
.import-progress-text { font-size: 12px; color: var(--color-fg-muted); }

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
