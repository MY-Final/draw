import { getDB, newId, STORE_GENERATIONS } from './db.js'

// Generation 仓库 —— 一次生成事件(见 design D2)。
// 记录:{ id, createdAt, prompt, refImageIds[], params{model,protocol,size,n,...},
//        outputImageIds[], status, error?, rawResponseSnippet? }
//   status: 'pending' | 'success' | 'failed' | 'empty'
//   无会话状态(方案 A):refImageIds 只是本次选中的参考图,不含历史上下文。

// generation 记录是纯元数据(无 Blob),存库前 plain-clone,剥掉 Vue 响应式 Proxy /
// 其他不可结构化克隆的包装 —— 否则 IndexedDB.put 会报 "could not be cloned"。
function toPlain(value) {
  return JSON.parse(JSON.stringify(value))
}

export async function createGeneration({ prompt, refImageIds = [], params = {}, statusMessage, workspaceId }) {
  const db = await getDB()
  const record = toPlain({
    id: newId('gen'),
    createdAt: Date.now(),
    prompt,
    refImageIds,
    params,
    workspaceId: workspaceId || null,
    statusMessage,
    outputImageIds: [],
    status: 'pending',
    error: null,
    rawResponseSnippet: null,
  })
  await db.put(STORE_GENERATIONS, record)
  return record
}

export async function updateGeneration(id, patch) {
  const db = await getDB()
  const existing = await db.get(STORE_GENERATIONS, id)
  if (!existing) throw new Error(`generation not found: ${id}`)
  const updated = toPlain({ ...existing, ...patch })
  await db.put(STORE_GENERATIONS, updated)
  return updated
}

export async function getGeneration(id) {
  const db = await getDB()
  return db.get(STORE_GENERATIONS, id)
}

export async function listGenerations() {
  const db = await getDB()
  const all = await db.getAllFromIndex(STORE_GENERATIONS, 'createdAt')
  return all.reverse()
}

export async function deleteGeneration(id) {
  const db = await getDB()
  await db.delete(STORE_GENERATIONS, id)
}

// 批量删除生成记录(删会话 / 清空全部)。
export async function deleteGenerations(ids) {
  const db = await getDB()
  const tx = db.transaction(STORE_GENERATIONS, 'readwrite')
  await Promise.all(ids.map((id) => tx.store.delete(id)))
  await tx.done
}

// 清空全部生成记录(清空全部;素材另行清空)。
export async function clearAllGenerations() {
  const db = await getDB()
  await db.clear(STORE_GENERATIONS)
}

// 保存整条记录(用于 zip 导入回填)。
export async function putGenerationRecord(record) {
  const db = await getDB()
  await db.put(STORE_GENERATIONS, toPlain(record))
  return record
}
