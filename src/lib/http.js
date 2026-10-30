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

// 接口路径统一拼装:用户常把 /v1 一起粘进 Base URL,这里两种写法都接受,
// 避免出现 /v1/v1/images/... 这种只在部分页面失败的隐蔽问题。
export function apiUrl(baseURL, path = '') {
  const base = String(baseURL || '').trim().replace(/\/+$/, '')
  if (!base) return ''
  const suffix = path ? (path.startsWith('/') ? path : `/${path}`) : ''
  return base.endsWith('/v1') ? `${base}${suffix}` : `${base}/v1${suffix}`
}

export function authHeaders(apiKey) {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
}

// 响应片段:接口没给图时留一份可读的诊断信息,避免整段响应进日志。
export function responseSnippet(value, limit = 2000) {
  try {
    const text = JSON.stringify(value)
    return text.length > limit ? `${text.slice(0, limit)}…(truncated)` : text
  } catch {
    return String(value)
  }
}

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
// 计时器必须覆盖到响应体读完;只包住 fetch 会在「响应头已回、body 卡住」时永久挂起。
export function withTimeout(signal, ms) {
  const timeoutMs = Number(ms)
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return { signal, dispose() {}, timedOut: () => false }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => {
    try { controller.abort(new DOMException('Timed out', 'TimeoutError')) } catch { controller.abort() }
  }, timeoutMs)
  return {
    signal: combineAbortSignals([signal, controller.signal]),
    dispose: () => clearTimeout(timer),
    timedOut: () => controller.signal.aborted,
  }
}

// 判断一个异常是否为超时(AbortSignal.timeout / 手工 abort 的 reason)。
export function isTimeoutError(e) {
  return e && e.name === 'TimeoutError'
}

function timeoutError(ms, e) {
  return new ApiError('timeout', tl('lib.http.timeout', { seconds: Math.round((Number(ms) || 0) / 1000) }), String(e))
}

export async function callApi(url, { apiKey, body, signal, timeoutMs } = {}) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData
  const timeout = withTimeout(signal, timeoutMs)
  try {
    let resp
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          // FormData 时不手动设 Content-Type,交给浏览器带 multipart boundary。
          ...(isForm ? {} : { 'Content-Type': 'application/json' }),
          ...authHeaders(apiKey),
        },
        body: isForm ? body : JSON.stringify(body),
        signal: timeout.signal,
      })
    } catch (e) {
      // 用户主动取消保留 AbortError 语义，交给生成服务收口为“已取消”。
      if (signal?.aborted) throw e
      if (timeout.timedOut() || isTimeoutError(e)) throw timeoutError(timeoutMs, e)
      // fetch 抛异常 = 网络层失败,浏览器不区分 CORS 与断网(安全策略),统一归类。
      throw new ApiError('network-or-cors', tl('lib.http.cors'), String(e))
    }

    if (resp.status === 401 || resp.status === 403) {
      throw new ApiError('auth', tl('lib.http.auth', { status: resp.status }))
    }
    if (!resp.ok) {
      let detail = ''
      try {
        detail = await resp.text()
      } catch { /* ignore:状态码已足够定位问题 */ }
      throw new ApiError('api', tl('lib.http.api', { status: resp.status }), detail.slice(0, 2000))
    }

    try {
      return await resp.json()
    } catch (e) {
      if (signal?.aborted) throw e
      if (timeout.timedOut() || isTimeoutError(e)) throw timeoutError(timeoutMs, e)
      throw new ApiError('api', tl('lib.http.invalidJson'), String(e))
    }
  } finally {
    timeout.dispose()
  }
}

// 把一张提取图片规整为 Blob。
//   kind='dataUrl' → 解码 base64;kind='url' → fetch 下载(design:拿到即落库,不依赖外链)。
export async function toBlob(image, signal) {
  if (image.kind === 'dataUrl') {
    try {
      return dataUrlToBlob(image.value)
    } catch (e) {
      throw new ApiError('api', tl('lib.http.invalidImageData'), String(e))
    }
  }
  // url:立即下载为 Blob;下载与 body 读取共用同一个超时。
  const timeout = withTimeout(signal, IMAGE_TIMEOUT_MS)
  try {
    const resp = await fetch(image.value, { signal: timeout.signal })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return await resp.blob()
  } catch (e) {
    // 外部 signal 表示用户主动取消，保留原始 AbortError 语义给上层收口。
    if (signal?.aborted) throw e
    if (timeout.timedOut() || isTimeoutError(e)) {
      throw new ApiError('timeout', tl('lib.http.imageTimeout', { seconds: IMAGE_TIMEOUT_MS / 1000 }), String(e))
    }
    throw new ApiError('network-or-cors', tl('lib.http.imageDownload'), String(e))
  } finally {
    timeout.dispose()
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
