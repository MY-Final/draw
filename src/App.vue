<script setup>
// 对话式布局:左安静栏 · 中(结果流 + 底部固定输入)· 右素材库。低频操作进抽屉。
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
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
import AppIcon from './components/AppIcon.vue'

const store = useWorkbenchStore()
const composer = ref(null)
const preview = ref(null)
const settingsOpen = ref(false)
const storageOpen = ref(false)
// 打开接口弹窗时是否直接进入「新建」表单(侧栏「添加接口」)
const settingsStartCreate = ref(false)
const rightOpen = ref(true)
// 移动端:给素材库一个底部入口(桌面端右侧栏在小屏被隐藏)
const mobileAssetsOpen = ref(false)
// 移动端:侧栏工作区树抽屉
const mobileNavOpen = ref(false)
const theme = ref('dark')
const searchOpen = ref(false)
const showBackupReminder = ref(false)
const reminderBytes = ref(0)
// Win/Linux 显示 Ctrl,macOS 显示 ⌘
const isApple = computed(() => {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '')
})
const searchModKey = computed(() => (isApple.value ? '⌘' : 'Ctrl'))

onMounted(async () => {
  await store.init()
  const saved = localStorage.getItem('workbench.theme')
  setTheme(saved || 'dark')
  document.addEventListener('keydown', onGlobalKeydown)
  // 初始化后检查备份提醒
  const r = await store.checkBackupReminder()
  if (r) { showBackupReminder.value = true; reminderBytes.value = store.usage?.businessBytes || 0 }
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
})

function onGlobalKeydown(e) {
  // ⌘K / Ctrl+K 打开搜索
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    searchOpen.value = !searchOpen.value
  }
  if (e.key === 'Escape') {
    if (mobileAssetsOpen.value) mobileAssetsOpen.value = false
    if (mobileNavOpen.value) mobileNavOpen.value = false
  }
}

function onSearchJump(item) {
  switch (item.type) {
    case 'workspace':
      store.switchWorkspace(item.wsId)
      break
    case 'conversation':
      store.switchWorkspace(item.wsId)
      store.switchConversation(item.convId)
      break
    case 'prompt':
      composer.value?.fillPrompt?.(item.label)
      break
    case 'asset':
      preview.value = item.asset
      break
  }
}

function setTheme(t) {
  theme.value = t
  document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark')
  localStorage.setItem('workbench.theme', t)
}
function toggleTheme() { setTheme(theme.value === 'dark' ? 'light' : 'dark') }

function useAsReference(id) { composer.value?.addReference(id) }
function onRecipeImported(prefill) { composer.value?.applyPrefill(prefill); storageOpen.value = false }
function onNewCanvas() {
  store.newConversation()   // 开一段空白会话(旧会话与图仍保留、可从左侧切回)
  composer.value?.clear()
  preview.value = null
  mobileNavOpen.value = false
}
function openSettings(opts) {
  settingsStartCreate.value = !!opts?.create
  settingsOpen.value = true
  mobileNavOpen.value = false
}
function openStorage() {
  storageOpen.value = true
  mobileNavOpen.value = false
}
</script>

