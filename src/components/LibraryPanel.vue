<script setup>
// 右栏(安静):素材库网格 + 设为参考 + 预览 + 删除。用量/备份已移入抽屉。
import { ref } from 'vue'
import { useWorkbenchStore } from '../stores/workbench.js'
import AssetImage from './AssetImage.vue'
import AppIcon from './AppIcon.vue'

const store = useWorkbenchStore()
const emit = defineEmits(['use-as-reference', 'preview'])
const selected = ref(new Set())

function toggleSelect(id) {
  const s = new Set(selected.value)
  s.has(id) ? s.delete(id) : s.add(id)
  selected.value = s
}
async function deleteSelected() {
  if (!selected.value.size) return
  if (!confirm(`删除选中的 ${selected.value.size} 张素材?不可撤销。`)) return
  await store.removeAssets([...selected.value])
  selected.value = new Set()
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
        <button v-if="selected.size" class="btn btn-sm btn-danger" @click="deleteSelected">
          <AppIcon name="trash" :size="13" /> {{ selected.size }}
        </button>
        <span v-else class="lib-count tnum">{{ store.visibleAssets.length }} 张</span>
      </div>
    </div>

    <div v-if="!store.visibleAssets.length" class="lib-empty">
      <AppIcon name="image" :size="28" />
      <p>{{ store.favoritesOnly ? '还没有收藏的素材' : '生成的图片会出现在这里' }}</p>
    </div>

    <div v-else class="grid">
      <div v-for="a in store.visibleAssets" :key="a.id" class="cell" :class="{ selected: selected.has(a.id) }"
        draggable="true"
        @dragstart="(e) => { e.dataTransfer.setData('application/json', JSON.stringify({ assetId: a.id })) }"
      >
        <button class="cell-img" @click="emit('preview', a)" aria-label="预览大图">
          <AssetImage :asset="a" />
        </button>
        <span v-if="a.favorite" class="fav-dot" aria-hidden="true"><AppIcon name="heart" :size="11" /></span>
        <div class="cell-actions">
          <button class="mini" @click="store.toggleAssetFavorite(a.id)" :class="{ on: a.favorite }" :aria-label="a.favorite ? '取消收藏' : '收藏'">
            <AppIcon name="heart" :size="12" />
          </button>
          <button class="mini" @click="toggleSelect(a.id)" :aria-label="selected.has(a.id) ? '取消选择' : '选择'">
            <AppIcon :name="selected.has(a.id) ? 'check' : 'plus'" :size="12" />
          </button>
          <button class="mini" @click="emit('use-as-reference', a.id)" title="设为参考图">
            <AppIcon name="layers" :size="12" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.library { display: flex; flex-direction: column; gap: var(--space-3); height: 100%; }
.lib-head { display: flex; align-items: center; justify-content: space-between; }
.lib-head-actions { display: flex; align-items: center; gap: var(--space-2); }
.filter-btn { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-sm); border: 1px solid var(--color-border); color: var(--color-fg-subtle); transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease); }
.filter-btn:hover { color: var(--color-fg-muted); }
.filter-btn.on { color: #f43f5e; border-color: color-mix(in srgb, #f43f5e 40%, transparent); background: color-mix(in srgb, #f43f5e 10%, transparent); }
.filter-btn.on :deep(svg) { fill: #f43f5e; }
.lib-title { font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--color-fg-subtle); }
.lib-count { font-size: 11px; color: var(--color-fg-subtle); }
.lib-empty { display: flex; flex-direction: column; align-items: center; gap: var(--space-2); color: var(--color-fg-subtle); padding: var(--space-8) 0; text-align: center; }
.lib-empty p { font-size: 12px; margin: 0; }
.grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-2); }
.cell { position: relative; border-radius: var(--radius-sm); overflow: hidden; border: 2px solid transparent; background: var(--color-surface-2); aspect-ratio: 1; }
.cell.selected { border-color: var(--color-primary); }
.cell-img { display: block; width: 100%; height: 100%; padding: 0; }
.fav-dot { position: absolute; top: 4px; left: 4px; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: rgba(0,0,0,0.55); color: #f43f5e; }
.fav-dot :deep(svg) { fill: #f43f5e; }
.cell-actions { position: absolute; top: 4px; right: 4px; display: flex; gap: 4px; opacity: 0; transition: opacity var(--dur) var(--ease); }
.cell:hover .cell-actions, .cell.selected .cell-actions { opacity: 1; }
.mini { width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: 6px; background: rgba(0,0,0,0.6); color: #fff; }
.mini:disabled { opacity: 0.4; cursor: not-allowed; }
.mini.on { color: #f43f5e; }
.mini.on :deep(svg) { fill: #f43f5e; }
</style>
