<script setup>
// 存储与备份(抽屉内)。用量 + 整库/预设/配方 导入导出。均不含 Key。
import { ref, computed } from 'vue'
import { useWorkbenchStore } from '../stores/workbench.js'
import AppIcon from './AppIcon.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import { formatBytes } from '../lib/storageUsage.js'
import { exportLibraryZip, importLibraryZip, exportPresets, importPresets, importRecipe, ImportError } from '../lib/share.js'
import { loadPresets } from '../lib/presets.js'
import { downloadBlob, downloadJson, pickFile } from '../lib/download.js'

const store = useWorkbenchStore()
const emit = defineEmits(['recipe-imported'])
const busy = ref('')
const toast = ref(null)
const confirmReset = ref(false)

function showToast(msg, kind = 'ok') {
  toast.value = { msg, kind }
  setTimeout(() => (toast.value = null), 4000)
}
const usagePct = computed(() => {
  const u = store.usage
  if (!u?.browserQuota) return 0
  return Math.min(100, Math.round((u.browserUsage / u.browserQuota) * 100))
})

async function doExportLibrary() {
  busy.value = 'x'
  try { downloadBlob(await exportLibraryZip(), `workbench-backup-${store.assets.length}imgs.zip`); showToast('整库已导出为 zip') }
  finally { busy.value = '' }
}
async function doImportLibrary() {
  const f = await pickFile('.zip'); if (!f) return
  busy.value = 'i'
  try { const r = await importLibraryZip(f); await store.init(); showToast(`已导入 ${r.assetCount} 张素材、${r.genCount} 条记录`) }
  catch (e) { showToast(e instanceof ImportError ? e.message : String(e), 'danger') }
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
</script>

<template>
  <div class="backup">
    <section>
      <div class="sec-title">存储用量</div>
      <div class="usage-bar" role="img" :aria-label="`浏览器已用 ${usagePct}%`">
        <div class="usage-fill" :style="{ width: usagePct + '%' }" />
      </div>
      <div class="usage-meta tnum">
        <span>{{ store.assets.length }} 张素材 · {{ formatBytes(store.usage?.businessBytes) }}</span>
        <span v-if="store.usage?.browserQuota">浏览器 {{ formatBytes(store.usage?.browserUsage) }} / {{ formatBytes(store.usage?.browserQuota) }}</span>
      </div>
    </section>

    <section>
      <div class="sec-title">整库备份</div>
      <p class="helper" style="margin-bottom:8px">换机 / 换浏览器时迁移全部素材与历史。</p>
      <div class="row">
        <button class="btn btn-sm" @click="doExportLibrary" :disabled="busy==='x'"><AppIcon name="download" :size="13"/> 导出整库 zip</button>
        <button class="btn btn-sm" @click="doImportLibrary" :disabled="busy==='i'"><AppIcon name="upload" :size="13"/> 导入整库 zip</button>
      </div>
    </section>

    <section>
      <div class="sec-title">分享(不含 Key)</div>
      <div class="row">
        <button class="btn btn-sm" @click="doExportPresets"><AppIcon name="share" :size="13"/> 导出接口预设</button>
        <button class="btn btn-sm" @click="doImportPresets"><AppIcon name="upload" :size="13"/> 导入接口预设</button>
      </div>
      <button class="btn btn-sm full" @click="doImportRecipe"><AppIcon name="upload" :size="13"/> 导入生成配方(复现他人作品)</button>
      <p class="helper">所有分享导出均强制剥离 API Key。</p>
    </section>

    <section class="danger-zone">
      <div class="sec-title">危险区</div>
      <p class="helper" style="margin-bottom:8px">清空全部素材与生成记录,保留接口预设与 Key。不可撤销。</p>
      <button class="btn btn-sm btn-danger full" @click="confirmReset = true" :disabled="busy==='r'">
        <AppIcon name="trash" :size="13" /> 清空全部
      </button>
    </section>

    <div v-if="toast" class="toast" :class="`toast-${toast.kind}`" role="status" aria-live="polite">{{ toast.msg }}</div>

    <ConfirmDialog
      v-if="confirmReset"
      title="清空全部"
      :message="`将永久删除全部 ${store.assets.length} 张素材与所有生成记录。接口预设与 Key 会保留。此操作不可撤销。`"
      confirm-text="清空全部" danger
      @confirm="doReset" @cancel="confirmReset = false"
    />
  </div>
</template>

<style scoped>
.backup { display: flex; flex-direction: column; gap: var(--space-6); }
.sec-title { font-size: 12px; font-weight: 600; color: var(--color-fg); margin-bottom: var(--space-2); }
.usage-bar { height: 8px; border-radius: 999px; background: var(--color-surface-2); overflow: hidden; border: 1px solid var(--color-border); }
.usage-fill { height: 100%; background: linear-gradient(90deg, var(--color-primary), var(--color-accent)); transition: width var(--dur) var(--ease); }
.usage-meta { display: flex; flex-direction: column; gap: 2px; margin-top: var(--space-2); font-size: 11px; color: var(--color-fg-muted); }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); margin-bottom: var(--space-2); }
.full { width: 100%; }
.danger-zone .sec-title { color: var(--color-destructive); }
.btn-danger.full { display: inline-flex; align-items: center; justify-content: center; gap: 5px; }
.toast { position: fixed; bottom: var(--space-6); left: 50%; transform: translateX(-50%); z-index: 200; padding: var(--space-3) var(--space-4); border-radius: var(--radius); background: var(--color-elevated); border: 1px solid var(--color-border-strong); box-shadow: var(--shadow-2); font-size: 13px; }
.toast-danger { border-color: var(--color-destructive); }
.toast-warn { border-color: var(--color-warning); }
</style>