<template>
  <div class="app">
    <!-- 左侧安静栏(桌面) -->
    <aside class="rail">
      <div class="logo" title="AI 绘画工作台">
        <span class="logo-mark" aria-hidden="true">
          <span class="logo-mark-glow" />
          <AppIcon name="sparkles" :size="15" />
        </span>
        <div class="logo-copy">
          <span class="logo-text">绘画工作台</span>
          <span class="logo-sub">本地 · 零后端</span>
        </div>
      </div>
      <button class="search-chip" @click="searchOpen = true" title="搜索 (Ctrl/⌘ K)">
        <AppIcon name="search" :size="14" />
        <span>搜索</span>
        <kbd>{{ searchModKey }}K</kbd>
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
      <button class="mobile-icon-btn" @click="mobileNavOpen = true" aria-label="打开菜单">
        <AppIcon name="menu" :size="18" />
      </button>
      <div class="mobile-brand">
        <span class="logo-mark mobile-logo" aria-hidden="true">
          <AppIcon name="sparkles" :size="13" />
        </span>
        <span class="mobile-title">绘画工作台</span>
      </div>
      <button class="mobile-icon-btn" @click="searchOpen = true" :aria-label="`搜索 (${searchModKey}+K)`">
        <AppIcon name="search" :size="16" />
      </button>
    </header>

    <!-- 中间:结果流 + 底部输入 -->
    <main class="center">
      <div class="stream">
        <ResultsView @use-as-reference="useAsReference" @preview="preview = $event" />
      </div>
      <div class="dock">
        <Composer
          ref="composer"
          @open-settings="settingsStartCreate = false; settingsOpen = true"
        />
      </div>
    </main>

    <!-- 右侧素材库(可收起) -->
    <aside class="assets" :class="{ collapsed: !rightOpen }">
      <button class="collapse-tab" @click="rightOpen = !rightOpen" :aria-label="rightOpen ? '收起素材库' : '展开素材库'">
        <AppIcon :name="rightOpen ? 'chevron-right' : 'layers'" :size="14" />
      </button>
      <div v-if="rightOpen" class="assets-body">
        <LibraryPanel @use-as-reference="useAsReference" @preview="preview = $event" />
      </div>
    </aside>

    <!-- 移动端侧栏抽屉 -->
    <Transition name="nav">
      <div v-if="mobileNavOpen" class="mobile-nav-scrim" @click.self="mobileNavOpen = false">
        <div class="mobile-nav-panel" role="dialog" aria-label="导航">
          <div class="mobile-nav-head">
            <div class="logo" title="AI 绘画工作台">
              <span class="logo-mark" aria-hidden="true">
                <span class="logo-mark-glow" />
                <AppIcon name="sparkles" :size="15" />
              </span>
              <div class="logo-copy">
                <span class="logo-text">绘画工作台</span>
                <span class="logo-sub">本地 · 零后端</span>
              </div>
            </div>
            <button class="mobile-icon-btn" @click="mobileNavOpen = false" aria-label="关闭菜单">
              <AppIcon name="x" :size="16" />
            </button>
          </div>
          <button class="search-chip mobile-search" @click="searchOpen = true; mobileNavOpen = false">
            <AppIcon name="search" :size="14" />
            <span>搜索</span>
            <kbd>{{ searchModKey }}K</kbd>
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

    <!-- 移动端素材库抽屉(桌面右侧栏在 ≤1024 隐藏) -->
    <Transition name="sheet">
      <div v-if="mobileAssetsOpen" class="mobile-assets-scrim" @click.self="mobileAssetsOpen = false">
        <div class="mobile-assets-sheet" role="dialog" aria-label="素材库">
          <div class="mobile-assets-handle" aria-hidden="true" />
          <div class="mobile-assets-head">
            <strong>素材库</strong>
            <button class="btn btn-sm btn-ghost" @click="mobileAssetsOpen = false" aria-label="关闭">
              <AppIcon name="x" :size="14" />
            </button>
          </div>
          <div class="mobile-assets-body">
            <LibraryPanel @use-as-reference="(id) => { useAsReference(id); mobileAssetsOpen = false }" @preview="preview = $event" />
          </div>
        </div>
      </div>
    </Transition>
    <button class="mobile-assets-fab" @click="mobileAssetsOpen = true" aria-label="打开素材库">
      <AppIcon name="layers" :size="18" />
    </button>

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
      :asset="preview"
      @close="preview = null"
      @use-as-reference="(id) => { useAsReference(id); preview = null }"
    />

    <UnifiedSearch :visible="searchOpen" @close="searchOpen = false" @jump="onSearchJump" />

    <BackupReminderDialog
      v-if="showBackupReminder" :business-bytes="reminderBytes"
      @close="onReminderClose"
    />
  </div>
</template>

<style scoped>
.app {
  display: grid;
  grid-template-columns: 260px 1fr auto;
  grid-template-rows: 1fr;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background:
    radial-gradient(1200px 600px at 70% -10%, color-mix(in srgb, var(--color-primary) 12%, transparent), transparent 55%),
    radial-gradient(900px 500px at 0% 100%, color-mix(in srgb, var(--color-accent) 7%, transparent), transparent 50%),
    radial-gradient(700px 360px at 100% 60%, color-mix(in srgb, var(--color-primary) 5%, transparent), transparent 60%),
    var(--color-bg);
}
:root[data-theme='light'] .app {
  background:
    radial-gradient(1100px 520px at 72% -8%, color-mix(in srgb, var(--color-primary) 14%, transparent), transparent 58%),
    radial-gradient(820px 420px at 0% 100%, color-mix(in srgb, var(--color-accent) 8%, transparent), transparent 52%),
    linear-gradient(180deg, color-mix(in srgb, #fff 70%, var(--color-bg)), var(--color-bg) 42%),
    var(--color-bg);
}

.rail {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border-right: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-surface) 92%, transparent);
  backdrop-filter: blur(12px);
  overflow: hidden;
  min-height: 0;
}
.rail-side { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.logo {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
  min-width: 0;
}
.logo-mark {
  position: relative;
  width: 32px;
  height: 32px;
  border-radius: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-on-primary);
  background: linear-gradient(145deg, var(--color-primary-hover), var(--color-primary));
  box-shadow:
    0 1px 0 color-mix(in srgb, #fff 22%, transparent) inset,
    0 8px 18px color-mix(in srgb, var(--color-primary) 32%, transparent);
  flex-shrink: 0;
  overflow: hidden;
}
.logo-mark-glow {
  position: absolute;
  inset: -30% -20% auto auto;
  width: 70%;
  height: 70%;
  border-radius: 50%;
  background: color-mix(in srgb, #fff 28%, transparent);
  filter: blur(6px);
  pointer-events: none;
}
.logo-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.15;
}
.logo-text {
  font-size: 14px;
  font-weight: 650;
  letter-spacing: -0.01em;
  color: var(--color-fg);
}
.logo-sub {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--color-fg-subtle);
  margin-top: 2px;
}
.search-chip {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-height: 36px;
  padding: 0 var(--space-3);
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-2);
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
.search-chip kbd {
  margin-left: auto;
  font-family: var(--font-num);
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  color: var(--color-fg-subtle);
  background: var(--color-bg);
}

