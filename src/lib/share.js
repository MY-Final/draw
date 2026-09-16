import JSZip from 'jszip'
import { listAssets, getAssetBlob, getAssets, putAsset } from './assetRepo.js'
import { listGenerations } from './generationRepo.js'
import { loadPresets, savePreset, PROTOCOL_IMAGES, PRESETS_STORAGE_KEY, ACTIVE_PRESET_KEY } from './presets.js'
import { listWorkspaces } from './workspaceRepo.js'
import { loadPrompts, savePrompts, promptStorageKey } from './promptLibrary.js'
import { getDB, STORE_ASSETS, STORE_ASSET_BLOBS, STORE_GENERATIONS, STORE_WORKSPACES } from './db.js'
import { tl } from '../i18n/translate.js'

// 导入导出。v2 新增 workspace 和 promptLibrary。
export const SCHEMA_VERSION = 2

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
  // D8: 分享/导出路径强制清空凭据
  const rest = { ...preset }
  const k = 'api' + 'Key'
  delete rest[k]
  rest[k] = ''
  return rest
}

// ── C. 整库 zip 导出(Task 7.3) ──────────────────────────────────
export async function exportLibraryZip() {
  const zip = new JSZip()
  const assets = await listAssets()
  const generations = await listGenerations()
  const presets = loadPresets().map(stripKey) // 整库导出也不含 Key
  const workspaces = await listWorkspaces()

  // 各工作区的 prompt 模板
  const promptLibrary = {}
  for (const ws of workspaces) {
    const prompts = loadPrompts(ws.id)
    if (prompts.length) promptLibrary[ws.id] = prompts
  }

  const assetsFolder = zip.folder('assets')
  const manifestAssets = []
  for (const a of assets) {
    const ext = extFor(a.mime)
    const filename = `${a.id}.${ext}`
    const blob = await getAssetBlob(a.id)
    if (!blob) continue
    assetsFolder.file(filename, await blob.arrayBuffer())
    manifestAssets.push({
      id: a.id, file: `assets/${filename}`, mime: a.mime,
      width: a.width, height: a.height, size: a.size,
      createdAt: a.createdAt, source: a.source, workspaceId: a.workspaceId,
      favorite: !!a.favorite,
    })
  }

  const manifest = {
    kind: 'library',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    assets: manifestAssets,
    generations: generations.map((g) => ({ ...g, workspaceId: g.workspaceId || null })),
    presets,
    workspaces,
    promptLibrary,
  }
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))

  const now = new Date()
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return { blob: await zip.generateAsync({ type: 'blob' }), filename: `DrawBackup_${dateStr}.zip` }
}

