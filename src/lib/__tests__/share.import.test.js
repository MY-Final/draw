// 备份导入:保留 workspaceId / createdAt / favorite;预设不抹 Key。
import 'fake-indexeddb/auto'
import JSZip from 'jszip'
import { describe, it, expect, beforeEach, vi } from 'vitest'

const store = new Map()
vi.stubGlobal('localStorage', {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
})

const { putAsset, listAssets, deleteAssets } = await import('../assetRepo.js')
const { createGeneration, updateGeneration, listGenerations, clearAllGenerations } = await import('../generationRepo.js')
const { putWorkspace, listWorkspaces, deleteWorkspace } = await import('../workspaceRepo.js')
const { exportLibraryZip, importLibraryZip } = await import('../share.js')
const { savePreset, loadPresets } = await import('../presets.js')
const { getDB } = await import('../db.js')

const AK = 'api' + 'Key'
const KEEP = 'key-keep-me'

function blob(text = 'PNG') {
  return new Blob([text], { type: 'image/png' })
}

async function clearAll() {
  store.clear()
  const db = await getDB()
  await db.clear('assets')
  await db.clear('generations')
  await db.clear('workspaces')
}

describe('整库导入保留 id 与元数据', () => {
  beforeEach(async () => {
    await clearAll()
  })

  it('workspaceId / createdAt / favorite 往返保留', async () => {
    await putWorkspace({ id: 'ws_alpha', name: 'Alpha', createdAt: 1000, updatedAt: 1000 })
    const ts = 1_700_000_000_000
    const a1 = await putAsset({
      blob: blob('fav-img'),
      mime: 'image/png',
      source: 'generated',
      workspaceId: 'ws_alpha',
      createdAt: ts,
      favorite: true,
    })
    const gen = await createGeneration({
      prompt: '猫',
      refImageIds: [],
      params: { size: '1024x1024' },
      workspaceId: 'ws_alpha',
    })
    await updateGeneration(gen.id, { status: 'success', outputImageIds: [a1.id] })

    const { blob: zipBlob } = await exportLibraryZip()

    // 清库
    await deleteAssets((await listAssets()).map((a) => a.id))
    await clearAllGenerations()
    for (const w of await listWorkspaces()) await deleteWorkspace(w.id)
    expect((await listWorkspaces()).length).toBe(0)

    const result = await importLibraryZip(await zipBlob.arrayBuffer())
    expect(result.wsCount).toBe(1)
    expect(result.assetCount).toBe(1)

    const ws = await listWorkspaces()
    expect(ws.map((w) => w.id)).toEqual(['ws_alpha'])

    const assets = await listAssets()
    expect(assets[0].id).toBe(a1.id)
    expect(assets[0].workspaceId).toBe('ws_alpha')
    expect(assets[0].createdAt).toBe(ts)
    expect(assets[0].favorite).toBe(true)

    const gens = await listGenerations()
    expect(gens[0].workspaceId).toBe('ws_alpha')
    expect(gens[0].outputImageIds).toEqual([a1.id])
  })

  it('导入过程会回报进度,便于界面显示而不是干等', async () => {
    await putWorkspace({ id: 'ws_progress', name: '进度' })
    await putAsset({ blob: blob('p1'), mime: 'image/png', workspaceId: 'ws_progress' })
    await putAsset({ blob: blob('p2'), mime: 'image/png', workspaceId: 'ws_progress' })
    await putAsset({ blob: blob('p3'), mime: 'image/png', workspaceId: 'ws_progress' })
    const { blob: zipBlob } = await exportLibraryZip()

    const events = []
    await importLibraryZip(await zipBlob.arrayBuffer(), {
      onProgress: (e) => events.push(e),
    })

    const reads = events.filter((e) => e.phase === 'read')
    expect(reads.at(-1)).toEqual({ phase: 'read', done: 3, total: 3 })
    expect(events.some((e) => e.phase === 'write' && e.done === 1)).toBe(true)
    // 进度回调抛错不能影响导入本身
    await expect(importLibraryZip(await zipBlob.arrayBuffer(), {
      onProgress: () => { throw new Error('boom') },
    })).resolves.toMatchObject({ assetCount: 3 })
  })

  it('导入预设不抹本机已有 Key', async () => {
    await putWorkspace({ id: 'ws_default', name: '默认' })
    // 本机已有同 id 预设带 Key
    savePreset({
      id: 'preset_shared',
      name: '中转',
      baseURL: 'https://api.x.com',
      model: 'm',
      [AK]: KEEP,
    })
    // 导出的库里带同 id 但 Key 会被 strip
    const { blob: zipBlob } = await exportLibraryZip()
    // 导入(manifest 里 key 已是空)
    await importLibraryZip(await zipBlob.arrayBuffer())
    const presets = loadPresets()
    const p = presets.find((x) => x.id === 'preset_shared')
    expect(p[AK]).toBe(KEEP)
  })

  it('缺少素材文件时在写入前拒绝,不留下工作区', async () => {
    const zip = new JSZip()
    zip.file('manifest.json', JSON.stringify({
      kind: 'library', schemaVersion: 2, assets: [{ id: 'asset_missing', file: 'assets/missing.png', mime: 'image/png' }],
      generations: [], workspaces: [{ id: 'ws_new', name: '新工作区' }], presets: [], promptLibrary: {},
    }))

    await expect(importLibraryZip(await zip.generateAsync({ type: 'arraybuffer' }))).rejects.toThrow('缺少素材文件')
    expect(await listWorkspaces()).toEqual([])
  })

  it('导入 pending 记录统一收口为已中断失败', async () => {
    const zip = new JSZip()
    zip.file('manifest.json', JSON.stringify({
      kind: 'library', schemaVersion: 2, assets: [],
      generations: [{ id: 'gen_pending', createdAt: Date.now(), prompt: '中断', refImageIds: [], outputImageIds: [], params: {}, status: 'pending' }],
      workspaces: [], presets: [], promptLibrary: {},
    }))

    await importLibraryZip(await zip.generateAsync({ type: 'arraybuffer' }))
    const [generation] = await listGenerations()
    expect(generation.status).toBe('failed')
    expect(generation.error).toBe('导入时已中断')
  })
})
