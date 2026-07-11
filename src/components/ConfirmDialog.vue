<script setup>
// 确认弹窗(破坏性操作用)。危险操作用告警色。走设计系统 token,SVG 图标。
import { onMounted, onUnmounted } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  title: { type: String, default: '确认操作' },
  message: { type: String, default: '' },
  confirmText: { type: String, default: '确认' },
  cancelText: { type: String, default: '取消' },
  danger: { type: Boolean, default: false },
})
const emit = defineEmits(['confirm', 'cancel'])

function onKey(e) { if (e.key === 'Escape') emit('cancel') }
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="scrim" @click.self="emit('cancel')">
    <div class="dialog" role="alertdialog" :aria-label="title">
      <div class="dlg-head">
        <span v-if="danger" class="dlg-icon danger"><AppIcon name="alert" :size="18" /></span>
        <strong>{{ title }}</strong>
      </div>
      <p v-if="message" class="dlg-msg">{{ message }}</p>
      <div class="dlg-actions">
        <button class="btn btn-sm" @click="emit('cancel')">{{ cancelText }}</button>
        <button class="btn btn-sm" :class="danger ? 'btn-danger' : 'btn-primary'" @click="emit('confirm')">{{ confirmText }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; z-index: 200; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; animation: fade var(--dur) var(--ease); }
.dialog { width: 100%; max-width: 380px; margin: var(--space-4); background: var(--color-elevated); border: 1px solid var(--color-border-strong); border-radius: var(--radius); box-shadow: var(--shadow-pop); padding: var(--space-5); animation: pop var(--dur) var(--ease); }
.dlg-head { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-3); font-size: 15px; }
.dlg-icon.danger { color: var(--color-destructive); display: inline-flex; }
.dlg-msg { font-size: 13px; color: var(--color-fg-muted); line-height: 1.6; margin-bottom: var(--space-5); }
.dlg-actions { display: flex; justify-content: flex-end; gap: var(--space-2); }
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes pop { from { transform: scale(0.96); opacity: 0; } to { transform: scale(1); opacity: 1; } }
</style>
