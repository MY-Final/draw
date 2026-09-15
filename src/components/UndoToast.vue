<script setup>
defineProps({
  message: { type: String, required: true },
  actionLabel: { type: String, default: '撤销' },
})

const emit = defineEmits(['undo'])
</script>

<template>
  <div class="undo-toast" role="status" aria-live="polite">
    <span>{{ message }}</span>
    <button type="button" class="undo-btn" @click="emit('undo')">{{ actionLabel }}</button>
  </div>
</template>

<style scoped>
.undo-toast {
  position: fixed; bottom: 128px; left: 50%; transform: translateX(-50%); z-index: 60;
  display: flex; align-items: center; gap: var(--space-3);
  max-width: min(90vw, 420px); padding: 12px 16px; border-radius: 12px;
  background: var(--color-elevated); border: 1px solid var(--color-border-strong);
  font-size: 13px; color: var(--color-fg);
}
.undo-toast span { min-width: 0; }
.undo-btn {
  flex-shrink: 0; font-size: 13px; font-weight: 650;
  color: var(--color-primary); padding: 4px 8px; border-radius: 999px;
}
.undo-btn:hover { background: var(--color-primary-soft); }
</style>
