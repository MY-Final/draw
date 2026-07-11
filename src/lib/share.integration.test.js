// 集成测试:整库 zip 导出 → 导入 真实往返(fake-indexeddb + Node Blob/JSZip)。
// 覆盖 assetRepo / generationRepo / share 的协作,以及 D8 预设剥离 Key。
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'

// 最小 localStorage 垫片(share/presets 依赖)
const store = new Map()
vi.stubGlobal('localStorage', {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
})

const { putAsset, listAssets, deleteAssets } = await import('./assetRepo.js')
const { createGeneration, updateGeneration, listGenerations } = await import('./generationRepo.js')
const { exportLibraryZip, importLibraryZip, exportPresets } = await import('./share.js')
const { savePreset, loadPresets } = await import('./presets.js')

function blob(text = 'PNGDATA') {
  return new Blob([text], { type: 'image/png' })
}

describe('整库 zip 往返', () => {
  beforeEach(() => store.clear())

  it('导出后导入,素材与生成记录完整还原', async () => {
    // 播种:两张图 + 一条引用它们的生成
    const a1 = await putAsset({ blob: blob('img-1'), mime: 'image/png', source: 'generated' })
    const a2 = await putAsset({ blob: blob('img-2'), mime: 'image/png', source: 'generated' })
    const gen = await createGeneration({ prompt: '一只赛博猫', refImageIds: [], params: { size: '1024x1024' } })
    await updateGeneration(gen.id, { status: 'success', outputImageIds: [a1.id, a2.id] })

    // 导出
    const zipBlob = await exportLibraryZip()
    expect(zipBlob.size).toBeGreaterThan(0)

    // 清库
    const before = await listAssets()
    await deleteAssets(before.map((a) => a.id))
    expect((await listAssets()).length).toBe(0)

    // 导入(Node 下 JSZip 读 ArrayBuffer 最稳;浏览器里直接传 File/Blob 亦可)
    const { assetCount, genCount } = await importLibraryZip(await zipBlob.arrayBuffer())
    expect(assetCount).toBe(2)
    expect(genCount).toBe(1)

    // 校验还原:id 与引用关系保持
    const assets = await listAssets()
    expect(assets.map((a) => a.id).sort()).toEqual([a1.id, a2.id].sort())
    const gens = await listGenerations()
    expect(gens[0].outputImageIds.sort()).toEqual([a1.id, a2.id].sort())
    expect(gens[0].prompt).toBe('一只赛博猫')

    // 图字节还原正确
    const restored = assets.find((a) => a.id === a1.id)
    expect(await restored.blob.text()).toBe('img-1')
  })

  it('导出的预设不含 Key(D8 端到端)', async () => {
    savePreset({ name: '我的接口', baseURL: 'https://api.x.com', apiKey: 'sk-LIVE-9999', model: 'm', protocol: 'chat' })
    const data = exportPresets()
    expect(data.presets[0].apiKey).toBe('')
    expect(JSON.stringify(data)).not.toContain('sk-LIVE-9999')
    // 本机预设仍保留 Key
    expect(loadPresets()[0].apiKey).toBe('sk-LIVE-9999')
  })

  it('导入无效 zip 被拒绝', async () => {
    const bad = new Blob(['not a zip'], { type: 'application/zip' })
    await expect(importLibraryZip(bad)).rejects.toThrow()
  })
})
