import { openDB } from 'idb'

// IndexedDB schema — 见 design D2:图字节(assets)与生成元数据(generations)分离,
// 以稳定 id 相互引用。同一张图只存一份 Blob,可被多条 generation 引用。

export const DB_NAME = 'ai-drawing-workbench'
export const DB_VERSION = 3
export const STORE_ASSETS = 'assets'
export const STORE_ASSET_BLOBS = 'assetBlobs'
export const STORE_GENERATIONS = 'generations'
export const STORE_WORKSPACES = 'workspaces'

let dbPromise = null

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        if (!db.objectStoreNames.contains(STORE_ASSETS)) {
          const assets = db.createObjectStore(STORE_ASSETS, { keyPath: 'id' })
          assets.createIndex('createdAt', 'createdAt')
        }
        if (!db.objectStoreNames.contains(STORE_ASSET_BLOBS)) {
          db.createObjectStore(STORE_ASSET_BLOBS, { keyPath: 'id' })
        }
        if (oldVersion < 3) {
          // v2 将 Blob 与元数据写在同一条记录，升级时迁移到独立对象仓库。
          const assets = transaction.objectStore(STORE_ASSETS)
          const blobs = transaction.objectStore(STORE_ASSET_BLOBS)
          assets.openCursor().onsuccess = (event) => {
            const cursor = event.target.result
            if (!cursor) return
            const { blob, ...metadata } = cursor.value
            if (blob) blobs.put({ id: metadata.id, blob })
            cursor.update(metadata)
            cursor.continue()
          }
        }
        if (!db.objectStoreNames.contains(STORE_GENERATIONS)) {
          const gens = db.createObjectStore(STORE_GENERATIONS, { keyPath: 'id' })
          gens.createIndex('createdAt', 'createdAt')
        }
        if (oldVersion < 2 || !db.objectStoreNames.contains(STORE_WORKSPACES)) {
          db.createObjectStore(STORE_WORKSPACES, { keyPath: 'id' })
        }
      },
    })
  }
  return dbPromise
}

// 简单的唯一 id:时间戳 + 随机段。无需强加密强度,仅需库内唯一。
export function newId(prefix = 'id') {
  const rand = Math.random().toString(36).slice(2, 10)
  return `${prefix}_${Date.now().toString(36)}_${rand}`
}
