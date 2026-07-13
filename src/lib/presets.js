// 接口预设(design D7)—— 存 localStorage 明文(design D6:纯前端无处可藏)。
// 预设字段:{ id, name, baseURL, apiKey, model, protocol }
//   protocol 恒为 'images'(标准 OpenAI images 接口:generations / edits)。
//   字段保留仅为兼容已有数据与分享配方格式。
//
// 关键不变量(design D8):导出分享时必须剥离 apiKey。见 share.js 的 stripKey。

const STORAGE_KEY = 'workbench.presets.v1'
const ACTIVE_KEY = 'workbench.activePresetId.v1'

export const PROTOCOL_IMAGES = 'images'

function uid() {
  return `preset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function loadPresets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function persist(presets) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
}

export function savePreset(preset) {
  const presets = loadPresets()
  const record = {
    id: preset.id || uid(),
    name: preset.name || '未命名接口',
    baseURL: (preset.baseURL || '').trim().replace(/\/+$/, ''),
    apiKey: preset.apiKey || '',
    model: preset.model || '',
    // 恒为 images(标准 OpenAI 图像接口);不再有 chat/auto。
    protocol: PROTOCOL_IMAGES,
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
  return localStorage.getItem(ACTIVE_KEY)
}

export function setActivePresetId(id) {
  if (id) localStorage.setItem(ACTIVE_KEY, id)
  else localStorage.removeItem(ACTIVE_KEY)
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

// 判断预设是否缺少 Key(用于导入分享后的提示,见 share.js)。
export function isMissingKey(preset) {
  return !preset || !preset.apiKey
}
