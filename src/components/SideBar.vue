<script setup>
// 左侧栏(安静)。新建创作 + 当前接口 + 会话历史(按日期分组)+ 设置/存储 + 主题。
import { computed, ref } from 'vue'
import { useWorkbenchStore } from '../stores/workbench.js'
import AppIcon from './AppIcon.vue'
import ConfirmDialog from './ConfirmDialog.vue'

const store = useWorkbenchStore()
const emit = defineEmits(['open-settings', 'open-storage', 'toggle-theme', 'new-canvas'])
const props = defineProps({ theme: String })

const active = computed(() => store.activePreset)
const groups = computed(() => store.conversationGroups)

// 会话项菜单 / 删除确认 / 重命名
const menuFor = ref(null)      // 打开菜单的会话 id
const confirmDel = ref(null)   // 待确认删除的会话 { id, title }
const renaming = ref(null)     // 正在重命名的会话 id
const renameText = ref('')

function openMenu(id, e) { e?.stopPropagation(); menuFor.value = menuFor.value === id ? null : id }
function askDelete(c) { menuFor.value = null; confirmDel.value = { id: c.id, title: c.title } }
async function doDelete() {
  if (confirmDel.value) await store.deleteConversation(confirmDel.value.id)
  confirmDel.value = null
}
function startRename(c) { menuFor.value = null; renaming.value = c.id; renameText.value = c.title }
function commitRename(id) {
  store.renameConversation(id, renameText.value)
  renaming.value = null
}
// 重命名输入框自动聚焦
const vFocus = { mounted: (el) => el.focus() }
</script>

<template>
  <div class="side">
    <div v-if="menuFor" class="menu-backdrop" @click="menuFor = null" />
    <div class="side-top">
      <button class="btn btn-primary new-btn" @click="emit('new-canvas')">
        <AppIcon name="plus" :size="15" /> 新建创作
      </button>

      <!-- 当前接口 -->
      <div class="block">
        <div class="block-label">当前接口</div>
        <div v-if="store.presets.length" class="preset-select">
          <select :value="store.activePresetId" @change="store.selectPreset($event.target.value)" aria-label="选择接口">
            <option v-for="p in store.presets" :key="p.id" :value="p.id">
              {{ p.name || '未命名' }} · {{ p.protocol }}
            </option>
          </select>
          <span v-if="active && !active.apiKey" class="badge badge-warn mini-badge">缺 Key</span>
        </div>
        <button v-else class="btn btn-sm add-first" @click="emit('open-settings')">
          <AppIcon name="plus" :size="13" /> 添加接口
        </button>
      </div>

      <!-- 会话历史(按日期分组) -->
      <div class="history" v-if="groups.length">
        <div v-for="g in groups" :key="g.key" class="hist-group">
          <div class="hist-label">{{ g.label }}</div>
          <div
            v-for="c in g.items" :key="c.id"
            class="hist-row" :class="{ active: c.id === store.conversationId }"
          >
            <!-- 重命名态:输入框 -->
            <input
              v-if="renaming === c.id" class="rename-input" v-model="renameText"
              @keydown.enter="commitRename(c.id)" @keydown.esc="renaming = null"
              @blur="commitRename(c.id)" v-focus
            />
            <template v-else>
              <button class="hist-item" @click="store.switchConversation(c.id)" :title="c.title">
                <AppIcon name="image" :size="13" />
                <span class="hist-title">{{ c.title }}</span>
                <span class="hist-count tnum">{{ c.count }}</span>
              </button>
              <button class="hist-menu" @click="openMenu(c.id, $event)" aria-label="会话操作">⋯</button>
              <!-- 下拉菜单 -->
              <div v-if="menuFor === c.id" class="menu" @click.stop>
                <button class="menu-item" @click="startRename(c)"><AppIcon name="settings" :size="13" /> 重命名</button>
                <button class="menu-item danger" @click="askDelete(c)"><AppIcon name="trash" :size="13" /> 删除会话</button>
              </div>
            </template>
          </div>
        </div>
      </div>
      <p v-else class="hist-empty helper">还没有历史会话。生成后会出现在这里,按日期归档。</p>
    </div>

    <div class="side-bottom">
      <button class="nav-item" @click="emit('open-storage')">
        <AppIcon name="image" :size="16" /> 存储与备份
        <span class="nav-meta tnum">{{ store.assets.length }}</span>
      </button>
      <button class="nav-item" @click="emit('open-settings')">
        <AppIcon name="settings" :size="16" /> 接口设置
      </button>
      <a class="nav-item nav-link" href="https://github.com/MY-Final/draw" target="_blank" rel="noopener noreferrer">
        <AppIcon name="github" :size="16" /> GitHub
      </a>
      <button class="nav-item" @click="emit('toggle-theme')">
        <AppIcon :name="theme === 'dark' ? 'sun' : 'moon'" :size="16" />
        {{ theme === 'dark' ? '浅色模式' : '深色模式' }}
      </button>
    </div>

    <ConfirmDialog
      v-if="confirmDel"
      title="删除会话"
      :message="`将删除会话「${confirmDel.title}」及其全部生成记录。未收藏且未被引用的产出图会一并删除,此操作不可撤销。`"
      confirm-text="删除" danger
      @confirm="doDelete" @cancel="confirmDel = null"
    />
  </div>
