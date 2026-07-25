<script setup>
// 统一搜索(⌘K 面板):跨工作区搜索会话/prompt/素材/工作区。
import { ref, computed, watch, nextTick } from 'vue'
import { useWorkbenchStore } from '../stores/workbench.js'
import { deriveConversations } from '../lib/conversations.js'
import { getAllPrompts } from '../lib/promptLibrary.js'
import AppIcon from './AppIcon.vue'

const store = useWorkbenchStore()
const props = defineProps({ visible: Boolean })
const emit = defineEmits(['jump', 'close'])

const query = ref('')
const selectedIdx = ref(0)
const debounceTimer = ref(null)
const results = ref([])
const inputEl = ref(null)

// 所有可搜索项(扁平,带类型元数据)
const allItems = ref([])

// 打开时自动聚焦并重建索引
watch(() => props.visible, (v) => {
  if (v) { buildIndex(); nextTick(() => inputEl.value?.focus()) }
  else { query.value = ''; results.value = []; selectedIdx.value = 0 }
})

function buildIndex() {
  const items = []

  // 工作区
  for (const ws of store.workspaces) {
    items.push({ type: 'workspace', id: ws.id, label: ws.name, subtitle: '工作区', wsId: ws.id })
  }

  // 会话(通过 generations 推导,跨工作区)
  const titleOverrides = store.titleOverrides || {}
  const wsGens = {}
  for (const g of store.generations) {
    const wid = g.workspaceId || 'unknown'
    if (!wsGens[wid]) wsGens[wid] = []
    wsGens[wid].push(g)
  }
  for (const [wsId, gens] of Object.entries(wsGens)) {
    const ws = store.workspaces.find((w) => w.id === wsId)
    if (!ws) continue
    const convs = deriveConversations(gens, titleOverrides)
    for (const c of convs) {
      items.push({
        type: 'conversation', id: c.id, label: c.title,
        subtitle: ws.name, wsId, convId: c.id,
      })
    }
  }

  // 素材(跨工作区):用关联 generation 的 prompt 做可搜索文本
  const promptByAsset = new Map()
  for (const g of store.generations) {
    const text = (g.prompt || '').trim()
    if (!text) continue
    for (const id of (g.outputImageIds || [])) {
      if (!promptByAsset.has(id)) promptByAsset.set(id, text)
    }
    for (const id of (g.refImageIds || [])) {
      if (!promptByAsset.has(id)) promptByAsset.set(id, text)
    }
  }
  for (const a of store.assets) {
    const ws = store.workspaces.find((w) => w.id === a.workspaceId)
    const prompt = promptByAsset.get(a.id) || ''
    const shortId = a.id.slice(0, 10)
    const label = prompt
      ? (prompt.length > 48 ? prompt.slice(0, 48) + '…' : prompt)
      : (a.favorite ? `收藏素材 ${shortId}` : `素材 ${shortId}`)
    items.push({
      type: 'asset', id: a.id, label,
      // 额外可搜字段:完整 prompt + id
      searchText: `${label} ${prompt} ${a.id} ${a.favorite ? '收藏' : ''}`,
      subtitle: ws ? ws.name : '未知工作区', wsId: a.workspaceId, asset: a,
    })
  }

  // Prompt 模板(按工作区)
  for (const ws of store.workspaces) {
    const prompts = getAllPrompts(ws.id)
    for (const p of prompts) {
      items.push({
        type: 'prompt', id: p.id, label: p.text,
        subtitle: ws.name, wsId: ws.id,
      })
    }
  }

  allItems.value = items
}

// 搜索逻辑:按类型分组,每类最多 5 条
function doSearch() {
  const q = query.value.trim().toLowerCase()
  if (!q) { results.value = []; return }

  const groups = { workspace: [], conversation: [], prompt: [], asset: [] }
  const terms = q.split(/\s+/).filter(Boolean)

  for (const item of allItems.value) {
    const text = (item.searchText || item.label || '').toLowerCase()
    // 多关键词:所有词都匹配才算
    const matchAll = terms.every((t) => text.includes(t))
    if (!matchAll) continue
    if (groups[item.type] && groups[item.type].length < 5) {
      groups[item.type].push({ ...item })
    }
  }

  const flat = []
  const typeOrder = ['workspace', 'conversation', 'prompt', 'asset']
  const typeLabels = { workspace: '工作区', conversation: '会话', prompt: 'Prompt', asset: '素材' }
  const typeIcons = { workspace: 'folder', conversation: 'image', prompt: 'star', asset: 'image' }

  for (const t of typeOrder) {
    if (groups[t].length) {
      flat.push({ _group: true, label: typeLabels[t], icon: typeIcons[t] })
      for (const item of groups[t]) flat.push(item)
    }
  }

  results.value = flat
  // 默认停在第一条可选项,跳过分组标题
  selectedIdx.value = flat.findIndex((r) => !r._group)
  if (selectedIdx.value < 0) selectedIdx.value = 0
}

