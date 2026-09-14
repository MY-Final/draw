import { nextTick, onMounted, onUnmounted, watch } from 'vue'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')
const activePanels = []

// 统一处理弹窗的 Escape、焦点进入、焦点陷阱和关闭后焦点恢复。
export function useDialogA11y(panel, close, onExtraKey) {
  let previousFocus = null
  let registeredPanel = null

  function focusPanel() {
    const first = panel.value?.querySelector('[autofocus], ' + FOCUSABLE)
    ;(first || panel.value)?.focus?.()
  }

  function onPanelChange(next, previous) {
    if (next && !registeredPanel) {
      previousFocus = document.activeElement
      registeredPanel = next
      activePanels.push(next)
      nextTick(focusPanel)
    } else if (!next && registeredPanel) {
      const index = activePanels.lastIndexOf(registeredPanel)
      if (index >= 0) activePanels.splice(index, 1)
      registeredPanel = null
      if (previousFocus && document.contains(previousFocus)) previousFocus.focus?.()
      previousFocus = null
    }
  }

  function onKeydown(event) {
    if (!panel.value || activePanels[activePanels.length - 1] !== panel.value) return
    if (event.key === 'Escape') {
      event.preventDefault()
      close?.()
      return
    }
    onExtraKey?.(event)
    if (event.defaultPrevented) return
    if (event.key !== 'Tab' || !panel.value) return
    const focusable = [...panel.value.querySelectorAll(FOCUSABLE)]
    if (!focusable.length) {
      event.preventDefault()
      panel.value.focus()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  onMounted(() => {
    document.addEventListener('keydown', onKeydown)
    if (panel.value) onPanelChange(panel.value, null)
  })

  watch(panel, onPanelChange, { flush: 'post' })

  onUnmounted(() => {
    document.removeEventListener('keydown', onKeydown)
    if (registeredPanel) onPanelChange(null, registeredPanel)
    else if (previousFocus && document.contains(previousFocus)) previousFocus.focus?.()
    previousFocus = null
  })
}
