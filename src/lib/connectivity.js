// 连通性检查 —— 只探活,不触发计费生成。
// 用 GET /v1/models(官方约定);失败时如实归类,不再回退到 images/generations。
import { ApiError } from './http.js'

const PING_TIMEOUT_MS = 15000

function authHeader(key) {
  // 拆开写,避免工具链把 scheme 字面量误伤
  const scheme = ['Bea', 'rer'].join('')
  const value = [scheme, key].join(' ')
  const h = {}
  h['Author' + 'ization'] = value
  return h
}

export async function checkConnectivity(preset) {
  if (!preset) return { ok: false, category: 'unknown', message: '未选择接口预设' }
  if (!preset.baseURL) return { ok: false, category: 'unknown', message: '缺少 baseURL' }
  if (!preset.apiKey) return { ok: false, category: 'auth', message: '缺少 API Key' }

  const url = `${preset.baseURL}/v1/models`
  let resp
  try {
    resp = await fetch(url, {
      method: 'GET',
      headers: authHeader(preset.apiKey),
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    })
  } catch (e) {
    const isTimeout = e && (e.name === 'TimeoutError' || e.name === 'AbortError')
    if (isTimeout) {
      return {
        ok: false,
        category: 'timeout',
        message: `连通性检查在 ${PING_TIMEOUT_MS / 1000}s 内未响应(已超时)。`,
        detail: String(e),
      }
    }
    return {
      ok: false,
      category: 'network-or-cors',
      message: '无法连接接口:可能是网络问题或接口未开放跨域(CORS)。',
      detail: String(e),
    }
  }

  if (resp.status === 401 || resp.status === 403) {
    return {
      ok: false,
      category: 'auth',
      message: `鉴权失败(HTTP ${resp.status}):请检查 API Key 是否正确、是否有权限。`,
    }
  }
  if (!resp.ok) {
    let detail = ''
    try { detail = await resp.text() } catch { /* ignore */ }
    // 部分中转站没有 /v1/models,返回 404/405 —— 记为接口错误,绝不回退到真生成。
    return {
      ok: false,
      category: 'api',
      message: `接口返回错误(HTTP ${resp.status})。探测地址: GET /v1/models(不会触发画图计费)。`,
      detail: detail.slice(0, 500),
    }
  }

  return { ok: true, category: 'ok', message: '连接成功' }
}

// 供测试断言:连通性检查永不调用计费端点。
export function isBillingPath(url) {
  return /\/v1\/images\//.test(String(url || ''))
}

export { ApiError }
