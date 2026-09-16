import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN.js'
import en from './locales/en.js'

export const LOCALE_STORAGE_KEY = 'draw.locale'

export const SUPPORTED_LOCALES = [
  { code: 'zh-CN', label: '简体中文', short: '中' },
  { code: 'en', label: 'English', short: 'EN' },
]

const SUPPORTED_CODES = SUPPORTED_LOCALES.map((l) => l.code)

// 解析初始语言:用户显式选择 > 浏览器语言 > 简体中文。
function resolveInitialLocale() {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (saved && SUPPORTED_CODES.includes(saved)) return saved
  } catch { /* localStorage 不可用时退回浏览器语言 */ }
  if (typeof navigator !== 'undefined') {
    const langs = [navigator.language, ...(navigator.languages || [])]
    for (const lang of langs) {
      if (!lang) continue
      const lower = lang.toLowerCase()
      if (lower.startsWith('zh')) return 'zh-CN'
      if (lower.startsWith('en')) return 'en'
    }
  }
  return 'zh-CN'
}

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: resolveInitialLocale(),
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN, en },
})

// 同步 <html lang> 与文档标题,让无障碍/分享读到当前语言。
function syncDocument(locale) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('lang', locale)
  document.title = i18n.global.t('app.title')
}

export function setLocale(locale) {
  if (!SUPPORTED_CODES.includes(locale)) return
  i18n.global.locale.value = locale
  try { localStorage.setItem(LOCALE_STORAGE_KEY, locale) } catch { /* 只影响持久化 */ }
  syncDocument(locale)
}

export function currentLocale() {
  return i18n.global.locale.value
}

syncDocument(i18n.global.locale.value)

export default i18n
