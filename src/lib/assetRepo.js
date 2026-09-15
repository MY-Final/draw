import { getDB, newId, STORE_ASSETS, STORE_ASSET_BLOBS } from './db.js'

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
  const { blob: assetBlob, ...metadata } = record
  const tx = db.transaction([STORE_ASSETS, STORE_ASSET_BLOBS], 'readwrite')
  await Promise.all([
    tx.objectStore(STORE_ASSETS).put(metadata),
    tx.objectStore(STORE_ASSET_BLOBS).put({ id: record.id, blob: assetBlob }),
  ])
  await tx.done
  return record
}

export async function getAsset(id) {
  const db = await getDB()
  const tx = db.transaction([STORE_ASSETS, STORE_ASSET_BLOBS], 'readonly')
  const [metadata, blobRecord] = await Promise.all([
    tx.objectStore(STORE_ASSETS).get(id),
    tx.objectStore(STORE_ASSET_BLOBS).get(id),
  ])
  await tx.done
  if (!metadata) return undefined
  return { ...metadata, blob: blobRecord?.blob || metadata.blob || null }
}

export async function getAssets(ids) {
  const db = await getDB()
  const tx = db.transaction([STORE_ASSETS, STORE_ASSET_BLOBS], 'readonly')
  const results = await Promise.all(ids.map(async (id) => {
    const [metadata, blobRecord] = await Promise.all([
      tx.objectStore(STORE_ASSETS).get(id),
      tx.objectStore(STORE_ASSET_BLOBS).get(id),
    ])
    return metadata ? { ...metadata, blob: blobRecord?.blob || metadata.blob || null } : null
  }))
  await tx.done
  return results.filter(Boolean)
}

export async function listAssets() {
  const db = await getDB()
  // 按 createdAt 倒序(最新在前)
  const all = await db.getAllFromIndex(STORE_ASSETS, 'createdAt')
  return all.reverse().map(({ blob: _legacyBlob, ...metadata }) => metadata)
}

// 按需读取图片字节。素材列表只返回元数据，避免首屏读取所有 Blob。
export async function getAssetBlob(id) {
  const db = await getDB()
  const [blobRecord, legacy] = await Promise.all([
    db.get(STORE_ASSET_BLOBS, id),
    db.get(STORE_ASSETS, id),
  ])
  return blobRecord?.blob || legacy?.blob || null
}

export async function deleteAsset(id) {
  const db = await getDB()
  const tx = db.transaction([STORE_ASSETS, STORE_ASSET_BLOBS], 'readwrite')
  await Promise.all([
    tx.objectStore(STORE_ASSETS).delete(id),
    tx.objectStore(STORE_ASSET_BLOBS).delete(id),
  ])
  await tx.done
}

export async function deleteAssets(ids) {
  const db = await getDB()
  const tx = db.transaction([STORE_ASSETS, STORE_ASSET_BLOBS], 'readwrite')
  await Promise.all(ids.flatMap((id) => [
    tx.objectStore(STORE_ASSETS).delete(id),
    tx.objectStore(STORE_ASSET_BLOBS).delete(id),
  ]))
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

// 清空全部素材;是否保留生成记录由 store 负责。
export async function clearAllAssets() {
  const db = await getDB()
  const tx = db.transaction([STORE_ASSETS, STORE_ASSET_BLOBS], 'readwrite')
  await Promise.all([
    tx.objectStore(STORE_ASSETS).clear(),
    tx.objectStore(STORE_ASSET_BLOBS).clear(),
  ])
  await tx.done
}
