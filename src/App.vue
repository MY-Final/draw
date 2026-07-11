<script setup>
// 对话式布局:左安静栏 · 中(结果流 + 底部固定输入)· 右素材库。低频操作进抽屉。
import { ref, onMounted } from 'vue'
import { useWorkbenchStore } from './stores/workbench.js'
import SideBar from './components/SideBar.vue'
import ResultsView from './components/ResultsView.vue'
import Composer from './components/Composer.vue'
import LibraryPanel from './components/LibraryPanel.vue'
import SideDrawer from './components/SideDrawer.vue'
import PresetManager from './components/PresetManager.vue'
import BackupTools from './components/BackupTools.vue'
import ImageLightbox from './components/ImageLightbox.vue'
import AppIcon from './components/AppIcon.vue'

const store = useWorkbenchStore()
const composer = ref(null)
const preview = ref(null)
const drawer = ref(null) // 'settings' | 'storage' | null
const rightOpen = ref(true)
const theme = ref('dark')

onMounted(() => {
  store.init()
  const saved = localStorage.getItem('workbench.theme')
  setTheme(saved || 'dark')
})

function setTheme(t) {
  theme.value = t
  document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark')
  localStorage.setItem('workbench.theme', t)
}
function toggleTheme() { setTheme(theme.value === 'dark' ? 'light' : 'dark') }

function useAsReference(id) { composer.value?.addReference(id) }
function onRecipeImported(prefill) { composer.value?.applyPrefill(prefill); drawer.value = null }
function onNewCanvas() {
  store.newConversation()   // 开一段空白会话(旧会话与图仍保留、可从左侧切回)
  composer.value?.clear()
  preview.value = null
}
</script>

<template>
  <div class="app">
    <!-- 左侧安静栏 -->
    <aside class="rail">
      <div class="logo"><AppIcon name="sparkles" :size="18" /> <span>绘画工作台</span></div>
      <SideBar
        :theme="theme"
        @open-settings="drawer = 'settings'"
        @open-storage="drawer = 'storage'"
        @toggle-theme="toggleTheme"
        @new-canvas="onNewCanvas"
      />
    </aside>

    <!-- 中间:结果流 + 底部输入 -->
    <main class="center">
      <div class="stream">
        <ResultsView @use-as-reference="useAsReference" @preview="preview = $event" />
      </div>
      <div class="dock">
        <Composer ref="composer" />
      </div>
    </main>

    <!-- 右侧素材库(可收起) -->
    <aside class="assets" :class="{ collapsed: !rightOpen }">
      <button class="collapse-tab" @click="rightOpen = !rightOpen" :aria-label="rightOpen ? '收起素材库' : '展开素材库'">
        <AppIcon :name="rightOpen ? 'x' : 'layers'" :size="14" />
      </button>
      <div v-if="rightOpen" class="assets-body">
        <LibraryPanel @use-as-reference="useAsReference" @preview="preview = $event" />
      </div>
    </aside>

    <!-- 抽屉 -->
    <SideDrawer v-if="drawer === 'settings'" title="接口设置" @close="drawer = null">
      <PresetManager />
    </SideDrawer>
    <SideDrawer v-if="drawer === 'storage'" title="存储与备份" @close="drawer = null">
      <BackupTools @recipe-imported="onRecipeImported" />
    </SideDrawer>

    <ImageLightbox v-if="preview" :asset="preview" @close="preview = null" />
  </div>
</template>

<style scoped>
.app { display: grid; grid-template-columns: 240px 1fr auto; grid-template-rows: 1fr; height: 100vh; height: 100dvh; overflow: hidden; background: var(--color-bg); }

.rail { display: flex; flex-direction: column; gap: var(--space-5); padding: var(--space-4); border-right: 1px solid var(--color-border); background: var(--color-surface); overflow-y: auto; min-height: 0; }
.logo { display: flex; align-items: center; gap: var(--space-2); font-size: 14px; font-weight: 600; color: var(--color-fg); }
.logo :deep(svg) { color: var(--color-primary); }

.center { display: flex; flex-direction: column; min-width: 0; min-height: 0; background: var(--color-bg); }
.stream { flex: 1; min-height: 0; overflow: hidden; }
.dock { flex-shrink: 0; padding: var(--space-3) var(--space-4) var(--space-4); border-top: 1px solid var(--color-border); background: var(--color-surface); }

.assets { position: relative; width: 300px; border-left: 1px solid var(--color-border); background: var(--color-surface); transition: width var(--dur) var(--ease); min-height: 0; }
.assets.collapsed { width: 0; border-left: none; }
.assets-body { height: 100%; overflow-y: auto; padding: var(--space-4); }
.assets-body :deep(.lib-head) { padding-left: var(--space-3); }
.collapse-tab { position: absolute; top: var(--space-4); left: -14px; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: var(--color-elevated); border: 1px solid var(--color-border-strong); color: var(--color-fg-muted); box-shadow: var(--shadow-1); z-index: 5; }
.collapse-tab:hover { color: var(--color-fg); }

@media (max-width: 1024px) {
  .app { grid-template-columns: 1fr; grid-template-rows: auto 1fr; overflow: hidden; }
  .rail { flex-direction: row; align-items: center; overflow-x: auto; overflow-y: hidden; border-right: none; border-bottom: 1px solid var(--color-border); }
  .assets { display: none; }
}
</style>
