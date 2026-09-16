import { i18n } from './index.js'

// 供非组件的 lib 层调用:错误 / 默认文案等。组件内请用 useI18n()。
export function tl(key, params) {
  return i18n.global.t(key, params)
}

// 当前语言代码(用于需要按语言分支的日期/数字格式化)。
export function activeLocale() {
  return i18n.global.locale.value
}
