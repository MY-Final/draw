import { getDB, newId, STORE_ASSETS } from './db.js'

// Asset 仓库 —— 图片以 Blob 存储(design D5:不转 base64,避免 +33% 膨胀)。
// 每条 asset 记录:{ id, blob, mime, width, height, size, createdAt, source }
//   source: 'generated' | 'imported' | 'reference-uploaded'

export async function putAsset({
  blob, mime, width = null, height = null, source = 'generated',
  id = null, favorite = false, workspaceId = null, createdAt = null,
}) {
  const db = await getDB()
  // createdAt / favorite 可在导入时原样回填,避免备份往返丢失排序与收藏。
  const record = {
    id: id || newId('asset'),
    blob,
    mime: mime || blob.type || 'image/png',
    width,
    height,
    size: blob.size,
    createdAt: createdAt ?? Date.now(),
    source,
    favorite: !!favorite,
    workspaceId: workspaceId || null,
  }
  await db.put(STORE_ASSETS, record)
  return record
}

export async function getAsset(id) {
  const db = await getDB()
  return db.get(STORE_ASSETS, id)
}

export async function getAssets(ids) {
  const db = await getDB()
  const tx = db.transaction(STORE_ASSETS, 'readonly')
  const results = await Promise.all(ids.map((id) => tx.store.get(id)))
  await tx.done
  return results.filter(Boolean)
}

export async function listAssets() {
  const db = await getDB()
  // 按 createdAt 倒序(最新在前)
  const all = await db.getAllFromIndex(STORE_ASSETS, 'createdAt')
  return all.reverse()
}

export async function deleteAsset(id) {
  const db = await getDB()
  await db.delete(STORE_ASSETS, id)
}

export async function deleteAssets(ids) {
  const db = await getDB()
  const tx = db.transaction(STORE_ASSETS, 'readwrite')
  await Promise.all(ids.map((id) => tx.store.delete(id)))
  await tx.done
}

// 收藏切换(conversation-history change:asset.favorite 布尔字段)。
export async function toggleFavorite(id) {
  const db = await getDB()
  const a = await db.get(STORE_ASSETS, id)
  if (!a) return null
  a.favorite = !a.favorite
  await db.put(STORE_ASSETS, a)
  return a
}

// 业务用量:按 asset.size 累加(design D5:与浏览器 estimate 并列展示)。
export async function totalAssetBytes() {
  const db = await getDB()
  let total = 0
  let cursor = await db.transaction(STORE_ASSETS).store.openCursor()
  while (cursor) {
    total += cursor.value.size || 0
    cursor = await cursor.continue()
  }
  return total
}

export async function countAssets() {
  const db = await getDB()
  return db.count(STORE_ASSETS)
}

// 清空全部素材(清空全部;保留预设/Key,由 store 负责)。
export async function clearAllAssets() {
  const db = await getDB()
  await db.clear(STORE_ASSETS)
}
