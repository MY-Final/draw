// 网络与图片规整工具。
//
// - callApi:统一的 fetch 封装,把失败归类为可区分的原因(design 风险:CORS/网络、鉴权、其他)。
// - toBlob:把提取到的 {kind,value} 图片统一拉取/解码为 Blob(design D4 收尾 + D 风险:
//   外链 url 立即下载落库,不长期依赖)。

import { tl } from '../i18n/translate.js'

export class ApiError extends Error {
  constructor(category, message, detail = null) {
    super(message)
    this.name = 'ApiError'
    this.category = category // 'network-or-cors' | 'auth' | 'api' | 'timeout' | 'reference' | 'unknown'
    this.detail = detail
  }
}

// 图片外链下载超时(ms):拿到 url 后下载不应长时间挂起。
// 生图 API 的请求超时由接口预设控制；图片外链下载仍固定 60 秒。
export const DEFAULT_REQUEST_TIMEOUT_MS = 180000
const IMAGE_TIMEOUT_MS = 60000

// 合并多个 AbortSignal:任一触发即中止。旧浏览器没有 AbortSignal.any 时手工转发，
// 不能丢掉用户主动取消的 signal。
export function combineAbortSignals(signals) {
  const active = signals.filter(Boolean)
  if (!active.length) return undefined
  if (active.length === 1) return active[0]
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(active)

  const controller = new AbortController()
  const listeners = new Map()
  const cleanup = () => {
    for (const [source, listener] of listeners) source.removeEventListener('abort', listener)
    listeners.clear()
  }
  const abortFrom = (source) => {
    if (controller.signal.aborted) return
    cleanup()
    try { controller.abort(source.reason) } catch { controller.abort() }
  }
  for (const source of active) {
    if (source.aborted) {
      abortFrom(source)
      break
    }
    const listener = () => abortFrom(source)
    listeners.set(source, listener)
    source.addEventListener('abort', listener, { once: true })
  }
  return controller.signal
}

// 合并外部 signal 与超时 signal:任一触发即中止。
function withTimeout(signal, ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    try { controller.abort(new DOMException('Timed out', 'TimeoutError')) } catch { controller.abort() }
  }, ms)
  const combined = combineAbortSignals([signal, controller.signal])
  return { signal: combined, dispose: () => clearTimeout(timer), timeoutSignal: controller.signal }
}

// 判断一个 fetch 异常是否为超时(AbortSignal.timeout 触发时 name 为 TimeoutError)。
function isTimeout(e) {
  return e && e.name === 'TimeoutError'
}

export async function callApi(url, { apiKey, body, signal, timeoutMs } = {}) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData
  const timeout = timeoutMs == null ? 0 : Number(timeoutMs)
  const timeoutController = new AbortController()
  const timer = Number.isFinite(timeout) && timeout > 0
    ? setTimeout(() => {
      try { timeoutController.abort(new DOMException('Timed out', 'TimeoutError')) } catch { timeoutController.abort() }
    }, timeout)
    : null
  const requestSignal = combineAbortSignals([signal, timeout > 0 ? timeoutController.signal : null])
  let resp
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        // FormData 时不手动设 Content-Type,交给浏览器带 multipart boundary。
        ...(isForm ? {} : { 'Content-Type': 'application/json' }),
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: isForm ? body : JSON.stringify(body),
      signal: requestSignal,
    })
  } catch (e) {
    if (timer) clearTimeout(timer)
    // 用户主动取消保留 AbortError 语义，交给生成服务收口为“已取消”。
    if (signal?.aborted) throw e
    if (timeoutController.signal.aborted || isTimeout(e)) {
      throw new ApiError('timeout', tl('lib.http.timeout', { seconds: Math.round(timeout / 1000) }), String(e))
    }
    // fetch 抛异常 = 网络层失败,浏览器不区分 CORS 与断网(安全策略),统一归类。
    throw new ApiError('network-or-cors', tl('lib.http.cors'), String(e))
  }
  if (timer) clearTimeout(timer)

  if (resp.status === 401 || resp.status === 403) {
    throw new ApiError('auth', tl('lib.http.auth', { status: resp.status }))
  }
  if (!resp.ok) {
    let detail = ''
    try {
      detail = await resp.text()
    } catch { /* ignore */ }
    throw new ApiError('api', tl('lib.http.api', { status: resp.status }), detail.slice(0, 2000))
  }

  return resp.json()
}

// 把一张提取图片规整为 Blob。
//   kind='dataUrl' → 解码 base64;kind='url' → fetch 下载(design:拿到即落库,不依赖外链)。
export async function toBlob(image, signal) {
  if (image.kind === 'dataUrl') {
    return dataUrlToBlob(image.value)
  }
  // url:立即下载为 Blob
  let timeout
  try {
    timeout = withTimeout(signal, IMAGE_TIMEOUT_MS)
    const resp = await fetch(image.value, { signal: timeout.signal })
    timeout.dispose()
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return await resp.blob()
  } catch (e) {
    timeout?.dispose()
    // 外部 signal 表示用户主动取消，保留原始 AbortError 语义给上层收口。
    if (signal?.aborted) throw e
    if (isTimeout(e)) {
      throw new ApiError('timeout', tl('lib.http.imageTimeout', { seconds: IMAGE_TIMEOUT_MS / 1000 }), String(e))
    }
    throw new ApiError('network-or-cors', tl('lib.http.imageDownload'), String(e))
  }
}

export function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(',')
  const mimeMatch = /data:([^;]+)/.exec(head)
  const mime = mimeMatch ? mimeMatch[1] : 'image/png'
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}
