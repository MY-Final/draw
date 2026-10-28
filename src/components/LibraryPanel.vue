<script setup>
// 右栏(安静):素材库网格 + 来源筛选 + 设为参考 + 预览 + 删除。用量/备份已移入抽屉。
import { ref, computed, watch, onMounted, nextTick, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWorkbenchStore } from '../stores/workbench.js'
import AssetImage from './AssetImage.vue'
import AppIcon from './AppIcon.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import { normalizeSource, sourceFullLabel, sourceShortLabel } from '../lib/assetSource.js'
import { collectReferencedAssetIds } from '../lib/deletion.js'

const store = useWorkbenchStore()
const { t } = useI18n()
const emit = defineEmits(['use-as-reference', 'preview'])
const SOURCE_FILTERS = computed(() => [
  { key: 'all', label: t('library.sourceAll') },
  { key: 'generated', label: t('library.sourceGenerated') },
  { key: 'reference-uploaded', label: t('library.sourceUploaded') },
  { key: 'imported', label: t('library.sourceImported') },
])
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
    deleteNotice.value = t('library.favoriteFailed', { message: e?.message || t('library.retryHint') })
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
        ? t('library.deletePartial', { deleted: result.deletedIds.length, blocked: result.blockedIds.length })
        : t('library.deleteAllBlocked'))
    } else {
      deleteNotice.value = ''
    }
  } catch (e) {
    selected.value = new Set()
    await store.refreshAll().catch(() => {})
    showDeleteNotice(t('library.deleteFailed', { message: e?.message || t('library.retryHint') }))
  }
}
async function deleteSingle(asset) {
  if (isReferenced(asset.id)) {
    showDeleteNotice(t('library.assetReferenced'))
    return
  }
  try {
    const result = await store.removeAssetsWithUndo([asset.id])
    selected.value = new Set([...selected.value].filter((id) => id !== asset.id))
    if (result.blockedIds.length) {
      showDeleteNotice(t('library.assetReferenced'))
    } else {
      deleteNotice.value = ''
    }
  } catch (e) {
    await store.refreshAll().catch(() => {})
    showDeleteNotice(t('library.deleteFailed', { message: e?.message || t('library.retryHint') }))
  }
}

</script>

