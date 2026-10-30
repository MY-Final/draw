<script setup>
// 备份提醒弹窗:容量触发,三个按钮。
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { dismissReminder, snoozeReminder } from '../lib/backupReminder.js'
import { formatBytes } from '../lib/storageUsage.js'
import AppIcon from './AppIcon.vue'
import { useDialogA11y } from '../composables/useDialogA11y.js'

const { t } = useI18n()
const emit = defineEmits(['close'])
const props = defineProps({ businessBytes: Number })
const modal = ref(null)

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

useDialogA11y(modal, () => emit('close'))
</script>

<template>
  <div class="reminder-overlay" @click.self="emit('close')" @keydown.esc="emit('close')">
    <div ref="modal" class="reminder-modal" role="dialog" aria-modal="true" aria-labelledby="reminder-title" tabindex="-1">
      <h2 id="reminder-title" class="reminder-title">{{ t('dialogs.backupReminder.title') }}</h2>
      <p class="reminder-body">
        {{ t('dialogs.backupReminder.bodyLocal') }}<br>
        {{ t('dialogs.backupReminder.bodyRisk') }}<br><br>
        {{ t('dialogs.backupReminder.bodyUsage', { size: formatBytes(businessBytes) }) }}
      </p>
      <div class="reminder-actions">
        <button class="btn btn-primary" @click="onBackup">
          <AppIcon name="download" :size="14" /> {{ t('dialogs.backupReminder.backupNow') }}
        </button>
        <button class="btn" @click="onSnooze">{{ t('dialogs.backupReminder.snooze') }}</button>
        <button class="btn btn-ghost" @click="onDismiss">{{ t('dialogs.backupReminder.dismiss30') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reminder-overlay {
  position: fixed; inset: 0; z-index: 900;
  display: flex; align-items: center; justify-content: center;
  padding: var(--space-4);
  background: var(--color-scrim);
}
.reminder-modal {
  width: min(440px, 92vw);
  padding: 22px;
  background: var(--color-elevated);
  border: 1px solid var(--color-ink);
  border-top: 3px solid var(--color-warning);
  border-radius: var(--radius);
  box-shadow: var(--shadow-pop);
  display: flex; flex-direction: column; gap: var(--space-4);
}
.reminder-title {
  margin: 0; font-size: 22px; font-weight: 750; color: var(--color-fg);
  line-height: 1.3; letter-spacing: -0.03em;
}
.reminder-body {
  margin: 0; font-size: 16px; line-height: 1.75; color: var(--color-fg-muted);
}
.reminder-actions { display: flex; flex-direction: column; gap: var(--space-2); }
.btn-ghost {
  background: transparent; border: none; color: var(--color-fg-subtle); font-size: 15px;
}
.btn-ghost:hover { color: var(--color-fg-muted); background: transparent; text-decoration: underline; }
</style>