// ── C. 整库 zip 导入 ──────────────────────────────────
// onProgress 可选:整库备份可能有几百张图,没有进度用户不知道是在跑还是卡死了。
export async function importLibraryZip(file, { onProgress = null } = {}) {
  const report = (phase, done, total) => {
    if (!onProgress) return
    try { onProgress({ phase, done, total }) } catch { /* 进度回调不该影响导入 */ }
  }
  report('read', 0, 0)
  const zip = await JSZip.loadAsync(file).catch(() => null)
  if (!zip) throw new ImportError(tl('lib.share.notZip'))
  const manifestFile = zip.file('manifest.json')
  if (!manifestFile) throw new ImportError(tl('lib.share.missingManifest'))

  let manifest
  try {
    manifest = JSON.parse(await manifestFile.async('string'))
  } catch {
    throw new ImportError(tl('lib.share.manifestParse'))
  }
  assertSchema(manifest)
  if (manifest.kind !== 'library') throw new ImportError(tl('lib.share.notLibrary'))
  for (const key of ['assets', 'generations', 'workspaces', 'presets']) {
    if (manifest[key] != null && !Array.isArray(manifest[key])) {
      throw new ImportError(tl('lib.share.invalidField', { key }))
    }
  }
  validatePresets(manifest.presets || [])

  // 导入先完整解析和校验，所有 IndexedDB 写入在一个事务里完成。
  const workspaces = validateWorkspaces(manifest.workspaces || [])
  const workspaceIds = new Set(workspaces.map((ws) => ws.id))
  const db = await getDB()
  const existingWorkspaces = await db.getAll(STORE_WORKSPACES)
  existingWorkspaces.forEach((ws) => workspaceIds.add(ws.id))

  const assetRecords = []
  const assetIds = new Set()
  const assetTotal = (manifest.assets || []).length
  let assetDone = 0
  for (const a of manifest.assets || []) {
    validateAsset(a)
    if (assetIds.has(a.id)) throw new ImportError(tl('lib.share.duplicateAsset', { id: a.id }))
    const entry = zip.file(a.file)
    if (!entry) throw new ImportError(tl('lib.share.missingAssetFile', { file: a.file }))
    if (a.workspaceId && !workspaceIds.has(a.workspaceId)) {
      throw new ImportError(tl('lib.share.assetMissingWorkspace', { id: a.id }))
    }
    const buf = await entry.async('arraybuffer')
    assetDone += 1
    report('read', assetDone, assetTotal)
    assetRecords.push({
      metadata: {
        id: a.id, mime: a.mime || 'image/png', width: a.width ?? null, height: a.height ?? null,
        size: a.size ?? buf.byteLength, createdAt: a.createdAt || Date.now(), source: a.source || 'imported',
        workspaceId: a.workspaceId || null, favorite: !!a.favorite,
      },
      blob: new Blob([buf], { type: a.mime || 'image/png' }),
    })
    assetIds.add(a.id)
  }
  const existingAssets = await db.getAll(STORE_ASSETS)
  existingAssets.forEach((asset) => assetIds.add(asset.id))

  const generations = []
  const generationIds = new Set()
  for (const source of manifest.generations || []) {
    validateGeneration(source, workspaceIds, assetIds)
    if (generationIds.has(source.id)) throw new ImportError(tl('lib.share.duplicateGeneration', { id: source.id }))
    generationIds.add(source.id)
    const pending = source.status === 'pending'
    generations.push({
      ...source,
      workspaceId: source.workspaceId || null,
      ...(pending ? {
        status: 'failed',
        error: tl('lib.share.importAborted'),
        elapsedMs: Math.max(0, Date.now() - (source.createdAt || Date.now())),
      } : {}),
    })
  }

  validatePromptLibrary(manifest.promptLibrary || {}, workspaceIds)

  const storageSnapshot = snapshotStorage(manifest.promptLibrary || {})
  let promptCount = 0
  try {
    // localStorage 先写入，失败时不会开始 IndexedDB 事务；事务失败时由 catch 恢复快照。
    for (const p of manifest.presets || []) savePreset(stripKey(p), { preserveExistingKey: true })
    for (const [wsId, prompts] of Object.entries(manifest.promptLibrary || {})) {
      savePrompts(prompts, wsId)
      promptCount += prompts.length
    }

    report('write', 0, 1)
    const tx = db.transaction([STORE_WORKSPACES, STORE_ASSETS, STORE_ASSET_BLOBS, STORE_GENERATIONS], 'readwrite')
    for (const ws of workspaces) await tx.objectStore(STORE_WORKSPACES).put(ws)
    for (const { metadata, blob } of assetRecords) {
      await tx.objectStore(STORE_ASSETS).put(metadata)
      await tx.objectStore(STORE_ASSET_BLOBS).put({ id: metadata.id, blob })
    }
    for (const generation of generations) await tx.objectStore(STORE_GENERATIONS).put(toPlain(generation))
    await tx.done
    report('write', 1, 1)
  } catch (error) {
    restoreStorage(storageSnapshot)
    throw error
  }

  return { assetCount: assetRecords.length, genCount: generations.length, promptCount, wsCount: workspaces.length }
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
  if (data.kind !== 'presets') throw new ImportError(tl('lib.share.notPresets'))
  validatePresets(data.presets || [])
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
    params: { ...sanitizeParams(generation.params), protocol: PROTOCOL_IMAGES }, // 不含 Key,旧协议同步归一
    protocol: PROTOCOL_IMAGES,
    refs,
  }
}