<template>
  <div class="library">
    <div class="lib-head">
      <span class="lib-title">{{ t('library.title') }}</span>
      <div class="lib-head-actions">
        <button
          class="filter-btn" :class="{ on: store.favoritesOnly }"
          @click="store.setFavoritesOnly(!store.favoritesOnly)"
          :aria-pressed="store.favoritesOnly" :title="t('library.favoritesOnly')"
        >
          <AppIcon name="heart" :size="13" />
        </button>
         <button
           v-if="selected.size"
           type="button"
           class="btn btn-sm btn-danger"
           @click="askDeleteSelected"
           :aria-label="t('library.deleteSelectedAria', { count: selected.size })"
           :title="t('library.deleteSelectedTitle')"
         >
          <AppIcon name="trash" :size="13" /> {{ selected.size }}
        </button>
        <span v-else class="lib-count tnum">{{ t('library.count', { count: filteredAssets.length }) }}</span>
      </div>
    </div>

    <!-- 来源筛选:AI 生成 / 我的上传 / 导入,一眼区分 -->
    <div class="lib-filters" role="group" :aria-label="t('library.sourceFilterAria')">
      <button
        v-for="f in SOURCE_FILTERS" :key="f.key"
        class="src-filter" :class="{ active: store.assetSourceFilter === f.key }"
        @click="store.setAssetSourceFilter(f.key)"
        :aria-pressed="store.assetSourceFilter === f.key"
      >
        <span class="swatch" :class="f.key" aria-hidden="true" />{{ f.label }}
      </button>
    </div>

    <div v-if="deleteNotice" class="delete-notice" role="status" aria-live="polite">
      <AppIcon name="alert" :size="13" />
      <span>{{ deleteNotice }}</span>
    </div>

    <div v-if="!store.workspaceAssets.length" class="lib-empty">
      <div class="lib-empty-icon">
        <AppIcon :name="store.favoritesOnly ? 'heart' : 'image'" :size="20" />
      </div>
      <p class="lib-empty-title">{{ store.favoritesOnly ? t('library.emptyFavoritesTitle') : t('library.emptyTitle') }}</p>
      <p class="lib-empty-desc">
        {{ store.favoritesOnly ? t('library.emptyFavoritesDesc') : t('library.emptyDesc') }}
      </p>
    </div>

    <div v-else-if="!filteredAssets.length" class="lib-empty">
      <div class="lib-empty-icon"><AppIcon name="layers" :size="18" /></div>
      <p class="lib-empty-title">{{ t('library.filterEmptyTitle') }}</p>
      <p class="lib-empty-desc">{{ t('library.filterEmptyDesc') }}</p>
    </div>

    <div v-else class="grid">
       <div v-for="a in renderedAssets" :key="a.id" class="cell" :class="{ selected: selected.has(a.id) }"
        draggable="true"
        @dragstart="(e) => { e.dataTransfer.setData('application/json', JSON.stringify({ assetId: a.id })) }"
      >
         <button class="cell-img" @click="emit('preview', { asset: a, list: filteredAssets })" :aria-label="t('library.previewAria')">
           <AssetImage :asset="a" />
         </button>
         <span v-if="a.favorite" class="fav-dot" aria-hidden="true"><AppIcon name="heart" :size="11" /></span>
         <span
           v-if="isReferenced(a.id)"
            class="asset-reference-note"
            :title="t('library.referencedHint')"
          >{{ t('library.referenced') }}</span>
         <span class="src-badge" :class="normalizeSource(a.source)" :title="sourceFullLabel(a.source)">
           {{ sourceShortLabel(a.source) }}
         </span>
         <div class="cell-actions">
            <button type="button" class="mini" @click="toggleFavorite(a.id)" :class="{ on: a.favorite }" :aria-label="a.favorite ? t('library.favoriteRemoveAria') : t('library.favoriteAddAria')">
              <AppIcon name="heart" :size="12" />
            </button>
            <button type="button" class="mini" @click="toggleSelect(a.id)" :aria-label="selected.has(a.id) ? t('library.deselectAria') : t('library.selectAria')">
              <AppIcon :name="selected.has(a.id) ? 'check' : 'plus'" :size="12" />
            </button>
            <button type="button" class="mini" @click="emit('use-as-reference', a.id)" :title="t('library.useAsReferenceTitle')" :aria-label="t('library.useAsReferenceAria')">
             <AppIcon name="layers" :size="12" />
           </button>
           <button
             type="button"
             class="mini mini-danger"
             :disabled="isReferenced(a.id)"
             @click="deleteSingle(a)"
              :title="isReferenced(a.id) ? t('library.referencedHint') : t('library.deleteAssetUndoTitle')"
              :aria-label="isReferenced(a.id) ? t('library.referencedHint') : t('library.deleteAssetUndoTitle')"
           >
             <AppIcon name="trash" :size="12" />
           </button>
         </div>
      </div>
      <button v-if="renderedAssets.length < filteredAssets.length" ref="sentinel" class="load-more" type="button" @click="loadMore">
        {{ t('library.loadMore', { count: filteredAssets.length - renderedAssets.length }) }}
      </button>
    </div>


    <ConfirmDialog
      v-if="confirmDelAssets"
      :title="t('library.confirmDeleteTitle')"
      :message="t('library.confirmDeleteMessage', { count: selected.size })"
      :confirm-text="t('common.delete')" danger
      @confirm="doDeleteSelected" @cancel="confirmDelAssets = false"
    />
  </div>
</template>

<style scoped>
.library { display: flex; flex-direction: column; gap: var(--space-3); height: 100%; }
.lib-head {
  display: flex; align-items: center; justify-content: space-between; gap: var(--space-2);
  padding-bottom: 9px;
  border-bottom: 1px solid var(--color-border-strong);
}
.lib-head-actions { display: flex; align-items: center; gap: 6px; }
.lib-title {
  font-size: 13px; font-weight: 700; letter-spacing: -0.015em;
  color: var(--color-fg);
}
.filter-btn {
  width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border); color: var(--color-fg-subtle);
  background: transparent;
  transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.filter-btn:hover { color: var(--color-fg-muted); border-color: var(--color-border-strong); }
.filter-btn.on {
  color: var(--color-heart);
  border-color: color-mix(in srgb, var(--color-heart) 45%, transparent);
  background: color-mix(in srgb, var(--color-heart) 8%, transparent);
}
.filter-btn.on :deep(svg) { fill: var(--color-heart); }
.lib-count {
  font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.04em;
  color: var(--color-fg-subtle);
  min-height: 20px; padding: 0 6px; border-radius: var(--radius-sm);
  display: inline-flex; align-items: center;
  border: 1px solid var(--color-border);
}

