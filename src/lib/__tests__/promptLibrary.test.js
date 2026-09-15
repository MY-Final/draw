import { describe, it, expect, beforeEach, vi } from 'vitest'

const map = new Map()
vi.stubGlobal('localStorage', {
  getItem: (key) => (map.has(key) ? map.get(key) : null),
  setItem: (key, value) => map.set(key, String(value)),
  removeItem: (key) => map.delete(key),
  clear: () => map.clear(),
})
vi.stubGlobal('crypto', { randomUUID: () => `id_${Math.random().toString(36).slice(2, 10)}` })

const { addPrompt, removePrompt, updatePrompt, getAllPrompts, promptStorageKey } = await import('../promptLibrary.js')

const WS = 'ws_prompt'

describe('prompt 收藏库', () => {
  beforeEach(() => map.clear())

  it('按工作区隔离存储', () => {
    addPrompt('工作区 A 的词', 'ws_a')
    addPrompt('工作区 B 的词', 'ws_b')
    expect(getAllPrompts('ws_a').map((p) => p.text)).toEqual(['工作区 A 的词'])
    expect(getAllPrompts('ws_b').map((p) => p.text)).toEqual(['工作区 B 的词'])
    expect(promptStorageKey('ws_a')).toContain('ws_a')
  })

  it('拒绝重复与空文本', () => {
    expect(addPrompt('雨夜霓虹', WS).ok).toBe(true)
    expect(addPrompt('雨夜霓虹', WS)).toMatchObject({ ok: false, reason: 'duplicate' })
    expect(addPrompt('   ', WS)).toMatchObject({ ok: false, reason: 'empty' })
    expect(getAllPrompts(WS)).toHaveLength(1)
  })

  it('可以改写已收藏的 prompt 且保持顺序', async () => {
    const first = addPrompt('原始文本', WS).entry
    addPrompt('另一条', WS)
    const before = getAllPrompts(WS).map((p) => p.id)

    const result = updatePrompt(first.id, '改写后的文本', WS)
    expect(result.ok).toBe(true)
    const after = getAllPrompts(WS)
    expect(after.map((p) => p.id)).toEqual(before)
    expect(after.find((p) => p.id === first.id).text).toBe('改写后的文本')
  })

  it('改写时会拦截重复文本,但允许改回自己', () => {
    const a = addPrompt('第一条', WS).entry
    addPrompt('第二条', WS)

    expect(updatePrompt(a.id, '第二条', WS)).toMatchObject({ ok: false, reason: 'duplicate' })
    expect(updatePrompt(a.id, '第一条', WS).ok).toBe(true)
    expect(updatePrompt('不存在', 'x', WS)).toMatchObject({ ok: false, reason: 'missing' })
    expect(updatePrompt(a.id, '  ', WS)).toMatchObject({ ok: false, reason: 'empty' })
  })

  it('删除只影响指定条目', () => {
    const a = addPrompt('保留', WS).entry
    const b = addPrompt('删掉', WS).entry
    removePrompt(b.id, WS)
    const rest = getAllPrompts(WS)
    expect(rest.map((p) => p.id)).toEqual([a.id])
  })
})