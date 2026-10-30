<script setup>
// 确认弹窗(破坏性操作用)。危险操作用告警色。走设计系统 token,SVG 图标。
import { ref } from 'vue'
import { i18n } from '../i18n/index.js'
import AppIcon from './AppIcon.vue'
import { useDialogA11y } from '../composables/useDialogA11y.js'

defineProps({
  title: { type: String, default: () => i18n.global.t('dialogs.confirm.title') },
  message: { type: String, default: '' },
  confirmText: { type: String, default: () => i18n.global.t('dialogs.confirm.confirmText') },
  cancelText: { type: String, default: () => i18n.global.t('dialogs.confirm.cancelText') },
  danger: { type: Boolean, default: false },
})
const emit = defineEmits(['confirm', 'cancel'])
const dialog = ref(null)
useDialogA11y(dialog, () => emit('cancel'))
</script>

<template>
  <Teleport to="body">
    <div class="scrim">
      <div
        ref="dialog"
        class="dialog"
        role="alertdialog"
        aria-modal="true"
        :aria-labelledby="`confirm-title-${title}`"
        :aria-describedby="message ? `confirm-message-${title}` : undefined"
        tabindex="-1"
      >
        <div class="dlg-head">
          <span v-if="danger" class="dlg-icon danger"><AppIcon name="alert" :size="17" /></span>
          <strong :id="`confirm-title-${title}`">{{ title }}</strong>
        </div>
        <p v-if="message" :id="`confirm-message-${title}`" class="dlg-msg">{{ message }}</p>
        <div class="dlg-actions">
          <!-- 危险操作默认聚焦「取消」,避免回车误触发删除 -->
          <button class="btn btn-sm" autofocus @click="emit('cancel')">{{ cancelText }}</button>
          <button class="btn btn-sm" :class="danger ? 'btn-danger' : 'btn-primary'" @click="emit('confirm')">{{ confirmText }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.scrim {
  position: fixed; inset: 0; z-index: 1000; padding: var(--space-4);
  display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--color-scrim) 94%, #000);
  animation: fade var(--dur) var(--ease);
}
.dialog {
  width: min(100%, 420px); margin: 0;
  background: var(--color-elevated);
  border: 1px solid var(--color-ink);
  border-top: 3px solid var(--color-ink);
  border-radius: var(--radius);
  padding: 18px 20px 16px;
  box-shadow: var(--shadow-pop);
  animation: pop var(--dur) var(--ease-out);
}
.dlg-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; font-size: 18px; }
.dlg-head strong { font-weight: 700; letter-spacing: -0.02em; }
.dlg-icon.danger {
  width: 28px; height: 28px; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--color-destructive);
  border: 1px solid color-mix(in srgb, var(--color-destructive) 35%, transparent);
  background: color-mix(in srgb, var(--color-destructive) 8%, transparent);
}
.dlg-msg { margin: 0 0 18px; font-size: 16px; color: var(--color-fg-muted); line-height: 1.65; }
.dlg-actions { display: flex; justify-content: flex-end; gap: var(--space-2); }
.dlg-actions .btn { min-width: 76px; }
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes pop { from { transform: translateY(4px); opacity: 0; } to { transform: none; opacity: 1; } }

@media (max-width: 520px) {
  .scrim { align-items: flex-end; padding: 12px; }
  .dialog { width: 100%; padding: 18px; }
}
</style>
