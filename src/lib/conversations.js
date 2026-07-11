// 会话(对话)派生与按日期分组 —— 纯函数,可测(conversation-history)。
// 会话不是独立的表:它从 generations 的 conversationId 聚合而来。
// 兼容旧记录:优先读 conversationId,回退到早期的 canvasId。

export function convIdOf(gen) {
  return gen?.params?.conversationId || gen?.params?.canvasId || null
}

// 会话标题手动覆盖表(design D4:localStorage 映射,不建表)。
const TITLES_KEY = 'workbench.convTitles'

export function loadTitleOverrides() {
  try { return JSON.parse(localStorage.getItem(TITLES_KEY) || '{}') || {} }
  catch { return {} }
}
export function saveTitleOverrides(map) {
  localStorage.setItem(TITLES_KEY, JSON.stringify(map || {}))
}

// 由生成列表派生会话列表。
//   overrides: { convId: 手动标题 } —— 手动重命名优先于派生的首句 prompt(design D4)。
//   返回 [{ id, title, createdAt, lastAt, count }],按 lastAt 倒序。
//   title 取该会话最早一条的 prompt(会话标题派生自首个 prompt)。
export function deriveConversations(generations, overrides = {}) {
  const map = new Map()
  for (const g of generations) {
    const id = convIdOf(g)
    if (!id) continue
    let c = map.get(id)
    if (!c) {
      c = { id, title: truncate(g.prompt), createdAt: g.createdAt, lastAt: g.createdAt, count: 0, _firstAt: g.createdAt }
      map.set(id, c)
    }
    c.count += 1
    if (g.createdAt < c.createdAt) c.createdAt = g.createdAt
    if (g.createdAt > c.lastAt) c.lastAt = g.createdAt
    // 标题 = 会话内最早一条的 prompt
    if (g.createdAt <= c._firstAt) { c._firstAt = g.createdAt; c.title = truncate(g.prompt) }
  }
  const list = [...map.values()].map(({ _firstAt, ...c }) => ({
    ...c,
    // 手动重命名优先;否则用派生标题;再否则占位
    title: overrides[c.id] || c.title || '未命名会话',
  }))
  return list.sort((a, b) => b.lastAt - a.lastAt)
}

function truncate(s, n = 24) {
  const t = (s || '').trim().replace(/\s+/g, ' ')
  return t.length > n ? t.slice(0, n) + '…' : t
}

// 按日期分组:今天 / 昨天 / 本月更早(按天)/ 更早(按月)。
//   now 传入以便测试;不传用当前时间。
export function groupConversationsByDate(conversations, now = Date.now()) {
  const nowD = new Date(now)
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const todayStart = startOfDay(nowD)
  const yesterdayStart = todayStart - 86400000
  const monthStart = new Date(nowD.getFullYear(), nowD.getMonth(), 1).getTime()

  const groups = []
  const ensure = (key, label, order) => {
    let g = groups.find((x) => x.key === key)
    if (!g) { g = { key, label, order, items: [] }; groups.push(g) }
    return g
  }

  for (const c of conversations) {
    const t = c.lastAt
    if (t >= todayStart) {
      ensure('today', '今天', 0).items.push(c)
    } else if (t >= yesterdayStart) {
      ensure('yesterday', '昨天', 1).items.push(c)
    } else if (t >= monthStart) {
      ensure('this-month', '本月更早', 2).items.push(c)
    } else {
      const d = new Date(t)
      const sameYear = d.getFullYear() === nowD.getFullYear()
      const label = sameYear ? `${d.getMonth() + 1}月` : `${d.getFullYear()}年${d.getMonth() + 1}月`
      const key = `m-${d.getFullYear()}-${d.getMonth()}`
      // order:更早月份排在后面,越近越靠前
      const order = 3 + (nowD.getFullYear() - d.getFullYear()) * 12 + (nowD.getMonth() - d.getMonth())
      ensure(key, label, order).items.push(c)
    }
  }
  // 组内已按 lastAt 倒序(conversations 本就倒序);组间按 order
  return groups.sort((a, b) => a.order - b.order)
}
