// 删除时的连带删图判定 —— 纯函数,可测(asset-library: 引用感知的连带删除)。
//
// 规则(design D1):删除一批 generation 时,其产出图 outputImageIds 仅在
//   ① 未被收藏  且  ② 未被任何"删除后仍存活"的 generation 当参考图引用
// 时才可连带删除。参考图 refImageIds 永不参与连带删除。

// 收集要删的 generation 的产出图中,真正可以连带删除的 asset id。
//   deletingGenIds: Set|Array  —— 本次要删的 generation id
//   generations:    全部 generation(用于算存活集合与引用)
//   assets:         全部 asset(用于读 favorite)
// 返回可删除的 asset id 数组。
export function collectDeletableOutputs({ deletingGenIds, generations, assets }) {
  const deleting = deletingGenIds instanceof Set ? deletingGenIds : new Set(deletingGenIds)

  // 删除后仍存活的 generation
  const survivors = generations.filter((g) => !deleting.has(g.id))

  // 存活记录仍在引用的参考图(这些产出图不能删,否则别处裂图)
  const referenced = new Set()
  for (const g of survivors) {
    for (const id of g.refImageIds || []) referenced.add(id)
  }

  // 收藏集合
  const favorite = new Set()
  for (const a of assets) if (a.favorite) favorite.add(a.id)

  // 候选:被删记录的产出图
  const candidates = new Set()
  for (const g of generations) {
    if (!deleting.has(g.id)) continue
    for (const id of g.outputImageIds || []) candidates.add(id)
  }

  // 过滤:未收藏 且 未被引用
  const deletable = []
  for (const id of candidates) {
    if (favorite.has(id)) continue
    if (referenced.has(id)) continue
    deletable.push(id)
  }
  return deletable
}
