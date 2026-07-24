<script setup>
// 左侧栏:工作区树 + 会话列表(按日期分组)+ 底部导航。
import { computed, ref } from 'vue'
import { useWorkbenchStore } from '../stores/workbench.js'
import { deriveConversations, groupConversationsByDate, convIdOf } from '../lib/conversations.js'
import AppIcon from './AppIcon.vue'
import ConfirmDialog from './ConfirmDialog.vue'

const store = useWorkbenchStore()
const emit = defineEmits(['open-settings', 'open-storage', 'toggle-theme', 'new-canvas'])
const props = defineProps({ theme: String })

const active = computed(() => store.activePreset)

// ── 工作区 ──
const expandedWs = ref(new Set())
const wsMenuFor = ref(null)
const wsRenaming = ref(null)
const wsRenameText = ref('')
const confirmDelWs = ref(null)

// 默认展开当前工作区
if (store.activeWorkspaceId) expandedWs.value.add(store.activeWorkspaceId)

function toggleWs(id) {
  const s = new Set(expandedWs.value)
  if (s.has(id)) s.delete(id); else s.add(id)
  expandedWs.value = s
}

function selectWorkspace(id) {
  // 点名称 = 切换工作区并确保展开;折叠只走 chevron,避免误触
  if (store.activeWorkspaceId !== id) store.switchWorkspace(id)
  if (!expandedWs.value.has(id)) {
    const s = new Set(expandedWs.value)
    s.add(id)
    expandedWs.value = s
  }
}

function openWsMenu(id, e) { e?.stopPropagation(); wsMenuFor.value = wsMenuFor.value === id ? null : id }
function startWsRename(ws) { wsMenuFor.value = null; wsRenaming.value = ws.id; wsRenameText.value = ws.name }
function commitWsRename(id) { store.renameWorkspace(id, wsRenameText.value); wsRenaming.value = null }
function askWsDelete(ws) { wsMenuFor.value = null; confirmDelWs.value = ws }
async function doWsDelete() {
  if (confirmDelWs.value) await store.deleteWorkspace(confirmDelWs.value.id)
  confirmDelWs.value = null
}

// ── 会话 ──
const menuFor = ref(null)
const confirmDel = ref(null)
const renaming = ref(null)
const renameText = ref('')

function wsConversationGroups(wsId) {
  const gens = store.generations.filter(g => g.workspaceId === wsId)
  const groups = groupConversationsByDate(deriveConversations(gens, store.titleOverrides))
  // 当前空白会话(新建创作后还没生成)也显示在树里,避免「幽灵会话」不可见
  if (
    wsId === store.activeWorkspaceId
    && store.conversationId
    && !gens.some((g) => convIdOf(g) === store.conversationId)
  ) {
    const draft = {
      id: store.conversationId,
      title: store.titleOverrides[store.conversationId] || '新创作',
      createdAt: Date.now(),
      lastAt: Date.now(),
      count: 0,
      draft: true,
    }
    let today = groups.find((g) => g.key === 'today')
    if (!today) {
      today = { key: 'today', label: '今天', order: 0, items: [] }
      groups.unshift(today)
    }
    // 草稿置顶
    today.items = [draft, ...today.items.filter((c) => c.id !== draft.id)]
  }
  return groups
}
function wsCount(wsId) {
  return store.generations.filter(g => g.workspaceId === wsId).length
}
function wsHasConversations(wsId) {
  if (store.generations.some(g => g.workspaceId === wsId)) return true
  // 当前工作区有空白会话时也算「有会话」
  return wsId === store.activeWorkspaceId && !!store.conversationId
}

function openMenu(id, e) { e?.stopPropagation(); menuFor.value = menuFor.value === id ? null : id }
function askDelete(c) { menuFor.value = null; confirmDel.value = { id: c.id, title: c.title } }
async function doDelete() {
  if (confirmDel.value) await store.deleteConversation(confirmDel.value.id)
  confirmDel.value = null
}
function startRename(c) { menuFor.value = null; renaming.value = c.id; renameText.value = c.title }
function commitRename(id) { store.renameConversation(id, renameText.value); renaming.value = null }
const vFocus = { mounted: (el) => el.focus() }
</script>

