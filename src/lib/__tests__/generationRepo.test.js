// 回归测试:Vue 响应式 Proxy 数组进入 generation 记录时,IndexedDB.put 不再报
// "could not be cloned"(用户实测 bug)。用 reactive() 复现真实场景。
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { reactive, ref } from 'vue'

const store = new Map()
vi.stubGlobal('localStorage', {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
})

const { createGeneration, updateGeneration, getGeneration } = await import('../generationRepo.js')

describe('generation 记录剥离 Vue 响应式 Proxy', () => {
  beforeEach(() => store.clear())

  it('reactive 数组 / 对象作为参数不再触发克隆错误', async () => {
    const refIds = ref(['asset_a', 'asset_b']) // ref → .value 是 reactive Proxy 数组
    const params = reactive({ size: '1024x1024', n: 1 })

    // 复现路径:GenerationPanel 把 refImageIds.value(Proxy)传进来
    const gen = await createGeneration({
      prompt: '一只赛博猫',
      refImageIds: refIds.value,
      params,
    })

    // 存进去能取回,且是纯数据
    const back = await getGeneration(gen.id)
    expect(back.refImageIds).toEqual(['asset_a', 'asset_b'])
    expect(Array.isArray(back.refImageIds)).toBe(true)
    expect(back.params.size).toBe('1024x1024')
  })

  it('空 ref([]) 数组(纯文生图场景)也能存', async () => {
    const empty = ref([])
    const gen = await createGeneration({ prompt: 'x', refImageIds: empty.value, params: {} })
    const back = await getGeneration(gen.id)
    expect(back.refImageIds).toEqual([])
  })

  it('updateGeneration 合并 reactive patch 不报错', async () => {
    const gen = await createGeneration({ prompt: 'y', refImageIds: [], params: {} })
    const patch = reactive({ status: 'success', outputImageIds: ['out_1'] })
    const updated = await updateGeneration(gen.id, patch)
    expect(updated.status).toBe('success')
    expect(updated.outputImageIds).toEqual(['out_1'])
  })
})