// 防抖搜索
function onInput() {
  clearTimeout(debounceTimer.value)
  // 先重建索引(确保数据最新)
  buildIndex()
  debounceTimer.value = setTimeout(doSearch, 200)
}

// 键盘导航:方向键跳过分组标题行
function nextSelectable(from, dir) {
  const list = results.value
  if (!list.length) return from
  let i = from
  for (let n = 0; n < list.length; n++) {
    i = Math.max(0, Math.min(list.length - 1, i + dir))
    if (!list[i]?._group) return i
    // 已到边界仍是分组时停在最近可选
    if ((dir > 0 && i === list.length - 1) || (dir < 0 && i === 0)) {
      // 反向找最近非分组
      for (let j = i; j >= 0 && j < list.length; j -= dir) {
        if (!list[j]?._group) return j
      }
      return from
    }
  }
  return from
}
function onKeydown(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIdx.value = nextSelectable(selectedIdx.value, 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIdx.value = nextSelectable(selectedIdx.value, -1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const item = results.value[selectedIdx.value]
    if (item && !item._group) jumpTo(item)
  } else if (e.key === 'Escape') {
    close()
  }
}

function jumpTo(item) {
  emit('jump', item)
  close()
}

function close() {
  emit('close')
  query.value = ''
  results.value = []
  selectedIdx.value = 0
}

// 索引初始建立
buildIndex()
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="search-overlay" @click.self="close" @keydown="onKeydown">
      <div class="search-modal">
        <div class="search-input-wrap">
          <AppIcon name="search" :size="16" class="search-icon" />
          <input
            ref="inputEl"
            v-model="query"
            class="search-input"
            placeholder="搜索工作区、会话、Prompt、素材…"
            @input="onInput"
            @keydown="onKeydown"
          />
          <kbd class="search-kbd">ESC</kbd>
        </div>
        <div v-if="results.length" class="search-results">
          <template v-for="(r, i) in results" :key="i">
            <div v-if="r._group" class="result-group-label">
              <AppIcon :name="r.icon" :size="13" />
              {{ r.label }}
            </div>
            <button
              v-else
              class="result-item"
              :class="{ focused: i === selectedIdx }"
              @click="jumpTo(r)"
              @mouseenter="selectedIdx = i"
            >
              <AppIcon :name="r.type === 'prompt' ? 'star' : r.type === 'workspace' ? 'folder' : 'image'" :size="14" />
              <span class="result-label">{{ r.label }}</span>
              <span class="result-subtitle">{{ r.subtitle }}</span>
            </button>
          </template>
        </div>
        <div v-else-if="query.trim()" class="search-empty">
          未找到匹配结果
        </div>
        <div v-else class="search-hint">
          输入关键词搜索工作区、会话、Prompt 或素材
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.search-overlay {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 12vh;
  background: rgba(0,0,0,0.4);
  backdrop-filter: blur(2px);
}

.search-modal {
  width: min(560px, 90vw);
  background: var(--color-elevated);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  overflow: hidden;
}

.search-input-wrap {
  display: flex; align-items: center; gap: var(--space-2);
  padding: var(--space-3);
  border-bottom: 1px solid var(--color-border);
}

.search-icon { flex-shrink: 0; color: var(--color-fg-subtle); }

.search-input {
  flex: 1; border: none; outline: none; background: transparent;
  font-size: 15px; color: var(--color-fg);
}
.search-input::placeholder { color: var(--color-fg-subtle); }

.search-kbd {
  flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 28px; height: 22px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 11px; font-family: inherit;
  color: var(--color-fg-subtle);
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
}

.search-results { max-height: 360px; overflow-y: auto; padding: var(--space-1); }

.result-group-label {
  display: flex; align-items: center; gap: var(--space-2);
  padding: var(--space-2) var(--space-2) var(--space-1);
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.04em; color: var(--color-fg-subtle);
  position: sticky; top: 0;
  background: var(--color-elevated);
  z-index: 1;
}

.result-item {
  display: flex; align-items: center; gap: var(--space-2);
  width: 100%; text-align: left;
  padding: var(--space-2) var(--space-2);
  border-radius: var(--radius-sm);
  font-size: 13px; color: var(--color-fg-muted);
}
.result-item:hover, .result-item.focused { background: var(--color-surface-2); color: var(--color-fg); }
.result-item :deep(svg) { flex-shrink: 0; }

.result-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.result-subtitle { font-size: 11px; color: var(--color-fg-subtle); flex-shrink: 0; margin-left: auto; }

.search-empty, .search-hint {
  padding: var(--space-6); text-align: center;
  font-size: 13px; color: var(--color-fg-subtle);
}
</style>
