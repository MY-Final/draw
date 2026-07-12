import { getDB, newId, STORE_WORKSPACES } from './db.js'

export async function listWorkspaces() {
  const db = await getDB()
  const all = await db.getAll(STORE_WORKSPACES)
  return all.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getWorkspace(id) {
  const db = await getDB()
  return db.get(STORE_WORKSPACES, id)
}

export async function createWorkspace({ name, settings = {} }) {
  const db = await getDB()
  const now = Date.now()
  const record = { id: `ws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, name: name || '未命名工作区', createdAt: now, updatedAt: now, settings }
  await db.put(STORE_WORKSPACES, record)
  return record
}

export async function updateWorkspace(id, patch) {
  const db = await getDB()
  const existing = await db.get(STORE_WORKSPACES, id)
  if (!existing) throw new Error(`workspace not found: ${id}`)
  const updated = { ...existing, ...patch, updatedAt: Date.now() }
  await db.put(STORE_WORKSPACES, updated)
  return updated
}

export async function deleteWorkspace(id) {
  const db = await getDB()
  await db.delete(STORE_WORKSPACES, id)
}
