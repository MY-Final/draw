<script setup>
// 画室布局:左「项目账簿」· 中「工作台(作品 + 底部创作稿纸)」· 右「素材」。
// 低频操作进抽屉;结构靠细线与编号,图片占据版面主体。
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWorkbenchStore } from './stores/workbench.js'
import SideBar from './components/SideBar.vue'
import ResultsView from './components/ResultsView.vue'
import Composer from './components/Composer.vue'
import LibraryPanel from './components/LibraryPanel.vue'
import PresetManager from './components/PresetManager.vue'
import BackupTools from './components/BackupTools.vue'
import ImageLightbox from './components/ImageLightbox.vue'
import UnifiedSearch from './components/UnifiedSearch.vue'
import BackupReminderDialog from './components/BackupReminderDialog.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import UndoToast from './components/UndoToast.vue'
import AppIcon from './components/AppIcon.vue'
import { useDialogA11y } from './composables/useDialogA11y.js'

const store = useWorkbenchStore()
const { t } = useI18n()
const composer = ref(null)
const dock = ref(null)
const preview = ref(null)
const previewList = ref([])
const settingsOpen = ref(false)
const storageOpen = ref(false)
// 打开接口弹窗时是否直接进入「新建」表单(侧栏「添加接口」)
const settingsStartCreate = ref(false)
const rightOpen = ref(true)
// 移动端:给素材库一个底部入口(桌面端右侧栏在小屏被隐藏)
const mobileAssetsOpen = ref(false)
// 移动端:侧栏工作区树抽屉
const mobileNavOpen = ref(false)
const mobileMenuButton = ref(null)
const mobileNavPanel = ref(null)
const mobileAssetsSheet = ref(null)
const theme = ref('light')
const searchOpen = ref(false)
const showBackupReminder = ref(false)
const reminderBytes = ref(0)
const booting = ref(true)
const bootError = ref('')
let dockObserver = null
// Win/Linux 显示 Ctrl,macOS 显示 ⌘
const isApple = computed(() => {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '')
})
const searchModKey = computed(() => (isApple.value ? '⌘' : 'Ctrl'))

// 工作台抬头:当前工作区 / 会话 / 作品数
const activeWorkspace = computed(
  () => store.workspaces.find((w) => w.id === store.activeWorkspaceId) || null,
)
const currentConversationTitle = computed(() => {
  if (!store.conversationId) return ''
  const conv = (store.conversations || []).find((c) => c.id === store.conversationId)
  return store.titleOverrides?.[store.conversationId] || conv?.title || t('sidebar.newConversation')
})
const plateCount = computed(() => store.canvasGenerations?.length || 0)
const plateIndex = computed(() => String(plateCount.value).padStart(2, '0'))

useDialogA11y(mobileNavPanel, () => { mobileNavOpen.value = false })
useDialogA11y(mobileAssetsSheet, () => { mobileAssetsOpen.value = false })

async function initialize() {
  booting.value = true
  bootError.value = ''
  try {
    await store.init()
    const saved = localStorage.getItem('workbench.theme')
    setTheme(saved || 'light')
    const r = await store.checkBackupReminder()
    if (r) { showBackupReminder.value = true; reminderBytes.value = store.usage?.businessBytes || 0 }
  } catch (error) {
    bootError.value = error?.message || t('app.loadFailedDefault')
  } finally {
    booting.value = false
  }
}

onMounted(async () => {
  await initialize()
  document.addEventListener('keydown', onGlobalKeydown)
  if (typeof ResizeObserver !== 'undefined' && dock.value) {
    const updateDockHeight = () => {
      document.documentElement.style.setProperty('--composer-height', `${dock.value?.offsetHeight || 0}px`)
    }
    dockObserver = new ResizeObserver(updateDockHeight)
    dockObserver.observe(dock.value)
    updateDockHeight()
  }
})

// 生成完成后检查备份提醒
watch(() => store.generating, async (val) => {
  if (!val && store.generations.length > 0) {
    const r = await store.checkBackupReminder()
    if (r) { showBackupReminder.value = true; reminderBytes.value = store.usage?.businessBytes || 0 }
  }
})

function onReminderClose(action) {
  showBackupReminder.value = false
  if (action === 'backup') storageOpen.value = true
}

onUnmounted(() => {
  document.removeEventListener('keydown', onGlobalKeydown)
  dockObserver?.disconnect()
})

