<script setup>
// 左侧栏:工作区树 + 会话列表(按日期分组)+ 底部导航。
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWorkbenchStore } from '../stores/workbench.js'
import { deriveConversations, groupConversationsByDate, convIdOf } from '../lib/conversations.js'
import AppIcon from './AppIcon.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import LocaleToggle from './LocaleToggle.vue'

const store = useWorkbenchStore()
const { t, locale } = useI18n()
const emit = defineEmits(['open-settings', 'open-storage', 'toggle-theme', 'new-canvas'])
defineProps({ theme: String })

// ── 工作区 ──
const expandedWs = ref(new Set())
const wsMenuFor = ref(null)
const wsRenaming = ref(null)
const wsRenameText = ref('')
const confirmDelWs = ref(null)

// 默认展开当前工作区;初始化是异步的,因此需要同时监听后续注入的 id。
function ensureWorkspaceExpanded(id) {
  if (!id || expandedWs.value.has(id)) return
  const next = new Set(expandedWs.value)
  next.add(id)
  expandedWs.value = next
}
ensureWorkspaceExpanded(store.activeWorkspaceId)
watch(() => store.activeWorkspaceId, ensureWorkspaceExpanded)

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
function onWorkspaceKeydown(event, id) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    selectWorkspace(id)
  }
}

function openWsMenu(id, e) { e?.stopPropagation(); wsMenuFor.value = wsMenuFor.value === id ? null : id }
function startWsRename(ws) { wsMenuFor.value = null; wsRenaming.value = ws.id; wsRenameText.value = ws.name }
function commitWsRename(id) { store.renameWorkspace(id, wsRenameText.value); wsRenaming.value = null }
function askWsDelete(ws) { wsMenuFor.value = null; confirmDelWs.value = ws }
// 撤销提示统一在 App 层渲染(移动端抽屉一关,这里的组件就卸载了)。
async function doWsDelete() {
  const target = confirmDelWs.value
  confirmDelWs.value = null
  if (!target) return
  try {
    await store.deleteWorkspaceWithUndo(target.id)
  } catch (error) {
    store.lastError = t('sidebar.deleteWorkspaceFailed', { message: error?.message || t('sidebar.retryHint') })
    await store.refreshAll().catch(() => {})
  }
}

// ── 会话 ──
const menuFor = ref(null)
const confirmDel = ref(null)
const renaming = ref(null)
const renameText = ref('')

function groupLabel(group) {
  if (group.key === 'today') return t('dates.today')
  if (group.key === 'yesterday') return t('dates.yesterday')
  if (group.key === 'this-month') return t('dates.thisMonthEarlier')
  const matched = /^m-(\d+)-(\d+)$/.exec(group.key)
  if (!matched) return group.label
  const year = Number(matched[1])
  const month = Number(matched[2])
  const sameYear = year === new Date().getFullYear()
  try {
    return new Intl.DateTimeFormat(locale.value, sameYear ? { month: 'long' } : { year: 'numeric', month: 'long' })
      .format(new Date(year, month, 1))
  } catch {
    return group.label
  }
}

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
      title: store.titleOverrides[store.conversationId] || t('sidebar.newConversation'),
      createdAt: Date.now(),
      lastAt: Date.now(),
      count: 0,
      draft: true,
    }
    let today = groups.find((g) => g.key === 'today')
    if (!today) {
      today = { key: 'today', label: t('dates.today'), order: 0, items: [] }
      groups.unshift(today)
    }
    // 草稿置顶
    today.items = [draft, ...today.items.filter((c) => c.id !== draft.id)]
  }
  return groups
}
function wsHasConversations(wsId) {
  if (store.generations.some(g => g.workspaceId === wsId)) return true
  // 当前工作区有空白会话时也算「有会话」
  return wsId === store.activeWorkspaceId && !!store.conversationId
}

