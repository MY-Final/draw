import { describe, it, expect, vi } from 'vitest'
import { combineAbortSignals, callApi, apiUrl } from '../http.js'
import { tl } from '../../i18n/translate.js'

describe('callApi 请求生命周期', () => {
  it('生图请求不创建客户端超时，并原样使用用户 signal', async () => {
    const controller = new AbortController()
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout')
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      expect(options.signal).toBe(controller.signal)
      return { ok: true, status: 200, json: async () => ({ data: [] }) }
    }))

    await callApi('https://api.test/v1/images/generations', {
      body: { prompt: 'long-running image' },
      signal: controller.signal,
    })

    expect(timeoutSpy).not.toHaveBeenCalled()
    timeoutSpy.mockRestore()
  })

  it('用户 signal 中止时保留 AbortError', async () => {
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))

    const request = callApi('https://api.test/v1/images/generations', {
      body: { prompt: 'x' },
      signal: controller.signal,
    })
    controller.abort()

    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('combineAbortSignals fallback', () => {
  it('AbortSignal.any 不可用时仍响应用户取消', () => {
    const originalAny = AbortSignal.any
    Object.defineProperty(AbortSignal, 'any', { value: undefined, configurable: true })
    try {
      const user = new AbortController()
      const timeout = new AbortController()
      const combined = combineAbortSignals([user.signal, timeout.signal])

      user.abort('user-cancel')

      expect(combined.aborted).toBe(true)
      expect(combined.reason).toBe('user-cancel')
    } finally {
      Object.defineProperty(AbortSignal, 'any', { value: originalAny, configurable: true })
    }
  })

  it('fallback 中任意后续 signal 中止都能转发', () => {
    const originalAny = AbortSignal.any
    Object.defineProperty(AbortSignal, 'any', { value: undefined, configurable: true })
    try {
      const user = new AbortController()
      const timeout = new AbortController()
      const combined = combineAbortSignals([user.signal, timeout.signal])

      timeout.abort(new DOMException('Timed out', 'TimeoutError'))

      expect(combined.aborted).toBe(true)
      expect(combined.reason?.name).toBe('TimeoutError')
    } finally {
      Object.defineProperty(AbortSignal, 'any', { value: originalAny, configurable: true })
    }
  })

  it('只有一个 signal 时直接复用', () => {
    const controller = new AbortController()
    expect(combineAbortSignals([null, controller.signal])).toBe(controller.signal)
  })
})

describe('callApi 请求超时', () => {
  it('超时归类为 timeout,不误报为用户取消', async () => {
    vi.stubGlobal('fetch', vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason || new DOMException('Timed out', 'TimeoutError')))
    })))

    await expect(callApi('https://api.test/v1/images/generations', {
      body: { prompt: 'slow' }, timeoutMs: 5,
    })).rejects.toMatchObject({ category: 'timeout' })
  })

  it('用户取消仍保留 AbortError', async () => {
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))
    const request = callApi('https://api.test/v1/images/generations', {
      body: { prompt: 'cancel' }, signal: controller.signal, timeoutMs: 1000,
    })
    controller.abort()
    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('超时覆盖响应体读取:响应头已回但 body 卡住时也会中止', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url, { signal }) => ({
      ok: true,
      status: 200,
      json: () => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      }),
    })))

    await expect(callApi('https://api.test/v1/images/generations', {
      body: { prompt: 'slow body' }, timeoutMs: 5,
    })).rejects.toMatchObject({ category: 'timeout' })
  })

  it('响应不是 JSON 时归类为 api,而不是网络错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected token <') },
    })))

    await expect(callApi('https://api.test/v1/images/generations', {
      body: { prompt: 'html body' },
    })).rejects.toMatchObject({
      name: 'ApiError', category: 'api', message: tl('lib.http.invalidJson'),
    })
  })
})

describe('apiUrl 路径拼装', () => {
  it('裸域名补 /v1,带 /v1 的 Base URL 不重复拼接', () => {
    expect(apiUrl('https://api.test')).toBe('https://api.test/v1')
    expect(apiUrl('https://api.test/')).toBe('https://api.test/v1')
    expect(apiUrl('https://api.test/v1')).toBe('https://api.test/v1')
    expect(apiUrl('https://api.test/v1/')).toBe('https://api.test/v1')
  })

  it('拼接具体端点时统一处理斜杠', () => {
    expect(apiUrl('https://api.test', '/images/generations')).toBe('https://api.test/v1/images/generations')
    expect(apiUrl('https://api.test/v1', 'images/edits')).toBe('https://api.test/v1/images/edits')
    expect(apiUrl('  https://api.test/proxy/  ', '/models')).toBe('https://api.test/proxy/v1/models')
  })

  it('空 Base URL 返回空串', () => {
    expect(apiUrl('')).toBe('')
    expect(apiUrl(null)).toBe('')
    expect(apiUrl(undefined, '/models')).toBe('')
  })
})
