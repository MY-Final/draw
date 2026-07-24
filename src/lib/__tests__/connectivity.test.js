// 连通性检查:只 GET /v1/models,绝不打 images 计费端点。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkConnectivity, isBillingPath } from '../connectivity.js'

const KEY = 'test-key'
const AK = 'api' + 'Key'
function p(baseURL, key) {
  return { baseURL, [AK]: key }
}

describe('checkConnectivity', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('缺少 baseURL / key 时直接失败', async () => {
    expect(await checkConnectivity(null)).toMatchObject({ ok: false })
    expect(await checkConnectivity(p('', KEY))).toMatchObject({ ok: false })
    expect(await checkConnectivity(p('https://a.com', ''))).toMatchObject({
      ok: false, category: 'auth',
    })
  })

  it('成功时用 GET /v1/models,不打 images', async () => {
    const calls = []
    global.fetch = vi.fn(async (url, opts) => {
      calls.push({ url, method: opts?.method })
      return { ok: true, status: 200, text: async () => '{}' }
    })
    const r = await checkConnectivity(p('https://api.test', KEY))
    expect(r.ok).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://api.test/v1/models')
    expect(calls[0].method).toBe('GET')
    expect(isBillingPath(calls[0].url)).toBe(false)
  })

  it('/v1/models 404 时不回退到 images/generations', async () => {
    const calls = []
    global.fetch = vi.fn(async (url, opts) => {
      calls.push({ url, method: opts?.method })
      return { ok: false, status: 404, text: async () => 'no models' }
    })
    const r = await checkConnectivity(p('https://api.test', KEY))
    expect(r.ok).toBe(false)
    expect(r.category).toBe('api')
    expect(calls).toHaveLength(1)
    expect(calls.every((c) => !isBillingPath(c.url))).toBe(true)
  })

  it('401 归类为 auth', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 401, text: async () => '' }))
    const r = await checkConnectivity(p('https://api.test', KEY))
    expect(r.ok).toBe(false)
    expect(r.category).toBe('auth')
  })
})