function isTypingTarget(el) {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

function onGlobalKeydown(e) {
  // ⌘K / Ctrl+K 打开搜索
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    searchOpen.value = !searchOpen.value
    return
  }
  // 「/」聚焦输入框(GitHub / Slack 的肌肉记忆);在输入框里打 / 不拦截
  if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target)) {
    e.preventDefault()
    composer.value?.focusInput?.()
    return
  }
  // Alt+N 新建创作。不用 Ctrl+N:那个组合被浏览器「新建窗口」占用,抢不过来。
  if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'n' || e.key === 'N')) {
    e.preventDefault()
    onNewCanvas()
  }
}

async function onSearchJump(item) {
  switch (item.type) {
    case 'workspace':
      await store.switchWorkspace(item.wsId)
      break
    case 'conversation':
      await store.switchWorkspace(item.wsId)
      store.switchConversation(item.convId)
      break
    case 'prompt':
      await store.switchWorkspace(item.wsId)
      composer.value?.fillPrompt?.(item.label)
      composer.value?.focusInput?.()
      break
    case 'asset':
      await store.switchWorkspace(item.wsId)
      openPreview({ asset: item.asset, list: [item.asset] })
      break
  }
}

function setTheme(t) {
  theme.value = t
  document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark')
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', t === 'light' ? '#f2f0ea' : '#15140f')
  try { localStorage.setItem('workbench.theme', t) } catch { /* 主题只影响当前页面 */ }
}
function toggleTheme() { setTheme(theme.value === 'dark' ? 'light' : 'dark') }

function useAsReference(id) { composer.value?.addReference(id) }

// 删除撤销提示统一挂在 App 层:侧栏/素材库在移动端是抽屉,组件一卸载提示就没了,
// 撤销状态存在 store 里,提示也必须活在同一层。
const conversationUndoMessage = computed(() => {
  const entries = store.pendingConversationDelete?.entries || []
  if (!entries.length) return ''
  return entries.length === 1
    ? t('app.undo.conversationOne', { title: entries[0].title })
    : t('app.undo.conversationMany', { count: entries.length })
})
const assetUndoMessage = computed(() => {
  const count = store.pendingAssetDelete?.ids?.length || 0
  return count ? t('app.undo.assets', { count }) : ''
})
const workspaceUndoMessage = computed(() => {
  const name = store.pendingWorkspaceDelete?.workspace?.name
  return name ? t('app.undo.workspace', { name }) : ''
})
const hasAnyUndo = computed(() => !!(
  store.pendingAssetDelete || store.pendingConversationDelete || store.pendingWorkspaceDelete
))
function undoAssetDelete() {
  const batchId = store.pendingAssetDelete?.batchId
  if (batchId) store.undoAssetDelete(batchId)
}
function undoConversationDelete() {
  const batchId = store.pendingConversationDelete?.batchId
  if (batchId) store.undoConversationDelete(batchId)
}
function undoWorkspaceDelete() {
  const batchId = store.pendingWorkspaceDelete?.batchId
  if (batchId) store.undoWorkspaceDelete(batchId)
}
// 冷启动灵感标签:填入并聚焦,用户可以直接改词或按 Ctrl/Cmd+Enter 生成。
function onFillPrompt(text) {
  composer.value?.fillPrompt?.(text)
  composer.value?.focusInput?.()
}
const pendingRecipe = ref(null)
function applyRecipe(prefill) {
  composer.value?.applyPrefill(prefill)
  storageOpen.value = false
}
function onRecipeImported(prefill) {
  // 输入区有草稿(prompt/参考图)时先确认,避免配方导入静默覆盖用户已填内容
  if (composer.value?.hasDraft?.()) {
    pendingRecipe.value = prefill
    return
  }
  applyRecipe(prefill)
}
function confirmApplyRecipe() {
  applyRecipe(pendingRecipe.value)
  pendingRecipe.value = null
}

// 预览大图:带相邻图片列表,支持左右切换(多图生成/素材库内浏览)。
function openPreview(payload) {
  const asset = payload?.asset || payload
  preview.value = asset
  previewList.value = Array.isArray(payload?.list) && payload.list.length ? payload.list : [asset]
}
function closePreview() {
  preview.value = null
  previewList.value = []
}

// 切换会话/工作区后输入区回到空白:避免把上一段会话的 prompt/参考图带到新上下文发出去。
watch(() => [store.conversationId, store.activeWorkspaceId], () => {
  composer.value?.clear()
})

