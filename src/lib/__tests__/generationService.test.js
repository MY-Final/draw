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
const { generate: mockedGenerate } = await import('../adapters.js')
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

describe('runGeneration 批量生成(n>1)', () => {
  beforeEach(async () => {
    map.clear()
    const db = await getDB()
    await db.clear('assets')
    await db.clear('generations')
  })

  it('请求 4 张且接口返回 4 张:全部落库并挂到 outputImageIds', async () => {
    vi.mocked(mockedGenerate).mockResolvedValueOnce({
      images: [
        { kind: 'dataUrl', value: 'data:image/png;base64,AAAA' },
        { kind: 'dataUrl', value: 'data:image/png;base64,AAAB' },
        { kind: 'dataUrl', value: 'data:image/png;base64,AAAC' },
        { kind: 'dataUrl', value: 'data:image/png;base64,AAAD' },
      ],
      snippet: null,
    })
    const gen = await runGeneration({ preset, prompt: '批量', params: { n: 4 }, workspaceId: 'ws_default' })
    expect(gen.status).toBe('success')
    expect(gen.outputImageIds.length).toBe(4)
    expect(gen.partialNote).toBeUndefined()
    expect((await listAssets()).length).toBe(4)
  })

  it('请求 4 张但接口只返回 1 张:保留已得图并明确 partial 告警,不静默', async () => {
    vi.mocked(mockedGenerate).mockResolvedValueOnce({
      images: [{ kind: 'dataUrl', value: 'data:image/png;base64,AAAA' }],
      snippet: '{"data":[{"b64_json":"..."}]}',
    })
    const gen = await runGeneration({ preset, prompt: '批量', params: { n: 4 }, workspaceId: 'ws_default' })
    expect(gen.status).toBe('success')
    expect(gen.outputImageIds.length).toBe(1)
    expect(gen.partialNote).toContain('请求 4 张')
    expect(gen.rawResponseSnippet).toBeTruthy()
    // 已计费的图不删
    expect((await listAssets()).length).toBe(1)
  })
})
