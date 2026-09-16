// 接口预设(design D7)—— 存 localStorage 明文(design D6:纯前端无处可藏)。
// 预设字段:{ id, name, baseURL, apiKey, model, protocol }
//   protocol 恒为 'images'(标准 OpenAI images 接口:generations / edits)。
//   字段保留仅为兼容已有数据与分享配方格式。
//
// 关键不变量(design D8):导出分享时必须剥离 apiKey。见 share.js 的 stripKey。

import { tl } from '../i18n/translate.js'

export const PRESETS_STORAGE_KEY = 'workbench.presets.v1'
export const ACTIVE_PRESET_KEY = 'workbench.activePresetId.v1'

export const PROTOCOL_IMAGES = 'images'

export const DEFAULT_REQUEST_TIMEOUT_MS = 180000
export const MIN_REQUEST_TIMEOUT_MS = 30000
export const MAX_REQUEST_TIMEOUT_MS = 1800000

export function normalizeRequestTimeoutMs(value) {
  const ms = Number(value)
  if (!Number.isFinite(ms)) return DEFAULT_REQUEST_TIMEOUT_MS
  return Math.min(MAX_REQUEST_TIMEOUT_MS, Math.max(MIN_REQUEST_TIMEOUT_MS, Math.round(ms / 1000) * 1000))
}

function uid() {
  return `preset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function loadPresets() {
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    // 旧版曾保存 chat / auto / 缺省 protocol。请求层早已统一走 images，
    // 这里把持久数据也一次性收敛，避免旧语义继续进入生成记录和分享配方。
    let changed = false
    const normalized = []
    for (const preset of parsed) {
      if (!preset || typeof preset !== 'object') {
        changed = true
        continue
      }
      const requestTimeoutMs = normalizeRequestTimeoutMs(preset.requestTimeoutMs)
      if (preset.protocol !== PROTOCOL_IMAGES || preset.requestTimeoutMs !== requestTimeoutMs) changed = true
      normalized.push({ ...preset, protocol: PROTOCOL_IMAGES, requestTimeoutMs })
    }
    if (changed) persist(normalized)
    return normalized
  } catch {
    return []
  }
}

function persist(presets) {
  localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets))
}

// options.preserveExistingKey: 导入场景下若本机已有同 id 且带 Key,保留本机 Key,绝不被空 Key 覆盖。
export function savePreset(preset, options = {}) {
  const presets = loadPresets()
  const id = preset.id || uid()
  const existing = presets.find((p) => p.id === id)
  let apiKey = preset.apiKey || ''
  if (options.preserveExistingKey && existing?.apiKey && !apiKey) {
    apiKey = existing.apiKey
  }
  const record = {
    id,
    name: preset.name || tl('lib.defaults.presetName'),
    baseURL: (preset.baseURL || '').trim().replace(/\/+$/, ''),
    apiKey,
    model: preset.model || '',
    // 恒为 images(标准 OpenAI 图像接口);不再有 chat/auto。
    protocol: PROTOCOL_IMAGES,
    requestTimeoutMs: normalizeRequestTimeoutMs(preset.requestTimeoutMs),
  }
  const idx = presets.findIndex((p) => p.id === record.id)
  if (idx >= 0) presets[idx] = record
  else presets.push(record)
  persist(presets)
  return record
}

export function deletePreset(id) {
  const presets = loadPresets().filter((p) => p.id !== id)
  persist(presets)
  if (getActivePresetId() === id) {
    setActivePresetId(presets[0]?.id || null)
  }
}

export function getActivePresetId() {
  return localStorage.getItem(ACTIVE_PRESET_KEY)
}

export function setActivePresetId(id) {
  if (id) localStorage.setItem(ACTIVE_PRESET_KEY, id)
  else localStorage.removeItem(ACTIVE_PRESET_KEY)
}

export function getActivePreset() {
  const id = getActivePresetId()
  const presets = loadPresets()
  return presets.find((p) => p.id === id) || presets[0] || null
}

// Task 3.3:一键清除凭据 —— 只清 Key,保留其余配置,方便公共设备离开时快速抹除。
export function clearAllKeys() {
  const presets = loadPresets().map((p) => ({ ...p, apiKey: '' }))
  persist(presets)
  return presets
}
