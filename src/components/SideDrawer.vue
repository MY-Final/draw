<script setup>
// 通用抽屉(从右侧滑入)。低频操作(接口设置 / 存储备份)放这里,主视图保持干净。
import { ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { useDialogA11y } from '../composables/useDialogA11y.js'

const props = defineProps({ title: String })
const emit = defineEmits(['close'])

const drawer = ref(null)
useDialogA11y(drawer, () => emit('close'))
</script>

<template>
  <div class="scrim" @click.self="emit('close')">
    <div ref="drawer" class="drawer" role="dialog" aria-modal="true" :aria-label="title" tabindex="-1">
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
.scrim {
  position: fixed; inset: 0; z-index: 120;
  background: var(--color-scrim);
  display: flex; justify-content: flex-end;
  animation: fade var(--dur) var(--ease);
  backdrop-filter: blur(2px);
}
.drawer {
  width: 100%; max-width: 440px; height: 100%;
  background: color-mix(in srgb, var(--color-surface) 96%, transparent);
  border-left: 1px solid var(--color-border-strong);
  display: flex; flex-direction: column;
  box-shadow: var(--shadow-pop);
  animation: slide 220ms var(--ease-out);
  backdrop-filter: blur(14px);
}
.drawer-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--space-4); border-bottom: 1px solid var(--color-border); flex-shrink: 0;
}
.drawer-head strong { font-size: 14px; letter-spacing: -0.01em; }
.drawer-body { padding: var(--space-4); overflow-y: auto; }
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes slide { from { transform: translateX(28px); } to { transform: translateX(0); } }
</style>