function onNewCanvas() {
  store.newConversation()   // 开一段空白会话(旧会话与图仍保留、可从左侧切回)
  composer.value?.clear()
  closePreview()
  mobileNavOpen.value = false
}
function closeMobileNav() {
  const wasOpen = mobileNavOpen.value
  mobileNavOpen.value = false
  if (wasOpen) mobileMenuButton.value?.focus()
}
function openSettings(opts) {
  settingsStartCreate.value = !!opts?.create
  settingsOpen.value = true
  closeMobileNav()
}
function openStorage() {
  storageOpen.value = true
  closeMobileNav()
}
</script>

<template>
  <div class="app">
    <!-- 左侧项目账簿(桌面) -->
    <aside class="rail">
      <div class="logo" :title="t('app.title')">
        <span class="logo-mark" aria-hidden="true">
          <i class="sw sw-blue" /><i class="sw sw-red" /><i class="sw sw-ochre" /><i class="sw sw-ink" />
        </span>
        <div class="logo-copy">
          <span class="logo-text">{{ t('app.brand') }}</span>
          <span class="logo-sub">{{ t('app.brandSub') }}</span>
        </div>
      </div>
      <button class="search-chip" @click="searchOpen = true" :title="`${t('app.search')} (${searchModKey} K)`">
        <AppIcon name="search" :size="14" />
        <span>{{ t('app.search') }}</span>
        <kbd>{{ searchModKey }} K</kbd>
      </button>
      <div class="rail-side">
        <SideBar
          :theme="theme"
          @open-settings="openSettings"
          @open-storage="openStorage"
          @toggle-theme="toggleTheme"
          @new-canvas="onNewCanvas"
        />
      </div>
    </aside>

    <!-- 移动端顶栏 -->
    <header class="mobile-top">
      <button ref="mobileMenuButton" class="mobile-icon-btn" @click="mobileNavOpen = true" :aria-label="t('app.openMenu')">
        <AppIcon name="menu" :size="18" />
      </button>
      <div class="mobile-brand">
        <span class="logo-mark mobile-logo" aria-hidden="true">
          <i class="sw sw-blue" /><i class="sw sw-red" /><i class="sw sw-ochre" /><i class="sw sw-ink" />
        </span>
        <span class="mobile-title">{{ t('app.brand') }}</span>
      </div>
      <button class="mobile-icon-btn mobile-assets-btn" @click="mobileAssetsOpen = true" :aria-label="t('app.openAssets')" :title="t('app.openAssets')">
        <AppIcon name="layers" :size="16" />
        <span class="mobile-assets-count tnum">{{ store.workspaceAssets.length }}</span>
      </button>
      <button class="mobile-icon-btn" @click="searchOpen = true" :aria-label="`${t('app.search')} (${searchModKey}+K)`">
        <AppIcon name="search" :size="16" />
      </button>
    </header>

    <!-- 中间工作台 -->
    <main class="center">
      <header class="studio-top">
        <div class="studio-id">
          <span class="studio-ws">{{ activeWorkspace?.name || t('app.brand') }}</span>
          <span class="studio-slash" aria-hidden="true">/</span>
          <span class="studio-conv">{{ currentConversationTitle }}</span>
        </div>
        <div class="studio-meta" :title="t('library.count', { count: plateCount })">
          <span class="studio-plate-index tnum">{{ plateIndex }}</span>
          <span class="mono-label">{{ t('app.plates') }}</span>
        </div>
      </header>
      <div class="stream">
        <ResultsView
          @use-as-reference="useAsReference"
          @preview="openPreview"
          @reuse="(prefill) => composer?.applyPrefill?.(prefill)"
          @fill-prompt="onFillPrompt"
          @open-settings="openSettings"
        />
      </div>
      <div ref="dock" class="dock">
        <Composer
          ref="composer"
          @open-settings="openSettings"
          @preview="openPreview"
        />
      </div>
    </main>

    <!-- 右侧素材(可收起) -->
    <aside class="assets" :class="{ collapsed: !rightOpen }">
      <button class="collapse-tab" @click="rightOpen = !rightOpen" :aria-label="rightOpen ? t('app.collapseAssets') : t('app.expandAssets')">
        <AppIcon :name="rightOpen ? 'chevron-right' : 'chevron-left'" :size="13" />
        <span v-if="!rightOpen" class="collapse-tab-label">{{ t('app.assetsShort') }}</span>
      </button>
      <div v-if="rightOpen" class="assets-body">
        <LibraryPanel @use-as-reference="useAsReference" @preview="openPreview" />
      </div>
    </aside>

    <!-- 移动端侧栏抽屉 -->
    <Transition name="nav">
      <div v-if="mobileNavOpen" class="mobile-nav-scrim" @click.self="mobileNavOpen = false">
        <div ref="mobileNavPanel" class="mobile-nav-panel" role="dialog" aria-modal="true" :aria-label="t('app.nav')" tabindex="-1">
          <div class="mobile-nav-head">
            <div class="logo" :title="t('app.title')">
              <span class="logo-mark" aria-hidden="true">
                <i class="sw sw-blue" /><i class="sw sw-red" /><i class="sw sw-ochre" /><i class="sw sw-ink" />
              </span>
              <div class="logo-copy">
                <span class="logo-text">{{ t('app.brand') }}</span>
                <span class="logo-sub">{{ t('app.brandSub') }}</span>
              </div>
            </div>
            <button class="mobile-icon-btn" @click="mobileNavOpen = false" :aria-label="t('app.closeMenu')">
              <AppIcon name="x" :size="16" />
            </button>
          </div>
          <button class="search-chip mobile-search" @click="searchOpen = true; mobileNavOpen = false">
            <AppIcon name="search" :size="14" />
            <span>{{ t('app.search') }}</span>
            <kbd>{{ searchModKey }} K</kbd>
          </button>
          <div class="mobile-nav-body">
            <SideBar
              :theme="theme"
              @open-settings="openSettings"
              @open-storage="openStorage"
              @toggle-theme="toggleTheme"
              @new-canvas="onNewCanvas"
            />
          </div>
        </div>
      </div>
    </Transition>

    <!-- 移动端素材抽屉(桌面右侧栏在 ≤1024 隐藏) -->
    <Transition name="sheet">
      <div v-if="mobileAssetsOpen" class="mobile-assets-scrim" @click.self="mobileAssetsOpen = false">
        <div ref="mobileAssetsSheet" class="mobile-assets-sheet" role="dialog" aria-modal="true" :aria-label="t('app.assetsLibrary')" tabindex="-1">
          <div class="mobile-assets-grip" aria-hidden="true"><span /></div>
          <div class="mobile-assets-body">
            <LibraryPanel
              closable
              @close="mobileAssetsOpen = false"
              @use-as-reference="(id) => { useAsReference(id); mobileAssetsOpen = false }"
              @preview="openPreview"
            />
          </div>
        </div>
      </div>
    </Transition>
    <!-- 抽屉 -->
    <PresetManager
      v-if="settingsOpen"
      :start-create="settingsStartCreate || !store.presets.length"
      @close="settingsOpen = false; settingsStartCreate = false"
    />
    <BackupTools
      v-if="storageOpen"
      @recipe-imported="onRecipeImported"
      @close="storageOpen = false"
    />

    <ImageLightbox
      v-if="preview"
      :asset="preview" :list="previewList"
      @change="preview = $event"
      @close="closePreview"
      @use-as-reference="(id) => { useAsReference(id); closePreview() }"
    />

    <div v-if="hasAnyUndo" class="undo-stack">
      <UndoToast
        v-if="store.pendingAssetDelete" :fixed="false"
        :message="assetUndoMessage" @undo="undoAssetDelete"
      />
      <UndoToast
        v-if="store.pendingConversationDelete" :fixed="false"
        :message="conversationUndoMessage" @undo="undoConversationDelete"
      />
      <UndoToast
        v-if="store.pendingWorkspaceDelete" :fixed="false"
        :message="workspaceUndoMessage" @undo="undoWorkspaceDelete"
      />
    </div>

    <UnifiedSearch :visible="searchOpen" @close="searchOpen = false" @jump="onSearchJump" />

    <BackupReminderDialog
      v-if="showBackupReminder" :business-bytes="reminderBytes"
      @close="onReminderClose"
    />

    <ConfirmDialog
      v-if="pendingRecipe"
      :title="t('app.recipeOverwriteTitle')"
      :message="t('app.recipeOverwriteMessage')"
      :confirm-text="t('app.recipeOverwriteConfirm')" danger
      @confirm="confirmApplyRecipe" @cancel="pendingRecipe = null"
    />
  </div>
  <div v-if="booting || bootError" class="boot-screen" role="status" aria-live="polite">
    <div class="boot-panel">
      <span class="logo-mark boot-mark" aria-hidden="true">
        <i class="sw sw-blue" /><i class="sw sw-red" /><i class="sw sw-ochre" /><i class="sw sw-ink" />
      </span>
      <span class="mono-label">{{ bootError ? 'ERROR' : 'ATELIER' }}</span>
      <strong>{{ bootError ? t('app.loadFailed') : t('app.loading') }}</strong>
      <p v-if="bootError">{{ bootError }}</p>
      <button v-if="bootError" class="btn btn-primary" type="button" @click="initialize">{{ t('app.retry') }}</button>
    </div>
  </div>
