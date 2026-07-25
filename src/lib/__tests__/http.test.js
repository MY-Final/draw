import { describe, it, expect, vi } from 'vitest'
import { combineAbortSignals, callApi } from '../http.js'

describe('callApi 取消语义', () => {
  it('用户 signal 中止时保留 AbortError，不误包装成 timeout', async () => {
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
