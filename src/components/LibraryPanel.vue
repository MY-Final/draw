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
        <span v-else class="lib-count tnum">{{ store.workspaceAssets.length }} 张</span>
      </div>
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

    <div v-else class="grid">
      <div v-for="a in store.workspaceAssets" :key="a.id" class="cell" :class="{ selected: selected.has(a.id) }"
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
  background:
    linear-gradient(145deg,
      color-mix(in srgb, var(--color-primary) 18%, var(--color-surface-2)),
      var(--color-surface-2) 60%,
      color-mix(in srgb, var(--color-accent) 10%, var(--color-elevated)));
  opacity: 0.85;
}
.tile.t1 { transform: rotate(-4deg); opacity: 0.7; }
.tile.t2 { transform: rotate(3deg); margin-top: 8px; opacity: 0.55; }
.tile.t3 { transform: rotate(2deg); margin-top: -4px; opacity: 0.6; }
.tile.t4 {
  transform: rotate(-2deg); margin-top: 4px; opacity: 0.75;
  background:
    linear-gradient(160deg,
      color-mix(in srgb, var(--color-accent) 14%, var(--color-surface-2)),
      var(--color-elevated));
}
.lib-empty-icon {
  width: 36px; height: 36px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  color: var(--color-primary);
  background: var(--color-primary-soft);
  border: 1px solid color-mix(in srgb, var(--color-primary) 22%, transparent);
  margin-top: calc(-1 * var(--space-2));
  box-shadow: var(--shadow-1);
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
  box-shadow: var(--shadow-1);
  transition: border-color var(--dur) var(--ease), transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}
.cell:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 22px rgba(0,0,0,0.2);
}
.cell.selected {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 18%, transparent);
}
.cell-img { display: block; width: 100%; height: 100%; padding: 0; }
.fav-dot {
  position: absolute; top: 6px; left: 6px; width: 22px; height: 22px;
  display: flex; align-items: center; justify-content: center; border-radius: 50%;
  background: rgba(0,0,0,0.52); color: var(--color-heart); backdrop-filter: blur(4px);
}
.fav-dot :deep(svg) { fill: var(--color-heart); }
.cell-actions {
  position: absolute; top: 6px; right: 6px; display: flex; gap: 4px;
  opacity: 0; transition: opacity var(--dur) var(--ease);
}
.cell:hover .cell-actions, .cell.selected .cell-actions { opacity: 1; }
.mini {
  width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;
  border-radius: 8px; background: rgba(0,0,0,0.58); color: #fff; backdrop-filter: blur(6px);
  transition: transform var(--dur) var(--ease), background var(--dur) var(--ease);
}
.mini:hover { transform: scale(1.05); background: rgba(0,0,0,0.72); }
.mini:disabled { opacity: 0.4; cursor: not-allowed; }
.mini.on { color: var(--color-heart); }
.mini.on :deep(svg) { fill: var(--color-heart); }
</style>