.lib-filters { display: flex; gap: 4px; flex-wrap: wrap; }
.src-filter {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 8px; border-radius: var(--radius-sm);
  font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.02em;
  color: var(--color-fg-muted);
  border: 1px solid var(--color-border);
  background: transparent;
  transition: color var(--dur) var(--ease), background var(--dur) var(--ease), border-color var(--dur) var(--ease);
}
.src-filter:hover { color: var(--color-fg); border-color: var(--color-border-strong); }
.src-filter.active {
  color: var(--color-on-ink); background: var(--color-ink); border-color: var(--color-ink);
}
.swatch { width: 7px; height: 7px; flex-shrink: 0; background: var(--color-ink); }
.swatch.generated { background: var(--color-primary); }
.swatch.reference-uploaded { background: var(--color-destructive); }
.swatch.imported { background: var(--color-accent); }
.src-filter.active .swatch { background: var(--color-on-ink); }
:root[data-theme='dark'] .src-filter.active {
  color: var(--color-on-primary);
  background: var(--color-primary);
  border-color: var(--color-primary);
}
:root[data-theme='dark'] .src-filter.active .swatch { background: var(--color-on-primary); }

.delete-notice {
  display: flex; align-items: flex-start; gap: 7px;
  padding: 7px 9px; border-radius: var(--radius-sm);
  font-size: 10.5px; line-height: 1.45; color: var(--color-warning);
  background: color-mix(in srgb, var(--color-warning) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-warning) 30%, transparent);
}
.delete-notice svg { flex-shrink: 0; margin-top: 1px; }

.lib-empty {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  color: var(--color-fg-subtle); padding: 44px var(--space-3) 32px;
  text-align: center;
}
.lib-empty-icon {
  display: flex; align-items: center; justify-content: center;
  color: var(--color-fg-subtle);
  margin-bottom: 2px;
}
.lib-empty-title {
  margin: 0; font-size: 12.5px; font-weight: 600;
  color: var(--color-fg-muted);
}
.lib-empty-desc {
  margin: 0; font-size: 11px; line-height: 1.65; max-width: 22em;
  color: var(--color-fg-subtle);
}

.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.cell {
  position: relative; overflow: hidden;
  border: 1px solid var(--color-border);
  background: var(--color-surface-2);
  aspect-ratio: 1;
  transition: border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}
.cell:hover { border-color: var(--color-fg-subtle); }
.cell.selected {
  border-color: var(--color-primary);
  box-shadow: inset 0 0 0 1px var(--color-primary);
}
.cell-img { display: block; width: 100%; height: 100%; padding: 0; }
.cell :deep(.asset-img) { width: 100%; height: 100%; object-fit: cover; }
.fav-dot {
  position: absolute; top: 5px; left: 5px; width: 19px; height: 19px;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-sm);
  background: rgba(15, 14, 10, 0.6); color: var(--color-heart);
}
.fav-dot :deep(svg) { fill: var(--color-heart); }
.src-badge {
  position: absolute; left: 5px; bottom: 5px;
  font-family: var(--font-mono); font-size: 8px; font-weight: 500;
  letter-spacing: 0.06em; line-height: 1;
  padding: 3px 4px; border-radius: 1px;
  color: #fff; background: rgba(15, 14, 10, 0.66);
}
.asset-reference-note {
  position: absolute; right: 5px; bottom: 5px;
  max-width: calc(100% - 52px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  padding: 3px 4px; border-radius: 1px;
  font-family: var(--font-mono); font-size: 8px; line-height: 1;
  color: #f0b45a; background: rgba(15, 14, 10, 0.72);
}
.cell-actions {
  position: absolute; top: 5px; right: 5px;
  display: flex; gap: 3px;
  opacity: 0; transition: opacity var(--dur) var(--ease);
}
.cell:hover .cell-actions, .cell.selected .cell-actions, .cell:focus-within .cell-actions { opacity: 1; }
@media (hover: none) { .cell-actions { opacity: 0.95; } }
.mini {
  width: 23px; height: 23px;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-sm);
  background: rgba(15, 14, 10, 0.66); color: #fff;
  transition: background var(--dur) var(--ease);
}
.mini:hover { background: rgba(15, 14, 10, 0.88); }
.mini:disabled { opacity: 0.35; cursor: not-allowed; }
.mini-danger:hover:not(:disabled) { color: #ffd2c8; background: color-mix(in srgb, var(--color-destructive) 78%, #000); }
.mini.on { color: var(--color-heart); }
.mini.on :deep(svg) { fill: var(--color-heart); }
.load-more {
  grid-column: 1 / -1;
  width: 100%; min-height: 30px; margin-top: 2px;
  border-radius: var(--radius-sm);
  border: 1px dashed var(--color-border-strong);
  color: var(--color-fg-muted);
  font-family: var(--font-mono); font-size: 9.5px;
  background: transparent;
}
.load-more:hover { color: var(--color-fg); background: var(--color-surface-2); }
</style>