.center {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: transparent;
}
.stream {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.dock {
  flex-shrink: 0;
  padding: var(--space-3) var(--space-4) calc(var(--space-4) + env(safe-area-inset-bottom, 0px));
  background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--color-bg) 75%, transparent) 28%, var(--color-glass));
  backdrop-filter: blur(14px);
  border-top: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent);
}

.assets {
  position: relative;
  width: 300px;
  border-left: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-surface) 92%, transparent);
  backdrop-filter: blur(12px);
  transition: width var(--dur) var(--ease-out);
  min-height: 0;
}
.assets.collapsed { width: 0; border-left: none; }
.assets-body { height: 100%; overflow-y: auto; padding: var(--space-4); }
.assets-body :deep(.lib-head) { padding-left: var(--space-1); }
.collapse-tab {
  position: absolute;
  top: var(--space-4);
  left: -14px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--color-elevated);
  border: 1px solid var(--color-border-strong);
  color: var(--color-fg-muted);
  box-shadow: var(--shadow-1);
  z-index: 5;
  transition: color var(--dur) var(--ease), transform var(--dur) var(--ease);
}
.collapse-tab:hover { color: var(--color-fg); transform: scale(1.04); }

/* 移动端顶栏:默认隐藏 */
.mobile-top { display: none; }
.mobile-icon-btn {
  width: 40px; height: 40px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 12px; color: var(--color-fg-muted);
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
}
.mobile-icon-btn:hover { background: var(--color-surface-2); color: var(--color-fg); }

.mobile-nav-scrim {
  position: fixed; inset: 0; z-index: 55;
  background: var(--color-scrim);
  display: flex; justify-content: flex-start;
}
.mobile-nav-panel {
  width: min(86vw, 320px); height: 100%;
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
  box-shadow: var(--shadow-pop);
  display: flex; flex-direction: column;
  padding: var(--space-3);
  gap: var(--space-3);
  overflow: hidden;
}
.mobile-nav-head {
  display: flex; align-items: center; justify-content: space-between; gap: var(--space-2);
  flex-shrink: 0;
}
.mobile-nav-body { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.mobile-search { flex-shrink: 0; }

.nav-enter-active, .nav-leave-active { transition: opacity 180ms var(--ease); }
.nav-enter-active .mobile-nav-panel,
.nav-leave-active .mobile-nav-panel { transition: transform 220ms var(--ease-out); }
.nav-enter-from, .nav-leave-to { opacity: 0; }
.nav-enter-from .mobile-nav-panel,
.nav-leave-to .mobile-nav-panel { transform: translateX(-16px); }

@media (max-width: 1024px) {
  .app {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
    overflow: hidden;
  }
  .rail { display: none; }
  .mobile-top {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--color-border);
    background: color-mix(in srgb, var(--color-surface) 92%, transparent);
    backdrop-filter: blur(12px);
    min-height: 52px;
  }
  .mobile-brand {
    flex: 1; min-width: 0;
    display: flex; align-items: center; gap: var(--space-2);
  }
  .mobile-logo { width: 28px; height: 28px; border-radius: 9px; }
  .mobile-title {
    font-size: 14px; font-weight: 650; color: var(--color-fg);
    letter-spacing: -0.01em;
  }
  .assets { display: none; }
  .mobile-assets-fab { display: flex; }
  .dock { padding-bottom: calc(var(--space-3) + env(safe-area-inset-bottom, 0px)); }
}
.mobile-assets-fab {
  display: none;
  position: fixed;
  right: 16px;
  bottom: calc(96px + env(safe-area-inset-bottom, 0px));
  z-index: 40;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  align-items: center;
  justify-content: center;
  background: linear-gradient(145deg, var(--color-primary-hover), var(--color-primary));
  color: var(--color-on-primary);
  box-shadow: 0 10px 28px color-mix(in srgb, var(--color-primary) 35%, transparent);
  border: none;
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
  width: min(100%, 520px);
  max-height: 82vh;
  background: var(--color-surface);
  border-radius: 20px 20px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: var(--shadow-pop);
}
.mobile-assets-handle {
  width: 40px;
  height: 4px;
  border-radius: 999px;
  background: var(--color-border-strong);
  margin: 10px auto 0;
  flex-shrink: 0;
}
.mobile-assets-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
}
.mobile-assets-body { overflow-y: auto; padding: var(--space-4); flex: 1; min-height: 0; }

.sheet-enter-active,
.sheet-leave-active { transition: opacity 180ms var(--ease); }
.sheet-enter-active .mobile-assets-sheet,
.sheet-leave-active .mobile-assets-sheet { transition: transform 220ms var(--ease-out); }
.sheet-enter-from,
.sheet-leave-to { opacity: 0; }
.sheet-enter-from .mobile-assets-sheet,
.sheet-leave-to .mobile-assets-sheet { transform: translateY(16px); }
</style>