<template>
  <div class="side">
    <div v-if="menuFor || wsMenuFor" class="menu-backdrop" @click="menuFor = null; wsMenuFor = null" />
    <div class="side-top">
      <!-- 高频:新会话;工作区降级到树底部次级入口 -->
      <button class="btn btn-primary new-btn" @click="emit('new-canvas')">
        <AppIcon name="plus" :size="15" /> 新建创作
      </button>

      <!-- 当前接口 -->
      <div class="block">
        <div class="block-label">当前接口</div>
        <div v-if="store.presets.length" class="preset-select">
          <select :value="store.activePresetId" @change="store.selectPreset($event.target.value)" aria-label="选择接口">
            <option v-for="p in store.presets" :key="p.id" :value="p.id">
              {{ p.name || '未命名' }}
            </option>
          </select>
          <button
            v-if="active && !active.apiKey"
            type="button"
            class="badge badge-warn mini-badge key-badge"
            @click="emit('open-settings')"
            title="填写 API Key"
          >缺 Key</button>
        </div>
        <button v-else class="btn btn-sm add-first" @click="emit('open-settings', { create: true })">
          <AppIcon name="plus" :size="13" /> 添加接口
        </button>
      </div>

      <!-- 工作区树 -->
      <div class="ws-tree" v-if="store.workspaces.length">
        <div v-for="ws in store.workspaces" :key="ws.id" class="ws-block">
          <!-- 工作区头部:点名称切换;chevron 只负责展开 -->
          <div
            class="ws-header"
            :class="{ active: ws.id === store.activeWorkspaceId }"
            @click="selectWorkspace(ws.id)"
          >
            <button class="ws-chevron" @click.stop="toggleWs(ws.id)" aria-label="展开/折叠">
              <AppIcon :name="expandedWs.has(ws.id) ? 'chevron-down' : 'chevron-right'" :size="13" />
            </button>
            <span class="ws-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </span>
            <!-- 重命名态 -->
            <input
              v-if="wsRenaming === ws.id" class="rename-input ws-rename-input"
              v-model="wsRenameText" @click.stop
              @keydown.enter="commitWsRename(ws.id)" @keydown.esc="wsRenaming = null"
              @blur="commitWsRename(ws.id)" v-focus
            />
            <span v-else class="ws-name">{{ ws.name }}</span>
            <span v-if="ws.id === store.activeWorkspaceId" class="ws-dot" aria-hidden="true" />
            <button class="ws-menu-toggle" @click.stop="openWsMenu(ws.id, $event)" aria-label="工作区操作">⋯</button>
            <!-- 工作区菜单 -->
            <div v-if="wsMenuFor === ws.id" class="menu ws-menu" @click.stop>
              <button class="menu-item" @click="startWsRename(ws)"><AppIcon name="settings" :size="13" /> 重命名</button>
              <button class="menu-item danger" @click="askWsDelete(ws)"><AppIcon name="trash" :size="13" /> 删除</button>
            </div>
          </div>

          <!-- 会话列表 -->
          <div v-if="expandedWs.has(ws.id)" class="ws-convs">
            <template v-if="wsHasConversations(ws.id)">
              <div v-for="g in wsConversationGroups(ws.id)" :key="g.key" class="hist-group">
                <div class="hist-label">{{ g.label }}</div>
                <div
                  v-for="c in g.items" :key="c.id"
                  class="hist-row" :class="{ active: c.id === store.conversationId }"
                >
                  <input
                    v-if="renaming === c.id" class="rename-input" v-model="renameText"
                    @keydown.enter="commitRename(c.id)" @keydown.esc="renaming = null"
                    @blur="commitRename(c.id)" v-focus
                  />
                  <template v-else>
                    <button class="hist-item" @click="store.switchConversation(c.id)" :title="c.title">
                      <AppIcon name="image" :size="13" />
                      <span class="hist-title">{{ c.title }}</span>
                      <span v-if="c.draft" class="hist-draft">草稿</span>
                      <span v-else class="hist-count tnum">{{ c.count }}</span>
                    </button>
                    <button class="hist-menu" @click="openMenu(c.id, $event)" aria-label="会话操作">⋯</button>
                    <div v-if="menuFor === c.id" class="menu conv-menu" @click.stop>
                      <button class="menu-item" @click="startRename(c)"><AppIcon name="settings" :size="13" /> 重命名</button>
                      <button class="menu-item danger" @click="askDelete(c)"><AppIcon name="trash" :size="13" /> 删除会话</button>
                    </div>
                  </template>
                </div>
              </div>
            </template>
            <p v-else class="hist-empty helper">还没有会话。点上方「新建创作」开始。</p>
          </div>
        </div>
        <button class="btn btn-sm new-ws-btn" @click="store.createWorkspace()">
          <AppIcon name="plus" :size="11" /> 新建工作区
        </button>
      </div>
      <p v-else class="hist-empty helper">还没有工作区。新建一个工作区开始创作。</p>
    </div>

    <div class="side-bottom">
      <button class="nav-item" @click="emit('open-storage')">
        <AppIcon name="image" :size="16" /> 数据保护
        <span v-if="store.assets.length" class="nav-meta tnum">{{ store.assets.length }}</span>
      </button>
      <button class="nav-item" @click="emit('open-settings')">
        <AppIcon name="settings" :size="16" /> 接口设置
      </button>
      <div class="nav-meta-row">
        <button class="nav-item nav-item-grow" @click="emit('toggle-theme')">
          <AppIcon :name="theme === 'dark' ? 'sun' : 'moon'" :size="16" />
          {{ theme === 'dark' ? '浅色模式' : '深色模式' }}
        </button>
        <a
          class="nav-icon"
          href="https://github.com/MY-Final/draw"
          target="_blank"
          rel="noopener noreferrer"
          title="在 GitHub 打开"
          aria-label="GitHub"
        >
          <AppIcon name="github" :size="15" />
        </a>
      </div>
    </div>

    <!-- 删除确认弹窗 -->
    <ConfirmDialog
      v-if="confirmDel"
      title="删除会话"
      :message="`将删除会话「${confirmDel.title}」及其全部生成记录。未收藏且未被引用的产出图会一并删除,此操作不可撤销。`"
      confirm-text="删除" danger
      @confirm="doDelete" @cancel="confirmDel = null"
    />
    <ConfirmDialog
      v-if="confirmDelWs"
      title="删除工作区"
      :message="`将删除工作区「${confirmDelWs.name}」及其全部生成记录和素材,此操作不可撤销。`"
      confirm-text="删除" danger
      @confirm="doWsDelete" @cancel="confirmDelWs = null"
    />
  </div>