</template>

<style scoped>
.app {
  display: grid;
  grid-template-columns: var(--ledger-w) minmax(0, 1fr) auto;
  grid-template-rows: 1fr;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: var(--color-bg);
}
.undo-stack {
  position: fixed; bottom: calc(var(--composer-height, 240px) + 18px); left: 50%;
  transform: translateX(-50%); z-index: 60;
  display: flex; flex-direction: column; align-items: center; gap: var(--space-2);
}

/* ── 启动页 ── */
.boot-screen {
  position: fixed; inset: 0; z-index: 1200;
  display: grid; place-items: center; padding: var(--space-4);
  background: var(--color-bg);
}
.boot-panel {
  width: min(340px, 100%); display: flex; flex-direction: column; align-items: center;
  gap: var(--space-2); text-align: center; color: var(--color-fg-muted);
}
.boot-panel strong { color: var(--color-fg); font-size: 15px; margin-top: var(--space-2); }
.boot-panel p { margin: 0; font-size: 12.5px; line-height: 1.6; font-family: var(--font-mono); }
.boot-mark { width: 40px; height: 40px; margin-bottom: var(--space-2); }

/* ── 项目账簿 ── */
.rail {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-4) var(--space-3);
  border-right: 1px solid var(--color-border);
  background: var(--color-surface);
  overflow: hidden;
  min-height: 0;
}
.rail-side { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  min-width: 0;
  padding: 2px 0 4px;
}
.logo-mark {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 2px;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  transform: rotate(-3deg);
}
.sw { display: block; }
.sw-blue { background: var(--color-primary); }
.sw-red { background: var(--color-destructive); }
.sw-ochre { background: var(--color-accent); }
.sw-ink { background: var(--color-ink); }
:root[data-theme='dark'] .sw-ink { background: var(--color-fg); }
.logo-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.1;
}
.logo-text {
  font-size: 15px;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--color-fg);
}
.logo-sub {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-fg-subtle);
  margin-top: 3px;
  white-space: nowrap;
}
.search-chip {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-height: 34px;
  padding: 0 10px;
  border-radius: var(--radius);
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-fg-muted);
  font-size: 12px;
  flex-shrink: 0;
  transition: border-color var(--dur) var(--ease), color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.search-chip:hover {
  border-color: var(--color-border-strong);
  color: var(--color-fg);
  background: var(--color-elevated);
}
.search-chip span { flex: 1; text-align: left; }
.search-chip kbd {
  border: none;
  background: transparent;
  padding: 0;
  font-size: 9.5px;
  letter-spacing: 0.06em;
}

