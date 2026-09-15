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

// 把网络层换成可控 mock:队列测的是「调度」,不该依赖真实接口。
const runGeneration = vi.fn()
vi.mock('../generationService.js', () => ({
  runGeneration: (...args) => runGeneration(...args),
}))

const { useWorkbenchStore, MAX_GENERATION_QUEUE } = await import('../../stores/workbench.js')

const wait = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(predicate, timeout = 500) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (predicate()) return true
    await wait()
  }
  return predicate()
}
function successGen(id) {
  return { id, status: 'success', prompt: 'x', refImageIds: [], outputImageIds: [], params: {}, createdAt: Date.now() }
}

describe('生成队列', () => {
  let store

  beforeEach(() => {
    map.clear()
    runGeneration.mockReset()
    setActivePinia(createPinia())
    store = useWorkbenchStore()
    store.presets = [{
      id: 'preset_q', name: '队列测试', baseURL: 'https://example.invalid',
      apiKey: 'key', model: 'model', protocol: 'images', requestTimeoutMs: 180000,
    }]
    store.activePresetId = 'preset_q'
    store.activeWorkspaceId = 'ws_default'
    store.conversationId = 'conv_a'
  })

  it('入队记下发起时的工作区与会话,而不是开跑时的上下文', () => {
    const first = store.enqueueGeneration({ prompt: '第一单', params: { n: 1 } })
    expect(first.ok).toBe(true)
    expect(first.position).toBe(1)

    // 用户切到别的会话后继续排队,结果必须仍回到各自发起的会话
    store.conversationId = 'conv_b'
    store.enqueueGeneration({ prompt: '第二单' })

    expect(store.generationQueue.map((q) => q.conversationId)).toEqual(['conv_a', 'conv_b'])
    expect(store.generationQueue.map((q) => q.prompt)).toEqual(['第一单', '第二单'])
    expect(store.generationQueue[0].workspaceId).toBe('ws_default')
  })

  it('队列满额后拒绝追加,并给出上限', () => {
    for (let i = 0; i < MAX_GENERATION_QUEUE; i += 1) {
      expect(store.enqueueGeneration({ prompt: `第 ${i} 单` }).ok).toBe(true)
    }
    const overflow = store.enqueueGeneration({ prompt: '溢出' })
    expect(overflow.ok).toBe(false)
    expect(overflow.reason).toBe('full')
    expect(overflow.max).toBe(MAX_GENERATION_QUEUE)
    expect(store.generationQueue).toHaveLength(MAX_GENERATION_QUEUE)
  })

  it('无接口 / 缺 Key / 空提示词都不入队', () => {
    store.presets = []
    store.activePresetId = null
    expect(store.enqueueGeneration({ prompt: 'x' })).toMatchObject({ ok: false, reason: 'no-preset' })

    store.presets = [{ id: 'p2', name: 'x', apiKey: '', baseURL: 'https://x.invalid', model: 'm' }]
    store.activePresetId = 'p2'
    expect(store.enqueueGeneration({ prompt: 'x' })).toMatchObject({ ok: false, reason: 'no-key' })

    store.presets = [{ id: 'p3', name: 'x', apiKey: 'k', baseURL: 'https://x.invalid', model: 'm' }]
    store.activePresetId = 'p3'
    expect(store.enqueueGeneration({ prompt: '   ' })).toMatchObject({ ok: false, reason: 'empty-prompt' })
    expect(store.generationQueue).toHaveLength(0)
  })

  it('可以移除和提前排队项', () => {
    const a = store.enqueueGeneration({ prompt: 'A' }).item
    const b = store.enqueueGeneration({ prompt: 'B' }).item
    store.enqueueGeneration({ prompt: 'C' })

    expect(store.promoteQueuedGeneration(b.id)).toBe(true)
    expect(store.generationQueue.map((q) => q.prompt)).toEqual(['B', 'A', 'C'])

    expect(store.removeQueuedGeneration(a.id)).toBe(true)
    expect(store.generationQueue.map((q) => q.prompt)).toEqual(['B', 'C'])
    expect(store.removeQueuedGeneration('不存在')).toBe(false)
  })

  it('当前任务结束后按顺序自动开跑,并写回各自发起的会话', async () => {
    // 第一单卡住不返回,模拟「生成中」
    let releaseFirst
    runGeneration.mockImplementationOnce(() => new Promise((resolve) => {
      releaseFirst = () => resolve(successGen('gen_first'))
    }))
    runGeneration.mockImplementation(async ({ params }) => successGen(`gen_${params?.conversationId || 'next'}`))

    const running = store.generate({ prompt: '手动第一单', params: { conversationId: 'conv_a' } })
    expect(store.generating).toBe(true)

    store.enqueueGeneration({ prompt: '排队一' })
    store.conversationId = 'conv_b'
    store.enqueueGeneration({ prompt: '排队二' })
    expect(store.generationQueue).toHaveLength(2)

    releaseFirst()
    await running

    // 队列应当自己跑空,期间不需要用户再点一次生成
    expect(await until(() => store.generationQueue.length === 0 && !store.generating)).toBe(true)
    const queuedCalls = runGeneration.mock.calls.slice(1)
    expect(queuedCalls.map((call) => call[0].params.conversationId)).toEqual(['conv_a', 'conv_b'])
    expect(queuedCalls.map((call) => call[0].prompt)).toEqual(['排队一', '排队二'])
  })

  it('队列空闲时 processGenerationQueue 不会空跑', async () => {
    await store.processGenerationQueue()
    expect(runGeneration).not.toHaveBeenCalled()
    expect(store.generating).toBe(false)
  })
})