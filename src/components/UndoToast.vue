<script setup>
import { i18n } from '../i18n/index.js'

defineProps({
  message: { type: String, required: true },
  actionLabel: { type: String, default: () => i18n.global.t('dialogs.undoToast.actionLabel') },
  // 默认自带定位(单条提示);放进 .undo-stack 时用 fixed=false 由容器排版。
  fixed: { type: Boolean, default: true },
})

const emit = defineEmits(['undo'])
</script>

<template>
  <div class="undo-toast" :class="{ fixed }" role="status" aria-live="polite">
    <span>{{ message }}</span>
    <button type="button" class="undo-btn" @click="emit('undo')">{{ actionLabel }}</button>
  </div>
</template>

<style scoped>
.undo-toast {
  display: flex; align-items: center; gap: var(--space-3);
  max-width: min(92vw, 440px); padding: 10px 14px;
  border-radius: var(--radius);
  background: var(--color-ink);
  color: var(--color-on-ink);
  border: 1px solid var(--color-ink);
  box-shadow: var(--shadow-pop);
  font-size: 16px;
}
.undo-toast.fixed {
  position: fixed; bottom: calc(var(--composer-height, 240px) + 16px);
  left: 50%; transform: translateX(-50%); z-index: 60;
}
.undo-toast span { min-width: 0; }
.undo-btn {
  flex-shrink: 0; font-family: var(--font-mono); font-size: 14.5px; font-weight: 600;
  color: inherit; padding: 2px 0;
  text-decoration: underline; text-underline-offset: 3px;
  opacity: 0.82;
}
.undo-btn:hover { opacity: 1; }
</style>