function openMenu(id, e) { e?.stopPropagation(); menuFor.value = menuFor.value === id ? null : id }
function askDelete(c) { menuFor.value = null; confirmDel.value = { id: c.id, title: c.title } }
// 删除会话给 5 秒撤销窗口:误删一段对话的代价远高于多按一次确认。
function doDelete() {
  const target = confirmDel.value
  confirmDel.value = null
  if (!target) return
  deleteConversationFlow(target)
}
async function deleteConversationFlow(target) {
  try {
    await store.deleteConversationWithUndo(target.id)
  } catch (error) {
    store.lastError = t('sidebar.deleteConversationFailed', { message: error?.message || t('sidebar.retryHint') })
    await store.refreshAll().catch(() => {})
  }
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
        <AppIcon name="plus" :size="15" /> {{ t('sidebar.newCanvas') }}
      </button>

      <!-- 工作区树 -->
      <div class="ws-tree" v-if="store.workspaces.length">
        <div v-for="ws in store.workspaces" :key="ws.id" class="ws-block">
          <!-- 工作区头部:点名称切换;chevron 只负责展开 -->
          <div class="ws-header" :class="{ active: ws.id === store.activeWorkspaceId }">
            <button class="ws-chevron" @click.stop="toggleWs(ws.id)" :aria-label="expandedWs.has(ws.id) ? t('sidebar.collapseWorkspace') : t('sidebar.expandWorkspace')">
              <AppIcon :name="expandedWs.has(ws.id) ? 'chevron-down' : 'chevron-right'" :size="13" />
            </button>
            <!-- 重命名态 -->
            <input
              v-if="wsRenaming === ws.id" class="rename-input ws-rename-input"
              v-model="wsRenameText" @click.stop
              @keydown.enter="commitWsRename(ws.id)" @keydown.esc="wsRenaming = null"
              @blur="commitWsRename(ws.id)" v-focus
            />
            <button
              v-else
              class="ws-select"
              @click="selectWorkspace(ws.id)"
              :aria-expanded="expandedWs.has(ws.id)"
              :aria-label="t('sidebar.workspaceAria', { name: ws.name })"
              @keydown="onWorkspaceKeydown($event, ws.id)"
            >
              <span class="ws-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 19a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-7l-2 3H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2z" />
                </svg>
              </span>
              <span class="ws-name">{{ ws.name }}</span>
              <span v-if="ws.id === store.activeWorkspaceId" class="ws-dot" aria-hidden="true" />
            </button>
            <button class="ws-menu-toggle" @click.stop="openWsMenu(ws.id, $event)" :aria-label="t('common.workspaceActions')">⋯</button>
            <!-- 工作区菜单 -->
            <div v-if="wsMenuFor === ws.id" class="menu ws-menu" @click.stop>
              <button class="menu-item" @click="startWsRename(ws)"><AppIcon name="settings" :size="13" /> {{ t('common.rename') }}</button>
              <button class="menu-item danger" @click="askWsDelete(ws)"><AppIcon name="trash" :size="13" /> {{ t('common.delete') }}</button>
            </div>
          </div>

          <!-- 会话列表 -->
          <div v-if="expandedWs.has(ws.id)" class="ws-convs">
            <template v-if="wsHasConversations(ws.id)">
              <div v-for="g in wsConversationGroups(ws.id)" :key="g.key" class="hist-group">
                <div class="hist-label">{{ groupLabel(g) }}</div>
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
                      <span v-if="c.draft" class="hist-draft">{{ t('sidebar.draft') }}</span>
                      <span v-else class="hist-count tnum">{{ c.count }}</span>
                    </button>
                    <button class="hist-menu" @click="openMenu(c.id, $event)" :aria-label="t('common.conversationActions')">⋯</button>
                    <div v-if="menuFor === c.id" class="menu conv-menu" @click.stop>
                      <button class="menu-item" @click="startRename(c)"><AppIcon name="settings" :size="13" /> {{ t('common.rename') }}</button>
                      <button class="menu-item danger" @click="askDelete(c)"><AppIcon name="trash" :size="13" /> {{ t('sidebar.deleteConversation') }}</button>
                    </div>
                  </template>
                </div>
              </div>
            </template>
            <p v-else class="hist-empty helper">{{ t('sidebar.noConversations') }}</p>
          </div>
        </div>
        <button class="btn btn-sm new-ws-btn" @click="store.createWorkspace()">
          <AppIcon name="plus" :size="11" /> {{ t('sidebar.newWorkspace') }}
        </button>
      </div>
      <p v-else class="hist-empty helper">{{ t('sidebar.noWorkspaces') }}</p>
    </div>

    <div class="side-bottom">
      <button class="nav-item" @click="emit('open-storage')">
        <AppIcon name="image" :size="16" /> {{ t('sidebar.dataProtection') }}
        <span v-if="store.assets.length" class="nav-meta tnum">{{ store.assets.length }}</span>
      </button>
      <button class="nav-item" @click="emit('open-settings')">
        <AppIcon name="settings" :size="16" /> {{ t('sidebar.apiSettings') }}
      </button>
      <div class="nav-meta-row">
        <button class="nav-item nav-item-grow" @click="emit('toggle-theme')">
          <AppIcon :name="theme === 'dark' ? 'sun' : 'moon'" :size="16" />
          {{ theme === 'dark' ? t('sidebar.lightMode') : t('sidebar.darkMode') }}
        </button>
        <LocaleToggle />
        <a
          class="nav-icon"
          href="./guide/"
          target="_blank"
          rel="noopener noreferrer"
          :title="t('sidebar.guide')"
          :aria-label="t('sidebar.guide')"
        >
          <AppIcon name="help" :size="15" />
        </a>
        <a
          class="nav-icon"
          href="https://github.com/MY-Final/draw"
          target="_blank"
          rel="noopener noreferrer"
          :title="t('sidebar.github')"
          :aria-label="t('sidebar.github')"
        >
          <AppIcon name="github" :size="15" />
        </a>
      </div>
    </div>

    <!-- 删除确认弹窗 -->
    <ConfirmDialog
      v-if="confirmDel"
      :title="t('sidebar.deleteConversation')"
      :message="t('sidebar.deleteConversationMessage', { title: confirmDel.title })"
      :confirm-text="t('common.delete')" danger
      @confirm="doDelete" @cancel="confirmDel = null"
    />
    <ConfirmDialog
      v-if="confirmDelWs"
      :title="t('sidebar.deleteWorkspace')"
      :message="t('sidebar.deleteWorkspaceMessage', { name: confirmDelWs.name })"
      :confirm-text="t('common.delete')" danger
      @confirm="doWsDelete" @cancel="confirmDelWs = null"
    />

  </div>
</template>

<style scoped>
.side { display: flex; flex-direction: column; height: 100%; justify-content: space-between; gap: var(--space-3); min-height: 0; flex: 1; }
.side-top { display: flex; flex-direction: column; gap: var(--space-3); min-height: 0; flex: 1; overflow: hidden; }
.new-btn {
  width: 100%; border-radius: 999px; flex-shrink: 0;
}

.block {
  padding: var(--space-3);
  border-radius: var(--radius);
  border: 1px solid var(--color-border);
  background: var(--color-surface-2);
}
.block-label { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--color-fg-subtle); margin-bottom: var(--space-2); }
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

.ws-select {
  display: flex; align-items: center; gap: var(--space-1); flex: 1; min-width: 0;
  padding: 0; text-align: left; color: inherit;
}

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
.ws-header:hover .ws-menu-toggle, .ws-header:focus-within .ws-menu-toggle, .ws-header.active .ws-menu-toggle { opacity: 1; }
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
.hist-row:hover .hist-menu, .hist-row:focus-within .hist-menu, .hist-row.active .hist-menu { opacity: 1; }
.hist-menu:hover { background: var(--color-border); color: var(--color-fg); }
@media (hover: none) {
  .hist-menu { opacity: 0.85; }
}

/* 菜单 */
.menu { position: absolute; top: calc(100% - 2px); right: 4px; z-index: 20; min-width: 140px; padding: var(--space-1); background: var(--color-elevated); border: 1px solid var(--color-border-strong); border-radius: var(--radius); display: flex; flex-direction: column; gap: 1px; }
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
