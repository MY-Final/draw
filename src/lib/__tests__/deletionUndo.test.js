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
const { createGeneration, getGeneration, listGenerations } = await import('../generationRepo.js')
const { putWorkspace, listWorkspaces, deleteWorkspace } = await import('../workspaceRepo.js')
const { getDB } = await import('../db.js')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function seedGeneration(extra = {}) {
  return createGeneration({
    prompt: extra.prompt || '测试生成',
    refImageIds: [],
    params: { conversationId: extra.conversationId || 'conv_undo' },
    workspaceId: extra.workspaceId || 'ws_default',
  })
}

describe('会话/工作区删除撤销', () => {
  let store

  beforeEach(async () => {
    map.clear()
    setActivePinia(createPinia())
    store = useWorkbenchStore()
    const db = await getDB()
    await db.clear('assets')
    await db.clear('assetBlobs')
    await db.clear('generations')
    for (const w of await listWorkspaces()) await deleteWorkspace(w.id)
  })

  it('删除会话后立刻从界面消失,但撤销窗口内库里仍然保留', async () => {
    const gen = await seedGeneration({ conversationId: 'conv_undo' })
    store.activeWorkspaceId = 'ws_default'
    store.conversationId = 'conv_undo'
    store.generations = await listGenerations()

    const result = await store.deleteConversationWithUndo('conv_undo', 80)
    expect(result.batchId).toBeTruthy()
    expect(result.count).toBe(1)
    expect(store.generations.some((g) => g.id === gen.id)).toBe(false)
    expect(await getGeneration(gen.id)).toBeTruthy()

    // 刷新(别的操作会触发)不能把待撤销的会话带回来
    await store.refreshAll()
    expect(store.generations.some((g) => g.id === gen.id)).toBe(false)

    expect(store.undoConversationDelete(result.batchId)).toBe(true)
    expect(store.generations.some((g) => g.id === gen.id)).toBe(true)
    expect(store.pendingConversationDelete).toBeNull()
    expect(await getGeneration(gen.id)).toBeTruthy()
  })

  it('撤销窗口结束后会话才真正落库删除', async () => {
    const gen = await seedGeneration({ conversationId: 'conv_expire' })
    store.activeWorkspaceId = 'ws_default'
    store.conversationId = 'conv_expire'
    store.generations = await listGenerations()

    const result = await store.deleteConversationWithUndo('conv_expire', 30)
    expect(await getGeneration(gen.id)).toBeTruthy()
    await wait(120)

    expect(await getGeneration(gen.id)).toBeUndefined()
    expect(store.pendingConversationDelete).toBeNull()
    expect(store.undoConversationDelete(result.batchId)).toBe(false)
  })

  it('连续删除多个会话会合并成一个撤销批次', async () => {
    const first = await seedGeneration({ conversationId: 'conv_a' })
    const second = await seedGeneration({ conversationId: 'conv_b' })
    store.activeWorkspaceId = 'ws_default'
    store.conversationId = 'conv_a'
    store.generations = await listGenerations()

    const r1 = await store.deleteConversationWithUndo('conv_a', 200)
    const r2 = await store.deleteConversationWithUndo('conv_b', 200)
    expect(r2.batchId).toBe(r1.batchId)
    expect(store.pendingConversationDelete.entries).toHaveLength(2)

    expect(store.undoConversationDelete(r1.batchId)).toBe(true)
    expect(store.generations.map((g) => g.id).sort()).toEqual([first.id, second.id].sort())
    expect(await getGeneration(first.id)).toBeTruthy()
    expect(await getGeneration(second.id)).toBeTruthy()
  })

  it('空会话(草稿)删除不需要撤销批次', async () => {
    store.activeWorkspaceId = 'ws_default'
    store.conversationId = 'conv_empty'
    store.generations = []

    const result = await store.deleteConversationWithUndo('conv_empty', 5000)
    expect(result.empty).toBe(true)
    expect(result.batchId).toBeNull()
    expect(store.pendingConversationDelete).toBeNull()
  })

  it('删除工作区可撤销:工作区、记录与当前视图都回来', async () => {
    const wsA = await putWorkspace({ id: 'ws_a', name: '工作区 A' })
    const wsB = await putWorkspace({ id: 'ws_b', name: '工作区 B' })
    const gen = await seedGeneration({ conversationId: 'conv_ws', workspaceId: wsB.id })

    store.workspaces = await listWorkspaces()
    store.activeWorkspaceId = wsB.id
    store.conversationId = 'conv_ws'
    store.generations = await listGenerations()

    const result = await store.deleteWorkspaceWithUndo(wsB.id, 200)
    expect(result.ok).toBe(true)
    expect(store.workspaces.some((w) => w.id === wsB.id)).toBe(false)
    expect(store.generations.some((g) => g.id === gen.id)).toBe(false)
    expect(store.activeWorkspaceId).toBe(wsA.id)
    // 窗口期内库里都还在
    expect((await listWorkspaces()).some((w) => w.id === wsB.id)).toBe(true)
    expect(await getGeneration(gen.id)).toBeTruthy()

    expect(await store.undoWorkspaceDelete(result.batchId)).toBe(true)
    expect(store.workspaces.some((w) => w.id === wsB.id)).toBe(true)
    expect(store.generations.some((g) => g.id === gen.id)).toBe(true)
    expect(store.activeWorkspaceId).toBe(wsB.id)
  })

  it('撤销窗口结束后工作区才真正落库删除', async () => {
    const wsA = await putWorkspace({ id: 'ws_a', name: '工作区 A' })
    const wsB = await putWorkspace({ id: 'ws_b', name: '工作区 B' })
    const gen = await seedGeneration({ conversationId: 'conv_ws2', workspaceId: wsB.id })

    store.workspaces = await listWorkspaces()
    store.activeWorkspaceId = wsB.id
    store.conversationId = 'conv_ws2'
    store.generations = await listGenerations()

    await store.deleteWorkspaceWithUndo(wsB.id, 30)
    await wait(150)

    expect((await listWorkspaces()).some((w) => w.id === wsB.id)).toBe(false)
    expect(await getGeneration(gen.id)).toBeUndefined()
    expect(store.pendingWorkspaceDelete).toBeNull()
    expect(store.workspaces.some((w) => w.id === wsA.id)).toBe(true)
  })

  it('只剩一个工作区时不允许删除', async () => {
    const only = await putWorkspace({ id: 'ws_only', name: '唯一工作区' })
    store.workspaces = await listWorkspaces()
    store.activeWorkspaceId = only.id

    const result = await store.deleteWorkspaceWithUndo(only.id, 0)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('last')
    expect(store.workspaces).toHaveLength(1)
  })
})