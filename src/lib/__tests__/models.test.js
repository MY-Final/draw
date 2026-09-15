import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchModels, modelsUrl } from '../models.js'

describe('fetchModels', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('使用 GET /v1/models 并返回去重后的模型 id', async () => {
    const fetchMock = vi.fn(async (_url, options) => {
      expect(options.method).toBe('GET')
      expect(options.headers.Authorization).toBe('Bearer test-key')
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: 'image-alpha' }, { id: 'image-alpha' }, { id: 'image-beta' }] }),
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchModels({ baseURL: 'https://api.test/', apiKey: 'test-key' })
    expect(result).toMatchObject({ models: ['image-alpha', 'image-beta'], url: 'https://api.test/v1/models' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('兼容用户填入带 /v1 的 Base URL', () => {
    expect(modelsUrl('https://api.test/v1/')).toBe('https://api.test/v1/models')
  })

  it('把 401 和接口错误归类,保留截断 detail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 500, text: async () => 'server detail',
    })))
    await expect(fetchModels({ baseURL: 'https://api.test' })).rejects.toMatchObject({
      name: 'ModelListError', category: 'api', detail: 'server detail',
    })
  })
})
