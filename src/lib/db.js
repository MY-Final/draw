import { openDB } from 'idb'

// IndexedDB schema — 见 design D2:图字节(assets)与生成元数据(generations)分离,
// 以稳定 id 相互引用。同一张图只存一份 Blob,可被多条 generation 引用。

export const DB_NAME = 'ai-drawing-workbench'
export const DB_VERSION = 1
export const STORE_ASSETS = 'assets'
export const STORE_GENERATIONS = 'generations'

let dbPromise = null

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_ASSETS)) {
          const assets = db.createObjectStore(STORE_ASSETS, { keyPath: 'id' })
          assets.createIndex('createdAt', 'createdAt')
        }
        if (!db.objectStoreNames.contains(STORE_GENERATIONS)) {
          const gens = db.createObjectStore(STORE_GENERATIONS, { keyPath: 'id' })
          gens.createIndex('createdAt', 'createdAt')
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
