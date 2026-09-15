// Prompt 文本模板库(localStorage 持久化)。
// 独立于 generations,纯文本,不涉 Blob。
// 按工作区隔离:key = workbench.savedPrompts.<workspaceId>

export const PROMPTS_KEY_PREFIX = 'workbench.savedPrompts'

function storageKey(workspaceId) {
  return workspaceId ? `${PROMPTS_KEY_PREFIX}.${workspaceId}` : PROMPTS_KEY_PREFIX
}

export function promptStorageKey(workspaceId) {
  return storageKey(workspaceId)
}

/** @returns {{ id: string, text: string, createdAt: number }[]} */
export function loadPrompts(workspaceId) {
  try {
    const raw = localStorage.getItem(storageKey(workspaceId))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function savePrompts(prompts, workspaceId) {
  localStorage.setItem(storageKey(workspaceId), JSON.stringify(prompts))
}

/** 添加 prompt;若 text 已存在返回 { ok: false, reason: 'duplicate' } */
export function addPrompt(text, workspaceId) {
  const t = (text || '').trim()
  if (!t) return { ok: false, reason: 'empty' }
  const prompts = loadPrompts(workspaceId)
  if (prompts.some((p) => p.text === t)) return { ok: false, reason: 'duplicate' }
  const entry = { id: crypto.randomUUID(), text: t, createdAt: Date.now() }
  prompts.push(entry)
  savePrompts(prompts, workspaceId)
  return { ok: true, entry }
}

export function removePrompt(id, workspaceId) {
  const prompts = loadPrompts(workspaceId).filter((p) => p.id !== id)
  savePrompts(prompts, workspaceId)
}

/** 改写已收藏的 prompt;文本重复(且不是自己)时拒绝,避免收藏夹里出现两份一样的。 */
export function updatePrompt(id, text, workspaceId) {
  const t = (text || '').trim()
  if (!t) return { ok: false, reason: 'empty' }
  const prompts = loadPrompts(workspaceId)
  const target = prompts.find((p) => p.id === id)
  if (!target) return { ok: false, reason: 'missing' }
  if (prompts.some((p) => p.id !== id && p.text === t)) return { ok: false, reason: 'duplicate' }
  target.text = t
  savePrompts(prompts, workspaceId)
  return { ok: true, entry: target }
}

/** 返回所有 prompt,按创建时间倒序 */
export function getAllPrompts(workspaceId) {
  return loadPrompts(workspaceId).sort((a, b) => b.createdAt - a.createdAt)
}

/** 迁移旧数据到指定工作区(幂等:key 已存在则跳过) */
export function migrateLegacyPrompts(workspaceId) {
  const newKey = storageKey(workspaceId)
  if (localStorage.getItem(newKey)) return // 已迁移
  const old = localStorage.getItem(PROMPTS_KEY_PREFIX)
  if (old) {
    localStorage.setItem(newKey, old)
    // 保留旧 key 供回退,暂不删除
  }
}