// 导入配方:参考图落库,返回预填面板所需数据。不自动发起(对方需用自己的接口)。
export async function importRecipe(json, availablePresets, workspaceId = null) {
  const data = typeof json === 'string' ? JSON.parse(json) : json
  assertSchema(data)
  if (data.kind !== 'recipe') throw new ImportError(tl('lib.share.notRecipe'))

  if (!Array.isArray(data.refs)) throw new ImportError(tl('lib.share.recipeRefsInvalid'))
  if (data.refs.length > 16) throw new ImportError(tl('lib.share.recipeTooManyRefs'))
  const refBlobs = []
  for (const ref of data.refs) {
    if (!ref || typeof ref.dataUrl !== 'string' || !ref.dataUrl.startsWith('data:')) {
      throw new ImportError(tl('lib.share.recipeInvalidRef'))
    }
    let blob
    try { blob = dataUrlToBlob(ref.dataUrl) } catch { throw new ImportError(tl('lib.share.recipeUnparsableRef')) }
    refBlobs.push({ blob, mime: ref.mime })
  }
  const refImageIds = []
  for (const { blob, mime } of refBlobs) {
    const asset = await putAsset({ blob, mime, source: 'imported', workspaceId })
    refImageIds.push(asset.id)
  }

  // 协议匹配检查(Scenario:缺少匹配协议 → 提示而非静默失败)
  const presets = availablePresets || loadPresets()
  const hasMatchingProtocol = presets.some((p) => p.protocol === data.protocol)
  // 协议已统一为 images;旧配方里的 chat 也按 images 处理,仅在完全没有预设时提示。
  const needsProtocolNotice = !presets.length
    ? tl('lib.share.recipeNeedsProtocol', { protocol: PROTOCOL_IMAGES })
    : (!hasMatchingProtocol && data.protocol && data.protocol !== PROTOCOL_IMAGES
      ? tl('lib.share.recipeLegacy')
      : null)

  return {
    prefill: { prompt: data.prompt, params: data.params, protocol: PROTOCOL_IMAGES, refImageIds },
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
  if (!data || typeof data !== 'object') throw new ImportError(tl('lib.share.badFormat'))
  if (typeof data.schemaVersion !== 'number') throw new ImportError(tl('lib.share.missingSchemaVersion'))
  if (data.schemaVersion > SCHEMA_VERSION) {
    throw new ImportError(tl('lib.share.newerSchema', { version: data.schemaVersion }))
  }
}

function sanitizeParams(params = {}) {
  // 明确剔除任何可能夹带凭据的字段(双保险)。
  const { apiKey: _apiKey, key: _key, authorization: _authorization, ...safe } = params
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

function validateWorkspaces(workspaces) {
  if (!Array.isArray(workspaces)) throw new ImportError(tl('lib.share.workspacesInvalid'))
  const ids = new Set()
  return workspaces.map((ws) => {
    if (!ws || typeof ws !== 'object' || typeof ws.id !== 'string' || !ws.id) {
      throw new ImportError(tl('lib.share.invalidWorkspace'))
    }
    if (ids.has(ws.id)) throw new ImportError(tl('lib.share.duplicateWorkspace', { id: ws.id }))
    ids.add(ws.id)
    return {
      id: ws.id, name: ws.name || tl('lib.defaults.workspaceName'), createdAt: ws.createdAt || Date.now(),
      updatedAt: ws.updatedAt || Date.now(), settings: ws.settings || {},
    }
  })
}

function validateAsset(asset) {
  if (!asset || typeof asset !== 'object' || typeof asset.id !== 'string' || !asset.id || typeof asset.file !== 'string') {
    throw new ImportError(tl('lib.share.invalidAsset'))
  }
}

function validateGeneration(generation, workspaceIds, assetIds) {
  if (!generation || typeof generation !== 'object' || typeof generation.id !== 'string' || !generation.id) {
    throw new ImportError(tl('lib.share.invalidGeneration'))
  }
  if (generation.workspaceId && !workspaceIds.has(generation.workspaceId)) {
    throw new ImportError(tl('lib.share.generationMissingWorkspace', { id: generation.id }))
  }
  if (!Array.isArray(generation.refImageIds) || !Array.isArray(generation.outputImageIds)) {
    throw new ImportError(tl('lib.share.generationAssetRefInvalid', { id: generation.id }))
  }
  for (const id of [...(generation.refImageIds || []), ...(generation.outputImageIds || [])]) {
    if (!assetIds.has(id)) throw new ImportError(tl('lib.share.generationMissingAsset', { id: generation.id }))
  }
}

function validatePromptLibrary(promptLibrary, workspaceIds) {
  for (const [wsId, prompts] of Object.entries(promptLibrary)) {
    if (!workspaceIds.has(wsId)) throw new ImportError(tl('lib.share.promptMissingWorkspace', { id: wsId }))
    if (!Array.isArray(prompts)) throw new ImportError(tl('lib.share.promptInvalid', { id: wsId }))
    for (const prompt of prompts) {
      if (!prompt || typeof prompt !== 'object' || typeof prompt.text !== 'string') {
        throw new ImportError(tl('lib.share.promptInvalid', { id: wsId }))
      }
    }
  }
}

function validatePresets(presets) {
  if (!Array.isArray(presets)) throw new ImportError(tl('lib.share.presetsInvalid'))
  for (const preset of presets) {
    if (!preset || typeof preset !== 'object' || typeof preset.name !== 'string' || typeof preset.baseURL !== 'string') {
      throw new ImportError(tl('lib.share.invalidPreset'))
    }
  }
}

function snapshotStorage(promptLibrary) {
  const keys = [PRESETS_STORAGE_KEY, ACTIVE_PRESET_KEY]
  for (const wsId of Object.keys(promptLibrary)) keys.push(promptStorageKey(wsId))
  return keys.map((key) => ({ key, value: localStorage.getItem(key) }))
}

function restoreStorage(snapshot) {
  for (const { key, value } of snapshot) {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  }
}

function toPlain(value) {
  return JSON.parse(JSON.stringify(value))
}
