// Prompt 文本模板库(localStorage 持久化)。
// 独立于 generations,纯文本,不涉 Blob。

const STORAGE_KEY = 'workbench.savedPrompts'

/** @returns {{ id: string, text: string, createdAt: number }[]} */
export function loadPrompts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function savePrompts(prompts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts))
}

/** 添加 prompt;若 text 已存在返回 { ok: false, reason: 'duplicate' } */
export function addPrompt(text) {
  const t = (text || '').trim()
  if (!t) return { ok: false, reason: 'empty' }
  const prompts = loadPrompts()
  if (prompts.some((p) => p.text === t)) return { ok: false, reason: 'duplicate' }
  const entry = { id: crypto.randomUUID(), text: t, createdAt: Date.now() }
  prompts.push(entry)
  savePrompts(prompts)
  return { ok: true, entry }
}

export function removePrompt(id) {
  const prompts = loadPrompts().filter((p) => p.id !== id)
  savePrompts(prompts)
}

/** 返回所有 prompt,按创建时间倒序 */
export function getAllPrompts() {
  return loadPrompts().sort((a, b) => b.createdAt - a.createdAt)
}
