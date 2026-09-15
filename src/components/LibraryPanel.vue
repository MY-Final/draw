<script setup>
// 右栏(安静):素材库网格 + 来源筛选 + 设为参考 + 预览 + 删除。用量/备份已移入抽屉。
import { ref, computed, watch, onMounted, nextTick, onUnmounted } from 'vue'
import { useWorkbenchStore } from '../stores/workbench.js'
import AssetImage from './AssetImage.vue'
import AppIcon from './AppIcon.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import UndoToast from './UndoToast.vue'
import { normalizeSource, sourceFullLabel, sourceShortLabel } from '../lib/assetSource.js'
import { collectReferencedAssetIds } from '../lib/deletion.js'

const store = useWorkbenchStore()
const emit = defineEmits(['use-as-reference', 'preview'])
const SOURCE_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'generated', label: 'AI 生成' },
  { key: 'reference-uploaded', label: '我的上传' },
  { key: 'imported', label: '导入' },
]
const selected = ref(new Set())
const confirmDelAssets = ref(false)
const deleteNotice = ref('')
const visibleCount = ref(40)
const sentinel = ref(null)
let loadObserver = null
let deleteNoticeTimer = null
onUnmounted(() => { if (deleteNoticeTimer) clearTimeout(deleteNoticeTimer) })

// 来源筛选与收藏筛选叠加;旧记录缺 source 按 generated 处理。
const filteredAssets = computed(() => {
  const list = store.workspaceAssets
  const f = store.assetSourceFilter
  if (f === 'all') return list
  return list.filter((a) => normalizeSource(a.source) === f)
})
const renderedAssets = computed(() => filteredAssets.value.slice(0, visibleCount.value))
const referencedAssetIds = computed(() => new Set(collectReferencedAssetIds({
  assetIds: store.workspaceAssets.map((asset) => asset.id),
  generations: [
    ...store.generations,
    ...Object.values(store.pendingDeletes).map((item) => item.record).filter(Boolean),
  ],
})))

function loadMore() {
  visibleCount.value = Math.min(filteredAssets.value.length, visibleCount.value + 40)
}

function observeSentinel() {
  if (!sentinel.value || !loadObserver) return
  loadObserver.observe(sentinel.value)
}

onMounted(() => {
  loadObserver = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) loadMore()
  }, { rootMargin: '240px' })
  nextTick(observeSentinel)
})
onUnmounted(() => loadObserver?.disconnect())
// 切换筛选/收藏后清空选择:避免选中项被过滤隐藏,删除按钮数字却还带着它们
watch(() => [store.assetSourceFilter, store.favoritesOnly], () => {
  selected.value = new Set()
  visibleCount.value = 40
  nextTick(observeSentinel)
})

function toggleSelect(id) {
  const s = new Set(selected.value)
  s.has(id) ? s.delete(id) : s.add(id)
  selected.value = s
}
function askDeleteSelected() {
  if (!selected.value.size) return
  confirmDelAssets.value = true
}
function isReferenced(id) { return referencedAssetIds.value.has(id) }
function showDeleteNotice(text) {
  deleteNotice.value = text
  if (deleteNoticeTimer) clearTimeout(deleteNoticeTimer)
  deleteNoticeTimer = setTimeout(() => { deleteNotice.value = '' }, 5000)
}
async function toggleFavorite(id) {
  try {
    await store.toggleAssetFavorite(id)
  } catch (e) {
    await store.refreshAll().catch(() => {})
    deleteNotice.value = `收藏状态更新失败：${e?.message || '请重试'}`
  }
}
async function doDeleteSelected() {
  confirmDelAssets.value = false
  if (!selected.value.size) return
  try {
    const result = await store.removeAssetsWithUndo([...selected.value])
    selected.value = new Set(result.blockedIds)
    if (result.blockedIds.length) {
      showDeleteNotice(result.deletedIds.length
        ? `已删除 ${result.deletedIds.length} 张；${result.blockedIds.length} 张仍被生成记录引用，已保留。`
        : `所选素材仍被生成记录引用，不能直接删除。请先删除相关生成记录。`)
    } else {
      deleteNotice.value = ''
    }
  } catch (e) {
    selected.value = new Set()
    await store.refreshAll().catch(() => {})
    showDeleteNotice(`删除素材失败：${e?.message || '请重试'}`)
  }
}
async function deleteSingle(asset) {
  if (isReferenced(asset.id)) {
    showDeleteNotice('该素材被生成记录引用，无法删除。请先删除相关生成记录。')
    return
  }
  try {
    const result = await store.removeAssetsWithUndo([asset.id])
    selected.value = new Set([...selected.value].filter((id) => id !== asset.id))
    if (result.blockedIds.length) {
      showDeleteNotice('该素材被生成记录引用，无法删除。请先删除相关生成记录。')
    } else {
      deleteNotice.value = ''
    }
  } catch (e) {
    await store.refreshAll().catch(() => {})
    showDeleteNotice(`删除素材失败：${e?.message || '请重试'}`)
  }
}
async function undoAssetDelete() {
  const batch = store.pendingAssetDelete
  if (!batch) return
  await store.undoAssetDelete(batch.batchId)
}
</script>

