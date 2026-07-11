import { describe, it, expect } from 'vitest'
import { collectDeletableOutputs } from './deletion.js'

// gen 工厂:{ id, outputImageIds, refImageIds }
function gen(id, outputs = [], refs = []) {
  return { id, outputImageIds: outputs, refImageIds: refs }
}
function asset(id, favorite = false) {
  return { id, favorite }
}

describe('collectDeletableOutputs', () => {
  it('未收藏且无引用 → 连带删', () => {
    const generations = [gen('g1', ['img1'])]
    const assets = [asset('img1', false)]
    const out = collectDeletableOutputs({ deletingGenIds: ['g1'], generations, assets })
    expect(out).toEqual(['img1'])
  })

  it('已收藏 → 保留', () => {
    const generations = [gen('g1', ['img1'])]
    const assets = [asset('img1', true)]
    const out = collectDeletableOutputs({ deletingGenIds: ['g1'], generations, assets })
    expect(out).toEqual([])
  })

  it('被存活记录当参考图引用 → 保留(避免裂图)', () => {
    const generations = [
      gen('g1', ['img1']),          // 要删
      gen('g2', ['img2'], ['img1']), // 存活,引用 img1 作参考
    ]
    const assets = [asset('img1', false), asset('img2', false)]
    const out = collectDeletableOutputs({ deletingGenIds: ['g1'], generations, assets })
    expect(out).toEqual([])
  })

  it('引用它的记录也一起被删 → 可删', () => {
    const generations = [
      gen('g1', ['img1']),
      gen('g2', ['img2'], ['img1']),
    ]
    const assets = [asset('img1', false), asset('img2', false)]
    // 两条都删:img1 不再被任何存活记录引用
    const out = collectDeletableOutputs({ deletingGenIds: ['g1', 'g2'], generations, assets })
    expect(out.sort()).toEqual(['img1', 'img2'])
  })

  it('参考图不参与连带删除', () => {
    // g1 只把 imgRef 当参考图,没有产出;删 g1 不应删 imgRef
    const generations = [gen('g1', [], ['imgRef'])]
    const assets = [asset('imgRef', false)]
    const out = collectDeletableOutputs({ deletingGenIds: ['g1'], generations, assets })
    expect(out).toEqual([])
  })

  it('接受 Set 作为 deletingGenIds', () => {
    const generations = [gen('g1', ['img1'])]
    const assets = [asset('img1', false)]
    const out = collectDeletableOutputs({ deletingGenIds: new Set(['g1']), generations, assets })
    expect(out).toEqual(['img1'])
  })
})
