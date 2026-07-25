import { describe, it, expect } from 'vitest'
import { uploadInOrder } from '../referenceUploads.js'

describe('uploadInOrder', () => {
  it('异步上传耗时不同也严格保持输入顺序', async () => {
    const completed = []
    const delays = { first: 20, second: 1, third: 5 }

    const results = await uploadInOrder(['first', 'second', 'third'], async (item) => {
      await new Promise((resolve) => setTimeout(resolve, delays[item]))
      completed.push(item)
      return `${item}-asset`
    })

    expect(completed).toEqual(['first', 'second', 'third'])
    expect(results).toEqual(['first-asset', 'second-asset', 'third-asset'])
  })
})
