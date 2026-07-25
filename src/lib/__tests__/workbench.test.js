import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const map = new Map()
vi.stubGlobal('localStorage', {
  getItem: (key) => (map.has(key) ? map.get(key) : null),
  setItem: (key, value) => map.set(key, String(value)),
  removeItem: (key) => map.delete(key),
  clear: () => map.clear(),
})
vi.stubGlobal('navigator', {
  storage: { estimate: async () => ({ usage: 0, quota: 1_000_000 }) },
})

const { useWorkbenchStore } = await import('../../stores/workbench.js')
const {
  createGeneration, getGeneration, listGenerations,
} = await import('../generationRepo.js')
const { putAsset, getAsset, listAssets } = await import('../assetRepo.js')
const { getDB } = await import('../db.js')

async function pending(extra = {}) {
  return createGeneration({
    prompt: '测试生成',
    refImageIds: extra.refImageIds || [],
    params: { conversationId: extra.conversationId || 'conv_test' },
    workspaceId: 'ws_default',
  })
}

describe('workbench issue regressions', () => {
  let store

  beforeEach(async () => {
    map.clear()
    setActivePinia(createPinia())
    store = useWorkbenchStore()
    const db = await getDB()
    await db.clear('assets')
    await db.clear('generations')
  })

  it('启动调和会立即终止所有遗留 pending，包括刚创建的记录', async () => {
    const gen = await pending()
    store.generations = await listGenerations()

    await store.reconcileStalePending()

    const back = await getGeneration(gen.id)
    expect(back.status).toBe('failed')
    expect(back.error).toBe('生成中断（页面已刷新）')
    expect(back.elapsedMs).toBeGreaterThanOrEqual(0)
  })

  it('删除含活跃生成的会话会先 abort 请求', async () => {
    const gen = await pending({ conversationId: 'conv_delete' })
    store.generations = await listGenerations()
    store.assets = []
    store.conversationId = 'conv_other'
    const controller = new AbortController()
    // 覆盖 pending 尚未通过 onPending 回填 genId 的极短窗口。
    store.activeGeneration = { genId: null, conversationId: 'conv_delete', workspaceId: 'ws_default', controller }

    await store.deleteConversation('conv_delete')

    expect(controller.signal.aborted).toBe(true)
    expect(await getGeneration(gen.id)).toBeUndefined()
  })

  it('清空工作台会 abort 活跃请求并清掉记录与素材', async () => {
    const gen = await pending()
    await putAsset({ blob: new Blob(['x'], { type: 'image/png' }), mime: 'image/png' })
    store.generations = await listGenerations()
    store.assets = await listAssets()
    const controller = new AbortController()
    store.activeGeneration = { genId: gen.id, controller }

    await store.resetWorkbench()

    expect(controller.signal.aborted).toBe(true)
    expect(await listGenerations()).toEqual([])
    expect(await listAssets()).toEqual([])
  })

  it('素材库删除会保留仍被生成记录引用的素材', async () => {
    const referenced = await putAsset({ blob: new Blob(['r'], { type: 'image/png' }), mime: 'image/png' })
    const free = await putAsset({ blob: new Blob(['f'], { type: 'image/png' }), mime: 'image/png' })
    await pending({ refImageIds: [referenced.id] })
    store.generations = await listGenerations()
    store.assets = await listAssets()

    const result = await store.removeAssets([referenced.id, free.id])

    expect(result.blockedIds).toEqual([referenced.id])
    expect(result.deletedIds).toEqual([free.id])
    expect(await getAsset(referenced.id)).toBeTruthy()
    expect(await getAsset(free.id)).toBeUndefined()
  })
})