</template>

<style scoped>
.side { display: flex; flex-direction: column; height: 100%; justify-content: space-between; gap: var(--space-3); min-height: 0; flex: 1; }
.side-top { display: flex; flex-direction: column; gap: var(--space-3); min-height: 0; flex: 1; overflow: hidden; }
.new-btn {
  width: 100%; border-radius: 999px; flex-shrink: 0;
  box-shadow: 0 6px 16px color-mix(in srgb, var(--color-primary) 22%, transparent);
}

.block {
  padding: var(--space-3);
  border-radius: var(--radius);
  border: 1px solid var(--color-border);
  background: var(--color-surface-2);
}
.block-label { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--color-fg-subtle); margin-bottom: var(--space-2); }
.preset-select { display: flex; align-items: center; gap: var(--space-2); }
.preset-select select {
  background: var(--color-bg);
  border-radius: 999px;
  min-height: 34px;
}
.mini-badge { flex-shrink: 0; }
.key-badge { cursor: pointer; border: none; font: inherit; }
.key-badge:hover { filter: brightness(1.05); }
.add-first { width: 100%; border-radius: 999px; }

/* 工作区树 */
.ws-tree { display: flex; flex-direction: column; gap: 2px; overflow-y: auto; min-height: 0; flex: 1; margin: 0 calc(-1 * var(--space-1)); padding: 0 var(--space-1); }
.ws-block { display: flex; flex-direction: column; }