<template>
  <div class="library">
    <div class="lib-head">
      <span class="lib-title">素材库</span>
      <div class="lib-head-actions">
        <button
          class="filter-btn" :class="{ on: store.favoritesOnly }"
          @click="store.setFavoritesOnly(!store.favoritesOnly)"
          :aria-pressed="store.favoritesOnly" title="仅看收藏"
        >
          <AppIcon name="heart" :size="13" />
        </button>
         <button
           v-if="selected.size"
           type="button"
           class="btn btn-sm btn-danger"
           @click="askDeleteSelected"
           :aria-label="`删除选中的 ${selected.size} 张素材`"
           title="删除选中的素材"
         >
          <AppIcon name="trash" :size="13" /> {{ selected.size }}
        </button>
        <span v-else class="lib-count tnum">{{ filteredAssets.length }} 张</span>
      </div>
    </div>

    <!-- 来源筛选:AI 生成 / 我的上传 / 导入,一眼区分 -->
    <div class="lib-filters" role="group" aria-label="素材来源筛选">
      <button
        v-for="f in SOURCE_FILTERS" :key="f.key"
        class="src-filter" :class="{ active: store.assetSourceFilter === f.key }"
        @click="store.setAssetSourceFilter(f.key)"
        :aria-pressed="store.assetSourceFilter === f.key"
      >{{ f.label }}</button>
    </div>

    <div v-if="deleteNotice" class="delete-notice" role="status" aria-live="polite">
      <AppIcon name="alert" :size="13" />
      <span>{{ deleteNotice }}</span>
    </div>

    <div v-if="!store.workspaceAssets.length" class="lib-empty">
      <div class="lib-empty-mosaic" aria-hidden="true">
        <span class="tile t1" />
        <span class="tile t2" />
        <span class="tile t3" />
        <span class="tile t4" />
      </div>
      <div class="lib-empty-icon">
        <AppIcon :name="store.favoritesOnly ? 'heart' : 'image'" :size="18" />
      </div>
      <p class="lib-empty-title">{{ store.favoritesOnly ? '还没有收藏' : '素材库是空的' }}</p>
      <p class="lib-empty-desc">
        {{ store.favoritesOnly ? '给喜欢的结果点心，会出现在这里。' : '生成的图片会自动落在这里，可拖到输入区当参考图。' }}
      </p>
    </div>

    <div v-else-if="!filteredAssets.length" class="lib-empty">
      <div class="lib-empty-icon"><AppIcon name="layers" :size="18" /></div>
      <p class="lib-empty-title">该分类下暂无素材</p>
      <p class="lib-empty-desc">切换其他来源分类看看。</p>
    </div>

    <div v-else class="grid">
       <div v-for="a in renderedAssets" :key="a.id" class="cell" :class="{ selected: selected.has(a.id) }"
        draggable="true"
        @dragstart="(e) => { e.dataTransfer.setData('application/json', JSON.stringify({ assetId: a.id })) }"
      >
         <button class="cell-img" @click="emit('preview', { asset: a, list: filteredAssets })" aria-label="预览大图">
           <AssetImage :asset="a" />
         </button>
         <span v-if="a.favorite" class="fav-dot" aria-hidden="true"><AppIcon name="heart" :size="11" /></span>
         <span
           v-if="isReferenced(a.id)"
           class="asset-reference-note"
           title="该素材被生成记录引用，无法删除"
         >已引用</span>
         <span class="src-badge" :class="normalizeSource(a.source)" :title="sourceFullLabel(a.source)">
           {{ sourceShortLabel(a.source) }}
         </span>
         <div class="cell-actions">
           <button type="button" class="mini" @click="toggleFavorite(a.id)" :class="{ on: a.favorite }" :aria-label="a.favorite ? '取消收藏' : '收藏'">
             <AppIcon name="heart" :size="12" />
           </button>
           <button type="button" class="mini" @click="toggleSelect(a.id)" :aria-label="selected.has(a.id) ? '取消选择' : '选择'">
             <AppIcon :name="selected.has(a.id) ? 'check' : 'plus'" :size="12" />
           </button>
           <button type="button" class="mini" @click="emit('use-as-reference', a.id)" title="设为参考图" aria-label="设为参考图">
             <AppIcon name="layers" :size="12" />
           </button>
           <button
             type="button"
             class="mini mini-danger"
             :disabled="isReferenced(a.id)"
             @click="deleteSingle(a)"
             :title="isReferenced(a.id) ? '该素材被生成记录引用，无法删除' : '删除素材（可撤销）'"
             :aria-label="isReferenced(a.id) ? '该素材被生成记录引用，无法删除' : '删除素材（可撤销）'"
           >
             <AppIcon name="trash" :size="12" />
           </button>
         </div>
      </div>
      <button v-if="renderedAssets.length < filteredAssets.length" ref="sentinel" class="load-more" type="button" @click="loadMore">
        加载更多素材（{{ filteredAssets.length - renderedAssets.length }}）
      </button>
    </div>

    <UndoToast
      v-if="store.pendingAssetDelete"
      :message="`已移除 ${store.pendingAssetDelete.ids.length} 张素材，5 秒内可撤销`"
      @undo="undoAssetDelete"
    />
    <ConfirmDialog
      v-if="confirmDelAssets"
      title="删除素材"
      :message="`将删除选中的 ${selected.size} 张素材。仍被生成记录引用的素材会保留，其余删除后不可恢复。`"
      confirm-text="删除" danger
      @confirm="doDeleteSelected" @cancel="confirmDelAssets = false"
    />
  </div>
