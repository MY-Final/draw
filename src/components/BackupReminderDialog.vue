<script setup>
// 备份提醒弹窗:容量触发,三个按钮。
import { ref } from 'vue'
import { dismissReminder, snoozeReminder } from '../lib/backupReminder.js'
import { getStorageUsage, formatBytes } from '../lib/storageUsage.js'
import AppIcon from './AppIcon.vue'

const emit = defineEmits(['close'])
const props = defineProps({ businessBytes: Number })

function onBackup() {
  dismissReminder(props.businessBytes)
  emit('close', 'backup')
}

function onSnooze() {
  snoozeReminder(props.businessBytes)
  emit('close', 'snooze')
}

function onDismiss() {
  dismissReminder(props.businessBytes)
  emit('close', 'dismiss')
}
</script>

<template>
  <div class="reminder-overlay" @click.self="onSnooze">
    <div class="reminder-modal" role="dialog" aria-labelledby="reminder-title">
      <h2 id="reminder-title" class="reminder-title">建议备份你的创作数据</h2>
      <p class="reminder-body">
        你的所有图片、Prompt、接口配置均保存在当前浏览器。<br>
        如果清除浏览器数据、更换浏览器或更换电脑,数据可能无法恢复。<br><br>
        已使用存储：{{ formatBytes(businessBytes) }}，建议定期导出备份。
      </p>
      <div class="reminder-actions">
        <button class="btn btn-primary" @click="onBackup">
          <AppIcon name="download" :size="14" /> 立即备份
        </button>
        <button class="btn" @click="onSnooze">稍后提醒</button>
        <button class="btn btn-ghost" @click="onDismiss">30天不提醒</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reminder-overlay {
  position: fixed; inset: 0; z-index: 900;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.35);
  backdrop-filter: blur(2px);
}
.reminder-modal {
  width: min(420px, 88vw);
  padding: var(--space-5);
  background: var(--color-elevated);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 32px rgba(0,0,0,0.25);
  display: flex; flex-direction: column; gap: var(--space-4);
}
.reminder-title {
  margin: 0; font-size: 16px; font-weight: 600; color: var(--color-fg); line-height: 1.4;
}
.reminder-body {
  margin: 0; font-size: 13px; line-height: 1.6; color: var(--color-fg-muted);
}
.reminder-actions {
  display: flex; flex-direction: column; gap: var(--space-2);
}
.btn-ghost {
  background: transparent; border: none; color: var(--color-fg-subtle); font-size: 12px;
}
.btn-ghost:hover { color: var(--color-fg-muted); text-decoration: underline; }
</style>