.ws-header {
  display: flex; align-items: center; gap: var(--space-1); padding: 7px 10px;
  border-radius: 10px; cursor: pointer; position: relative;
  border: 1px solid transparent;
  transition: background var(--dur) var(--ease), border-color var(--dur) var(--ease), color var(--dur) var(--ease);
}
.ws-header:hover { background: var(--color-surface-2); }
/* 选中:中性底 + 细边,不要左侧彩条(AI 模板味太重) */
.ws-header.active {
  background: var(--color-elevated);
  border-color: var(--color-border-strong);
  color: var(--color-fg);
}

.ws-chevron {
  flex-shrink: 0; width: 18px; height: 18px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 6px; color: var(--color-fg-subtle);
}
.ws-chevron:hover { background: color-mix(in srgb, var(--color-border) 80%, transparent); color: var(--color-fg); }

.ws-icon { flex-shrink: 0; display: flex; color: var(--color-fg-muted); }
.ws-header.active .ws-icon { color: var(--color-fg); }

.ws-name {
  flex: 1; font-size: 13px; font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ws-header.active .ws-name { font-weight: 600; }

/* 当前工作区标记:克制小圆点,无 glow */
.ws-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--color-fg-subtle); margin-right: 4px; flex-shrink: 0;
  /* 用空内容覆盖模板里的 ● 字符 */
  font-size: 0; line-height: 0; color: transparent;
}
.ws-header.active .ws-dot { background: var(--color-fg-muted); }

.ws-menu-toggle {
  flex-shrink: 0; width: 22px; height: 22px; border-radius: 6px;
  color: var(--color-fg-subtle); font-size: 14px; line-height: 1;
  opacity: 0; transition: opacity var(--dur) var(--ease), background var(--dur) var(--ease);
}
.ws-header:hover .ws-menu-toggle, .ws-header.active .ws-menu-toggle { opacity: 1; }
.ws-menu-toggle:hover { background: color-mix(in srgb, var(--color-border) 80%, transparent); color: var(--color-fg); }
@media (hover: none) {
  .ws-menu-toggle { opacity: 0.85; }
}

/* 工作区内联重命名 */
.ws-rename-input { flex: 1; }

/* 工作区下的会话列表:只缩进,不画树状竖线 */
.ws-convs {
  display: flex; flex-direction: column; gap: 1px;
  padding: 2px 0 6px 28px; margin-bottom: var(--space-1);
}

/* 会话行 */
.hist-group { display: flex; flex-direction: column; gap: 1px; }
.hist-label {
  font-size: 10px; font-weight: 600; letter-spacing: 0.04em;
  text-transform: uppercase; color: var(--color-fg-subtle);
  padding: 6px 10px 2px;
}
.hist-row {
  position: relative; display: flex; align-items: center;
  border-radius: 10px; border: 1px solid transparent;
}
.hist-row:hover { background: var(--color-surface-2); }
.hist-row.active {
  background: var(--color-elevated);
  border-color: var(--color-border-strong);
}

