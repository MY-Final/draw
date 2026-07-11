<script setup>
// 通用抽屉(从右侧滑入)。低频操作(接口设置 / 存储备份)放这里,主视图保持干净。
import { onMounted, onUnmounted } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({ title: String })
const emit = defineEmits(['close'])

function onKey(e) { if (e.key === 'Escape') emit('close') }
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="scrim" @click.self="emit('close')">
    <div class="drawer" role="dialog" :aria-label="title">
      <header class="drawer-head">
        <strong>{{ title }}</strong>
        <button class="btn btn-sm btn-ghost" @click="emit('close')" aria-label="关闭"><AppIcon name="x" :size="15" /></button>
      </header>
      <div class="drawer-body">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; z-index: 120; background: rgba(0,0,0,0.5); display: flex; justify-content: flex-end; animation: fade var(--dur) var(--ease); }
.drawer { width: 100%; max-width: 440px; height: 100%; background: var(--color-surface); border-left: 1px solid var(--color-border-strong); display: flex; flex-direction: column; box-shadow: var(--shadow-pop); animation: slide var(--dur) var(--ease); }
.drawer-head { display: flex; align-items: center; justify-content: space-between; padding: var(--space-4); border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
.drawer-body { padding: var(--space-4); overflow-y: auto; }
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes slide { from { transform: translateX(24px); } to { transform: translateX(0); } }
</style>
