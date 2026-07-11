// ObjectURL 管理(design D5)—— 显示 Blob 统一走 URL.createObjectURL,
// 并集中登记以便释放,避免长时间运行泄漏内存。
//
// 用法:
//   const url = acquireUrl(assetId, blob)   // 幂等:同 id 复用同一 url
//   releaseUrl(assetId)                      // 删除 asset 或卸载组件时释放

const cache = new Map() // id -> { url, refs }

export function acquireUrl(id, blob) {
  const existing = cache.get(id)
  if (existing) {
    existing.refs += 1
    return existing.url
  }
  const url = URL.createObjectURL(blob)
  cache.set(id, { url, refs: 1 })
  return url
}

export function releaseUrl(id) {
  const entry = cache.get(id)
  if (!entry) return
  entry.refs -= 1
  if (entry.refs <= 0) {
    URL.revokeObjectURL(entry.url)
    cache.delete(id)
  }
}

export function releaseAll() {
  for (const { url } of cache.values()) {
    URL.revokeObjectURL(url)
  }
  cache.clear()
}