.hist-item {
  display: flex; align-items: center; gap: var(--space-2); flex: 1; min-width: 0; text-align: left;
  padding: 7px 10px; border-radius: 10px; color: var(--color-fg-muted);
  transition: color var(--dur) var(--ease);
}
.hist-row:hover .hist-item, .hist-row.active .hist-item { color: var(--color-fg); }
.hist-row.active .hist-item { font-weight: 550; }
.hist-row.active .hist-item :deep(svg) { color: var(--color-fg-muted); }
.hist-title { flex: 1; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hist-draft {
  font-size: 10px; color: var(--color-primary); flex-shrink: 0;
  padding: 1px 6px; border-radius: 999px;
  background: var(--color-primary-soft);
  border: 1px solid color-mix(in srgb, var(--color-primary) 28%, transparent);
}
.hist-count {
  font-size: 10px; color: var(--color-fg-subtle); flex-shrink: 0;
  min-width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center;
  border-radius: 999px; background: var(--color-surface-2); border: 1px solid var(--color-border);
}
.hist-row.active .hist-count {
  color: var(--color-fg-muted);
  border-color: var(--color-border-strong);
  background: var(--color-surface-2);
}

.hist-menu { flex-shrink: 0; width: 24px; height: 24px; margin-right: 2px; border-radius: var(--radius-sm); color: var(--color-fg-subtle); font-size: 15px; line-height: 1; opacity: 0; transition: opacity var(--dur) var(--ease); }
.hist-row:hover .hist-menu, .hist-row.active .hist-menu { opacity: 1; }
.hist-menu:hover { background: var(--color-border); color: var(--color-fg); }
@media (hover: none) {
  .hist-menu { opacity: 0.85; }
}

/* 菜单 */
.menu { position: absolute; top: calc(100% - 2px); right: 4px; z-index: 20; min-width: 140px; padding: var(--space-1); background: var(--color-elevated); border: 1px solid var(--color-border-strong); border-radius: var(--radius); box-shadow: var(--shadow-pop); display: flex; flex-direction: column; gap: 1px; }
.ws-menu { top: 100%; right: 2px; }
.conv-menu { right: 2px; }
.menu-item { display: flex; align-items: center; gap: var(--space-2); width: 100%; text-align: left; padding: 8px 10px; border-radius: var(--radius-sm); font-size: 13px; color: var(--color-fg-muted); }
.menu-item:hover { background: var(--color-surface-2); color: var(--color-fg); }
.menu-item.danger { color: var(--color-destructive); }
.menu-item.danger:hover { background: color-mix(in srgb, var(--color-destructive) 12%, transparent); }

.rename-input { width: 100%; padding: var(--space-2); border-radius: var(--radius-sm); border: 1px solid var(--color-primary); background: var(--color-surface); color: var(--color-fg); font-size: 13px; }

.new-ws-btn {
  width: 100%; justify-content: center; margin-top: var(--space-2); flex-shrink: 0;
  border-style: dashed; color: var(--color-fg-muted); background: transparent;
}
.new-ws-btn:hover { color: var(--color-fg); border-color: var(--color-border-strong); background: var(--color-surface-2); }

.hist-empty { padding: 0 var(--space-2); font-size: 12px; }

.menu-backdrop { position: fixed; inset: 0; z-index: 15; }

.side-bottom {
  display: flex; flex-direction: column; gap: 2px; flex-shrink: 0;
  padding-top: var(--space-2);
  border-top: 1px solid var(--color-border);
}
.nav-item {
  display: flex; align-items: center; gap: var(--space-2); width: 100%;
  padding: 8px 10px; border-radius: 10px;
  font-size: 13px; color: var(--color-fg-muted); text-align: left;
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
}
.nav-item:hover { background: var(--color-surface-2); color: var(--color-fg); }
.nav-item-grow { flex: 1; min-width: 0; width: auto; }
.nav-meta-row {
  display: flex; align-items: center; gap: 2px;
}
.nav-icon {
  width: 34px; height: 34px; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: var(--radius-sm); color: var(--color-fg-subtle);
  text-decoration: none;
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
}
.nav-icon:hover { background: var(--color-surface-2); color: var(--color-fg); }
.nav-icon:visited { color: var(--color-fg-subtle); }
.nav-meta {
  margin-left: auto; font-size: 11px; color: var(--color-fg-subtle);
  min-width: 22px; height: 20px; padding: 0 6px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 999px; background: var(--color-surface-2); border: 1px solid var(--color-border);
}
</style>
