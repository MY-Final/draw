// 协议自动探测:先试 images,接口层错误再试 chat。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { detectProtocol, checkConnectivity } from '../connectivity.js'

const preset = (over = {}) => ({ baseURL: 'https://api.test', apiKey: 'sk-x', model: 'm', ...over })

describe('detectProtocol', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('images 端点通 → 判定 images', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [] }), text: async () => '{}' }))
    expect(await detectProtocol(preset())).toBe('images')
  })

  it('images 返回接口错误、chat 通 → 判定 chat', async () => {
    global.fetch = vi.fn(async (url) => {
      if (url.includes('/images/generations')) {
        return { ok: false, status: 400, json: async () => ({}), text: async () => 'model does not support images' }
      }
      return { ok: true, status: 200, json: async () => ({ choices: [] }), text: async () => '{}' }
    })
    expect(await detectProtocol(preset())).toBe('chat')
  })

  it('鉴权失败不误判协议,直接抛错', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}), text: async () => 'unauthorized' }))
    await expect(detectProtocol(preset())).rejects.toBeTruthy()
  })
})

describe('checkConnectivity 自动探测回传 protocol', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('未锁定协议(auto)时返回识别出的 protocol', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [] }), text: async () => '{}' }))
    const r = await checkConnectivity(preset({ protocol: 'auto' }))
    expect(r.ok).toBe(true)
    expect(r.protocol).toBe('images')
  })

  it('缺 Key 直接判鉴权失败', async () => {
    const r = await checkConnectivity(preset({ protocol: 'auto', apiKey: '' }))
    expect(r.ok).toBe(false)
    expect(r.category).toBe('auth')
  })
})
