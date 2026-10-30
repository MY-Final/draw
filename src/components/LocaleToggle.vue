<script setup>
// 语言切换:在支持的语言间轮换,写入 localStorage 并同步 <html lang>/标题。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { SUPPORTED_LOCALES, setLocale } from '../i18n/index.js'

const { locale, t } = useI18n()
const current = computed(
  () => SUPPORTED_LOCALES.find((l) => l.code === locale.value) || SUPPORTED_LOCALES[0],
)

function toggle() {
  const index = SUPPORTED_LOCALES.findIndex((l) => l.code === locale.value)
  const next = SUPPORTED_LOCALES[(index + 1) % SUPPORTED_LOCALES.length]
  setLocale(next.code)
}
</script>

<template>
  <button
    type="button"
    class="locale-toggle"
    :title="`${t('locale.switch')} · ${current.label}`"
    :aria-label="`${t('locale.switch')}: ${current.label}`"
    @click="toggle"
  >
    {{ current.short }}
  </button>
</template>

<style scoped>
.locale-toggle {
  width: 30px; height: 30px; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  font-family: var(--font-mono); font-size: 13.5px; font-weight: 600;
  letter-spacing: 0.02em;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  color: var(--color-fg-subtle);
  background: transparent;
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease),
    border-color var(--dur) var(--ease);
}
.locale-toggle:hover {
  border-color: var(--color-border-strong);
  background: var(--color-surface-2);
  color: var(--color-fg);
}
</style>