/* ── 中央工作台 ── */
.center {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--color-bg);
}
.studio-top {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  height: 50px;
  padding: 0 var(--space-6);
  border-bottom: 1px solid var(--color-border);
}
.studio-id {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  font-size: 12.5px;
}
.studio-ws {
  font-weight: 700;
  color: var(--color-fg);
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.studio-slash { color: var(--color-border-strong); font-family: var(--font-mono); }
.studio-conv {
  color: var(--color-fg-subtle);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.studio-meta {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-shrink: 0;
}
.studio-plate-index {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-fg);
}
.stream {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.dock {
  flex-shrink: 0;
  padding: var(--space-4) var(--space-6) calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
  background: var(--color-bg);
  border-top: 1px solid var(--color-border);
}

/* ── 素材栏 ── */
.assets {
  position: relative;
  width: var(--materials-w);
  border-left: 1px solid var(--color-border);
  background: var(--color-surface);
  transition: width var(--dur) var(--ease-out);
  min-height: 0;
}
.assets.collapsed { width: 30px; }
.assets-body { height: 100%; overflow-y: auto; padding: var(--space-4); }
.collapse-tab {
  position: absolute;
  top: 14px;
  left: -14px;
  z-index: 5;
  width: 28px;
  height: 56px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border-radius: 0;
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  color: var(--color-fg-muted);
  transition: color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.collapse-tab:hover { color: var(--color-fg); background: var(--color-elevated); }
.assets.collapsed .collapse-tab {
  left: 0;
  top: 14px;
  width: 30px;
  height: 100%;
  border: none;
  border-left: none;
  background: transparent;
}
.collapse-tab-label {
  writing-mode: vertical-rl;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.18em;
  writing-mode: vertical-rl;
}

/* ── 移动端 ── */
.mobile-top { display: none; }
.mobile-icon-btn {
  width: 38px; height: 38px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: var(--radius); color: var(--color-fg-muted);
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
}
.mobile-icon-btn:hover { background: var(--color-surface-2); color: var(--color-fg); }

.mobile-nav-scrim {
  position: fixed; inset: 0; z-index: 55;
  background: var(--color-scrim);
  display: flex; justify-content: flex-start;
}
.mobile-nav-panel {
  width: min(88vw, 320px); height: 100%;
  background: var(--color-surface);
  border-right: 1px solid var(--color-border-strong);
  display: flex; flex-direction: column;
  padding: var(--space-3);
  gap: var(--space-3);
  overflow: hidden;
}
.mobile-nav-head {
  display: flex; align-items: center; justify-content: space-between; gap: var(--space-2);
  flex-shrink: 0;
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--color-border);
}
.mobile-nav-body { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.mobile-search { flex-shrink: 0; }

.nav-enter-active, .nav-leave-active { transition: opacity 160ms var(--ease); }
.nav-enter-active .mobile-nav-panel,
.nav-leave-active .mobile-nav-panel { transition: transform 200ms var(--ease-out); }
.nav-enter-from, .nav-leave-to { opacity: 0; }
.nav-enter-from .mobile-nav-panel,
.nav-leave-to .mobile-nav-panel { transform: translateX(-12px); }

.mobile-assets-btn { width: auto; gap: 5px; padding: 0 8px; }
.mobile-assets-count {
  font-family: var(--font-mono); font-size: 10px; line-height: 1;
  color: var(--color-fg-subtle);
}
.mobile-assets-scrim {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: var(--color-scrim);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.mobile-assets-sheet {
  width: min(100%, 560px);
  max-height: 84vh;
  background: var(--color-bg);
  border: 1px solid var(--color-border-strong);
  border-bottom: none;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 -12px 0 color-mix(in srgb, var(--color-ink) 8%, transparent);
}
.mobile-assets-grip {
  display: flex; justify-content: center; padding: 10px 0 2px; flex-shrink: 0;
}
.mobile-assets-grip span {
  width: 34px; height: 3px; background: var(--color-border-strong);
}
.mobile-assets-body { overflow-y: auto; padding: var(--space-4); flex: 1; min-height: 0; }

.sheet-enter-active,
.sheet-leave-active { transition: opacity 160ms var(--ease); }
.sheet-enter-active .mobile-assets-sheet,
.sheet-leave-active .mobile-assets-sheet { transition: transform 200ms var(--ease-out); }
.sheet-enter-from,
.sheet-leave-to { opacity: 0; }
.sheet-enter-from .mobile-assets-sheet,
.sheet-leave-to .mobile-assets-sheet { transform: translateY(18px); }

@media (max-width: 1280px) {
  .app { --materials-w: 284px; --ledger-w: 260px; }
}
@media (max-width: 1024px) {
  .app {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
    overflow: hidden;
  }
  .rail { display: none; }
  .studio-top { display: none; }
  .mobile-top {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface);
    min-height: 48px;
  }
  .mobile-brand {
    flex: 1; min-width: 0;
    display: flex; align-items: center; gap: var(--space-2);
  }
  .mobile-logo { width: 26px; height: 26px; }
  .mobile-title {
    font-size: 14px; font-weight: 800; color: var(--color-fg);
    letter-spacing: -0.03em;
  }
  .assets { display: none; }
  .dock { padding: var(--space-3) var(--space-3) calc(var(--space-2) + env(safe-area-inset-bottom, 0px)); }
  .undo-stack { bottom: calc(var(--composer-height, 248px) + 12px); width: calc(100% - 28px); }
}
</style>
