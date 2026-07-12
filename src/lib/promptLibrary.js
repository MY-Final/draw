// Prompt 文本模板库(localStorage 持久化)。
// 独立于 generations,纯文本,不涉 Blob。
// 按工作区隔离:key = workbench.savedPrompts.<workspaceId>

const KEY_PREFIX = 'workbench.savedPrompts'

function storageKey(workspaceId) {
  return workspaceId ? `${KEY_PREFIX}.${workspaceId}` : KEY_PREFIX
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

/** 返回所有 prompt,按创建时间倒序 */
export function getAllPrompts(workspaceId) {
  return loadPrompts(workspaceId).sort((a, b) => b.createdAt - a.createdAt)
}

/** 迁移旧数据到指定工作区(幂等:key 已存在则跳过) */
export function migrateLegacyPrompts(workspaceId) {
  const newKey = storageKey(workspaceId)
  if (localStorage.getItem(newKey)) return // 已迁移
  const old = localStorage.getItem(KEY_PREFIX)
  if (old) {
    localStorage.setItem(newKey, old)
    // 保留旧 key 供回退,暂不删除
  }
}