</template>

<style scoped>
.library { display: flex; flex-direction: column; gap: var(--space-3); height: 100%; }
.lib-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.lib-head-actions { display: flex; align-items: center; gap: var(--space-2); }
.filter-btn {
  width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
  border-radius: 999px; border: 1px solid var(--color-border); color: var(--color-fg-subtle);
  background: var(--color-surface-2);
  transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.filter-btn:hover { color: var(--color-fg-muted); border-color: var(--color-border-strong); }
.filter-btn.on {
  color: var(--color-heart);
  border-color: color-mix(in srgb, var(--color-heart) 40%, transparent);
  background: color-mix(in srgb, var(--color-heart) 12%, transparent);
}
.filter-btn.on :deep(svg) { fill: var(--color-heart); }
.lib-title { font-size: 12px; font-weight: 650; letter-spacing: 0.04em; text-transform: uppercase; color: var(--color-fg-subtle); }

.lib-filters { display: flex; gap: 4px; flex-wrap: wrap; }
.src-filter {
  padding: 3px 9px; border-radius: 999px; font-size: 11px;
  color: var(--color-fg-muted); background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  transition: color var(--dur) var(--ease), background var(--dur) var(--ease), border-color var(--dur) var(--ease);
}
.src-filter:hover { color: var(--color-fg); border-color: var(--color-border-strong); }
.src-filter.active {
  color: var(--color-on-primary); background: var(--color-primary);
  border-color: color-mix(in srgb, var(--color-primary) 70%, #000);
}

.delete-notice {
  display: flex; align-items: flex-start; gap: 7px;
  padding: 8px 10px; border-radius: 10px;
  font-size: 11px; line-height: 1.45; color: var(--color-warning);
  background: color-mix(in srgb, var(--color-warning) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-warning) 24%, transparent);
}
.delete-notice svg { flex-shrink: 0; margin-top: 1px; }
.lib-count {
  font-size: 11px; color: var(--color-fg-subtle);
  min-height: 22px; padding: 0 8px; border-radius: 999px;
  display: inline-flex; align-items: center;
  background: var(--color-surface-2); border: 1px solid var(--color-border);
}
.lib-empty {
  display: flex; flex-direction: column; align-items: center; gap: var(--space-2);
  color: var(--color-fg-subtle); padding: var(--space-6) var(--space-2) var(--space-8);
  text-align: center; position: relative;
}
.lib-empty-mosaic {
  display: grid; grid-template-columns: 1fr 1fr; gap: 6px;
  width: 112px; margin-bottom: var(--space-2);
}
.tile {
  display: block; border-radius: 10px; aspect-ratio: 1;
  border: 1px solid var(--color-border);
  background: var(--color-surface-2);
  opacity: 0.85;
}
.tile.t1 { transform: rotate(-4deg); opacity: 0.7; }
.tile.t2 { transform: rotate(3deg); margin-top: 8px; opacity: 0.55; }
.tile.t3 { transform: rotate(2deg); margin-top: -4px; opacity: 0.6; }
.tile.t4 {
  transform: rotate(-2deg); margin-top: 4px; opacity: 0.75;
  background: var(--color-elevated);
}
.lib-empty-icon {
  width: 36px; height: 36px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  color: var(--color-primary);
  background: var(--color-primary-soft);
  border: 1px solid color-mix(in srgb, var(--color-primary) 22%, transparent);
  margin-top: calc(-1 * var(--space-2));
}
.lib-empty-title {
  margin: var(--space-1) 0 0; font-size: 13px; font-weight: 600;
  color: var(--color-fg-muted);
}
.lib-empty-desc {
  margin: 0; font-size: 12px; line-height: 1.55; max-width: 16em;
  color: var(--color-fg-subtle);
}
.grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.cell {
  position: relative; border-radius: 14px; overflow: hidden;
  border: 1.5px solid transparent; background: var(--color-surface-2); aspect-ratio: 1;
  transition: border-color var(--dur) var(--ease), transform var(--dur) var(--ease);
}
.cell:hover {
  transform: translateY(-1px);
}
.cell.selected {
  border-color: var(--color-primary);
}
.cell-img { display: block; width: 100%; height: 100%; padding: 0; }
.fav-dot {
  position: absolute; top: 6px; left: 6px; width: 22px; height: 22px;
  display: flex; align-items: center; justify-content: center; border-radius: 50%;
  background: rgba(0,0,0,0.52); color: var(--color-heart);
}
.fav-dot :deep(svg) { fill: var(--color-heart); }
.src-badge {
  position: absolute; left: 6px; bottom: 6px;
  font-size: 9px; font-weight: 700; line-height: 1;
  padding: 3px 5px; border-radius: 5px;
  color: #fff; background: rgba(0,0,0,0.58);
}
.asset-reference-note {
  position: absolute; right: 6px; bottom: 6px;
  max-width: calc(100% - 56px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  padding: 3px 5px; border-radius: 5px; font-size: 9px; line-height: 1;
  color: var(--color-warning); background: rgba(0,0,0,0.66);
}
.cell-actions {
  position: absolute; top: 6px; right: 6px; display: flex; gap: 4px;
  opacity: 0; transition: opacity var(--dur) var(--ease);
}
.cell:hover .cell-actions, .cell.selected .cell-actions, .cell:focus-within .cell-actions { opacity: 1; }
/* 触屏无 hover:操作钮常显,避免摸不到收藏/参考 */
@media (hover: none) {
  .cell-actions { opacity: 0.95; }
}
.mini {
  width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;
  border-radius: 8px; background: rgba(0,0,0,0.58); color: #fff;
  transition: transform var(--dur) var(--ease), background var(--dur) var(--ease);
}
.mini:hover { transform: scale(1.05); background: rgba(0,0,0,0.72); }
.mini:disabled { opacity: 0.4; cursor: not-allowed; }
.mini-danger:hover:not(:disabled) { color: #fecaca; background: color-mix(in srgb, var(--color-destructive) 70%, #000); }
.mini.on { color: var(--color-heart); }
.mini.on :deep(svg) { fill: var(--color-heart); }
.load-more {
  width: 100%; min-height: 34px; margin-top: var(--space-2); border-radius: var(--radius-sm);
  border: 1px dashed var(--color-border-strong); color: var(--color-fg-muted);
  font-size: 12px; background: transparent;
}
.load-more:hover { color: var(--color-fg); background: var(--color-surface-2); }
</style>
