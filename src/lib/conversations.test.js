import { describe, it, expect } from 'vitest'
import { deriveConversations, groupConversationsByDate, convIdOf } from './conversations.js'

const DAY = 86400000
// 固定"现在":2026-07-11 12:00(与项目当前日期一致)
const NOW = new Date(2026, 6, 11, 12, 0, 0).getTime()

function gen(convId, prompt, at, field = 'conversationId') {
  return { id: 'g' + at, prompt, createdAt: at, params: { [field]: convId } }
}

describe('convIdOf 兼容旧字段', () => {
  it('优先 conversationId,回退 canvasId', () => {
    expect(convIdOf({ params: { conversationId: 'c1' } })).toBe('c1')
    expect(convIdOf({ params: { canvasId: 'old' } })).toBe('old')
    expect(convIdOf({ params: {} })).toBe(null)
  })
})

describe('deriveConversations', () => {
  it('聚合同会话,标题取最早 prompt,按最近活跃倒序', () => {
    const gens = [
      gen('c1', '第二句', NOW - 100),
      gen('c1', '第一句', NOW - 500),      // 更早 → 作标题
      gen('c2', '另一个会话', NOW - 50),
    ]
    const convs = deriveConversations(gens)
    expect(convs).toHaveLength(2)
    expect(convs[0].id).toBe('c2')          // c2 lastAt 更新,排前
    const c1 = convs.find((c) => c.id === 'c1')
    expect(c1.title).toBe('第一句')
    expect(c1.count).toBe(2)
  })

  it('忽略无会话 id 的记录', () => {
    const convs = deriveConversations([{ id: 'x', prompt: 'p', createdAt: NOW, params: {} }])
    expect(convs).toHaveLength(0)
  })

  it('过长标题截断', () => {
    const long = '一二三四五六七八九十'.repeat(4)
    const convs = deriveConversations([gen('c', long, NOW)])
    expect(convs[0].title.endsWith('…')).toBe(true)
  })

  it('手动重命名标题优先于派生首句', () => {
    const gens = [gen('c1', '派生首句', NOW)]
    const convs = deriveConversations(gens, { c1: '我的自定义标题' })
    expect(convs[0].title).toBe('我的自定义标题')
  })

  it('无覆盖时仍用派生标题', () => {
    const gens = [gen('c1', '派生首句', NOW)]
    const convs = deriveConversations(gens, { other: '不相关' })
    expect(convs[0].title).toBe('派生首句')
  })
})

describe('groupConversationsByDate', () => {
  it('分到 今天 / 昨天 / 本月更早 / 更早月份', () => {
    const convs = deriveConversations([
      gen('today', '今天的', NOW - 3600000),
      gen('yest', '昨天的', NOW - DAY - 3600000),
      gen('earlier', '本月更早', new Date(2026, 6, 3).getTime()),
      gen('lastmonth', '上月的', new Date(2026, 5, 15).getTime()),
      gen('older', '去年的', new Date(2025, 11, 1).getTime()),
    ])
    const groups = groupConversationsByDate(convs, NOW)
    const labels = groups.map((g) => g.label)
    expect(labels).toContain('今天')
    expect(labels).toContain('昨天')
    expect(labels).toContain('本月更早')
    expect(labels).toContain('6月')             // 同年上月只显示"6月"
    expect(labels).toContain('2025年12月')       // 跨年带年份
  })

  it('组间顺序:今天在最前,更早月份在后', () => {
    const convs = deriveConversations([
      gen('older', '去年', new Date(2025, 11, 1).getTime()),
      gen('today', '今天', NOW - 1000),
    ])
    const groups = groupConversationsByDate(convs, NOW)
    expect(groups[0].label).toBe('今天')
    expect(groups[groups.length - 1].label).toBe('2025年12月')
  })

  it('今天分组内多个会话按最近倒序', () => {
    const convs = deriveConversations([
      gen('a', 'A', NOW - 5000),
      gen('b', 'B', NOW - 1000),
    ])
    const groups = groupConversationsByDate(convs, NOW)
    const today = groups.find((g) => g.label === '今天')
    expect(today.items[0].id).toBe('b')  // B 更近
  })
})
