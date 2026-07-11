import JSZip from 'jszip'
import { listAssets, getAsset, getAssets, putAsset } from './assetRepo.js'
import { listGenerations, putGenerationRecord, createGeneration } from './generationRepo.js'
import { loadPresets, savePreset } from './presets.js'

// 导入导出(design D5 / D8)。三类导出物,分享级(A/B)一律剥离 Key。
export const SCHEMA_VERSION = 1

const MIME_EXT = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
  'image/gif': 'gif', 'image/bmp': 'bmp', 'image/svg+xml': 'svg',
}
function extFor(mime) {
  return MIME_EXT[mime] || 'png'
}

// ── D8 不变量:剥离 Key ────────────────────────────────────────────
// 分享级导出的任何路径都经过这里。apiKey 永不写出。
export function stripKey(preset) {
  const { apiKey, ...rest } = preset
  return { ...rest, apiKey: '' }
}

// ── C. 整库 zip 导出(Task 7.3) ──────────────────────────────────
export async function exportLibraryZip() {
  const zip = new JSZip()
  const assets = await listAssets()
  const generations = await listGenerations()
  const presets = loadPresets().map(stripKey) // 整库导出也不含 Key

  const assetsFolder = zip.folder('assets')
  const manifestAssets = []
  for (const a of assets) {
    const ext = extFor(a.mime)
    const filename = `${a.id}.${ext}`
    // 用 ArrayBuffer 写入:JSZip 对 ArrayBuffer 的支持在浏览器与 Node 下都稳定,
    // 而 Blob 仅浏览器可靠。
    assetsFolder.file(filename, await a.blob.arrayBuffer())
    manifestAssets.push({
      id: a.id, file: `assets/${filename}`, mime: a.mime,
      width: a.width, height: a.height, size: a.size,
      createdAt: a.createdAt, source: a.source,
    })
  }

  const manifest = {
    kind: 'library',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    assets: manifestAssets,
    generations,
    presets,
  }
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))
  return zip.generateAsync({ type: 'blob' })
}

// ── C. 整库 zip 导入(Task 7.4) ──────────────────────────────────
export async function importLibraryZip(file) {
  const zip = await JSZip.loadAsync(file).catch(() => null)
  if (!zip) throw new ImportError('文件不是有效的 zip。')
  const manifestFile = zip.file('manifest.json')
  if (!manifestFile) throw new ImportError('缺少 manifest.json,不是本工作台导出的文件。')

  let manifest
  try {
    manifest = JSON.parse(await manifestFile.async('string'))
  } catch {
    throw new ImportError('manifest.json 解析失败。')
  }
  assertSchema(manifest)
  if (manifest.kind !== 'library') throw new ImportError('该文件不是整库导出。')

  let assetCount = 0
  for (const a of manifest.assets || []) {
    const entry = zip.file(a.file)
    if (!entry) continue
    // 读为 ArrayBuffer 再包 Blob:跨环境稳定,且能带回正确 mime。
    const buf = await entry.async('arraybuffer')
    const blob = new Blob([buf], { type: a.mime || 'image/png' })
    await putAsset({
      id: a.id, blob, mime: a.mime, width: a.width, height: a.height, source: a.source || 'imported',
    })
    assetCount++
  }
  let genCount = 0
  for (const g of manifest.generations || []) {
    await putGenerationRecord(g)
    genCount++
  }
  // 预设导入不覆盖已有(避免冲掉本机 Key);导入的预设 Key 为空,待用户填。
  for (const p of manifest.presets || []) {
    savePreset(stripKey(p))
  }
  return { assetCount, genCount }
}

// ── A. 接口预设分享导出/导入(Task 7.5) ─────────────────────────
export function exportPresets(presetIds = null) {
  const all = loadPresets()
  const selected = presetIds ? all.filter((p) => presetIds.includes(p.id)) : all
  return {
    kind: 'presets',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    presets: selected.map(stripKey), // 强制剥离 Key
  }
}

export function importPresets(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json
  assertSchema(data)
  if (data.kind !== 'presets') throw new ImportError('该文件不是接口预设分享文件。')
  const imported = []
  for (const p of data.presets || []) {
    // 导入后必然缺 Key(导出已剥离),标记待填。
    const saved = savePreset({ ...stripKey(p), id: undefined })
    imported.push(saved)
  }
  return { presets: imported, missingKey: true }
}

// ── B. 单次生成配方分享导出/导入(Task 7.6) ─────────────────────
// 配方 = prompt + 参数 + 协议 + 参考图(含图字节),使他人可复现。不含 Key。
export async function exportRecipe(generation) {
  const refAssets = await getAssets(generation.refImageIds || [])
  const refs = []
  for (const a of refAssets) {
    refs.push({ id: a.id, mime: a.mime, dataUrl: await blobToDataUrl(a.blob) })
  }
  return {
    kind: 'recipe',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    prompt: generation.prompt,
    params: sanitizeParams(generation.params), // 不含 Key(params 本就不存 Key,双保险)
    protocol: generation.params?.protocol || 'images',
    refs,
  }
}

// 导入配方:参考图落库,返回预填面板所需数据。不自动发起(对方需用自己的接口)。
export async function importRecipe(json, availablePresets) {
  const data = typeof json === 'string' ? JSON.parse(json) : json
  assertSchema(data)
  if (data.kind !== 'recipe') throw new ImportError('该文件不是生成配方。')

  const refImageIds = []
  for (const ref of data.refs || []) {
    const blob = dataUrlToBlob(ref.dataUrl)
    const asset = await putAsset({ blob, mime: ref.mime, source: 'imported' })
    refImageIds.push(asset.id)
  }

  // 协议匹配检查(Scenario:缺少匹配协议 → 提示而非静默失败)
  const presets = availablePresets || loadPresets()
  const hasMatchingProtocol = presets.some((p) => p.protocol === data.protocol)
  const needsProtocolNotice = !hasMatchingProtocol
    ? `此配方需要 ${data.protocol === 'chat' ? 'chat' : 'images'} 协议的接口预设,你当前没有,请先添加。`
    : null

  return {
    prefill: { prompt: data.prompt, params: data.params, protocol: data.protocol, refImageIds },
    needsProtocolNotice,
  }
}

// ── helpers ────────────────────────────────────────────────────
export class ImportError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ImportError'
  }
}

function assertSchema(data) {
  if (!data || typeof data !== 'object') throw new ImportError('文件格式无法识别。')
  if (typeof data.schemaVersion !== 'number') throw new ImportError('缺少 schemaVersion,无法识别的分享文件。')
  if (data.schemaVersion > SCHEMA_VERSION) {
    throw new ImportError(`该文件由更新版本的工作台导出(v${data.schemaVersion}),请升级后再导入。`)
  }
}

function sanitizeParams(params = {}) {
  // 明确剔除任何可能夹带凭据的字段(双保险)。
  const { apiKey, key, authorization, ...safe } = params
  return safe
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(',')
  const mime = (/data:([^;]+)/.exec(head) || [])[1] || 'image/png'
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}