</template>

<style scoped>
.side { display: flex; flex-direction: column; height: 100%; justify-content: space-between; gap: var(--space-4); min-height: 0; }
.side-top { display: flex; flex-direction: column; gap: var(--space-4); min-height: 0; flex: 1; overflow: hidden; }
.new-btn { width: 100%; border-radius: var(--radius); flex-shrink: 0; }

.block-label { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--color-fg-subtle); margin-bottom: var(--space-2); }
.preset-select { display: flex; align-items: center; gap: var(--space-2); }
.mini-badge { flex-shrink: 0; }
.add-first { width: 100%; }

/* 会话历史 */
.history { display: flex; flex-direction: column; gap: var(--space-3); overflow-y: auto; min-height: 0; flex: 1; margin: 0 calc(-1 * var(--space-1)); padding: 0 var(--space-1); }
.hist-group { display: flex; flex-direction: column; gap: 2px; }
.hist-label { font-size: 10px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--color-fg-subtle); padding: 0 var(--space-2); margin-bottom: 2px; position: sticky; top: 0; background: var(--color-surface); z-index: 1; }

/* 会话行:item 占满,menu 悬浮显现 */
.hist-row { position: relative; display: flex; align-items: center; border-radius: var(--radius-sm); }
.hist-row:hover { background: var(--color-surface-2); }
.hist-row.active { background: color-mix(in srgb, var(--color-primary) 14%, transparent); }
.hist-item {
  display: flex; align-items: center; gap: var(--space-2); flex: 1; min-width: 0; text-align: left;
  padding: var(--space-2); border-radius: var(--radius-sm); color: var(--color-fg-muted);
  transition: color var(--dur) var(--ease);
}
.hist-row:hover .hist-item, .hist-row.active .hist-item { color: var(--color-fg); }
.hist-row.active .hist-item :deep(svg) { color: var(--color-primary); }
.hist-title { flex: 1; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hist-count { font-size: 10px; color: var(--color-fg-subtle); flex-shrink: 0; }

/* ⋯ 菜单按钮:默认隐藏,悬浮/激活时显现 */
.hist-menu { flex-shrink: 0; width: 26px; height: 26px; margin-right: 2px; border-radius: var(--radius-sm); color: var(--color-fg-subtle); font-size: 16px; line-height: 1; opacity: 0; transition: opacity var(--dur) var(--ease), background var(--dur) var(--ease); }
.hist-row:hover .hist-menu, .hist-row.active .hist-menu { opacity: 1; }
.hist-menu:hover { background: var(--color-border); color: var(--color-fg); }

/* 下拉菜单 */
.menu { position: absolute; top: calc(100% - 2px); right: 4px; z-index: 20; min-width: 132px; padding: var(--space-1); background: var(--color-elevated); border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm); box-shadow: var(--shadow-pop); display: flex; flex-direction: column; gap: 1px; }
.menu-item { display: flex; align-items: center; gap: var(--space-2); width: 100%; text-align: left; padding: var(--space-2); border-radius: var(--radius-sm); font-size: 13px; color: var(--color-fg-muted); }
.menu-item:hover { background: var(--color-surface-2); color: var(--color-fg); }
.menu-item.danger { color: var(--color-destructive); }
.menu-item.danger:hover { background: color-mix(in srgb, var(--color-destructive) 12%, transparent); }

/* 重命名输入 */
.rename-input { width: 100%; padding: var(--space-2); border-radius: var(--radius-sm); border: 1px solid var(--color-primary); background: var(--color-surface); color: var(--color-fg); font-size: 13px; }

.hist-empty { padding: 0 var(--space-2); }

/* 菜单开启时的透明背板,点击外部关闭 */
.menu-backdrop { position: fixed; inset: 0; z-index: 15; }

.side-bottom { display: flex; flex-direction: column; gap: 2px; flex-shrink: 0; }
.nav-item {
  display: flex; align-items: center; gap: var(--space-2); width: 100%;
  padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm);
  font-size: 13px; color: var(--color-fg-muted); text-align: left;
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
}
.nav-item:hover { background: var(--color-surface-2); color: var(--color-fg); }
.nav-link { text-decoration: none; }
.nav-link:visited { color: var(--color-fg-muted); }
.nav-meta { margin-left: auto; font-size: 11px; color: var(--color-fg-subtle); }
</style>
