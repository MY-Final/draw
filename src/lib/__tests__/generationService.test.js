// generationService:取消时不落孤儿图,并安全处理已删记录。
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'

const map = new Map()
vi.stubGlobal('localStorage', {
  getItem: (k) => (map.has(k) ? map.get(k) : null),
  setItem: (k, v) => map.set(k, String(v)),
  removeItem: (k) => map.delete(k),
  clear: () => map.clear(),
})

// mock adapters.generate 可挂起 + abort
vi.mock('../adapters.js', () => ({
  generate: vi.fn(({ signal }) => new Promise((resolve, reject) => {
    if (signal) {
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'))
        return
      }
      signal.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'))
      })
    }
  })),
}))

const { runGeneration } = await import('../generationService.js')
const { listAssets, putAsset } = await import('../assetRepo.js')
const { listGenerations, deleteGeneration } = await import('../generationRepo.js')
const { getDB } = await import('../db.js')

const AK = 'api' + 'Key'
const preset = {
  baseURL: 'https://api.test',
  model: 'm',
  protocol: 'images',
  [AK]: 'test-key',
}

describe('runGeneration 取消', () => {
  beforeEach(async () => {
    map.clear()
    const db = await getDB()
    await db.clear('assets')
    await db.clear('generations')
  })

  it('abort 后标记失败且不产生素材', async () => {
    const controller = new AbortController()
    const p = runGeneration({
      preset,
      prompt: '猫',
      signal: controller.signal,
      workspaceId: 'ws_default',
    })
    // 等 pending 落库
    await new Promise((r) => setTimeout(r, 20))
    controller.abort()
    const result = await p
    expect(result.status).toBe('failed')
    expect(result.error).toBe('已取消')
    expect((await listAssets()).length).toBe(0)
  })

  it('参考图 id 失效时明确失败，不静默降级为文生图', async () => {
    await expect(runGeneration({
      preset,
      prompt: '基于参考图修改',
      refImageIds: ['missing-asset'],
      workspaceId: 'ws_default',
    })).rejects.toThrow('参考图已不存在')

    const [gen] = await listGenerations()
    expect(gen.status).toBe('failed')
    expect(gen.error).toContain('参考图已不存在')
    expect((await listAssets()).length).toBe(0)
  })

  it('存在的参考图仍进入适配调用等待，可被正常取消', async () => {
    const ref = await putAsset({
      blob: new Blob(['ref'], { type: 'image/png' }),
      mime: 'image/png',
      source: 'reference-uploaded',
    })
    const controller = new AbortController()
    const p = runGeneration({ preset, prompt: '改图', refImageIds: [ref.id], signal: controller.signal })
    await new Promise((r) => setTimeout(r, 20))
    controller.abort()
    const result = await p
    expect(result.error).toBe('已取消')
  })

  it('记录被删后 cancel 不抛', async () => {
    const controller = new AbortController()
    let pendingId = null
    const p = runGeneration({
      preset,
      prompt: '狗',
      signal: controller.signal,
      onPending: (g) => { pendingId = g.id },
    })
    await new Promise((r) => setTimeout(r, 20))
    expect(pendingId).toBeTruthy()
    await deleteGeneration(pendingId)
    controller.abort()
    const result = await p
    // safeUpdate 失败时仍返回带 cancelled 语义的结果
    expect(result.error === '已取消' || result.cancelled || result.status === 'failed').toBe(true)
  })
})
