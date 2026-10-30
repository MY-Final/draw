// 连通性检查 —— 只探活,不触发计费生成。
// 用 GET /v1/models(官方约定);失败时如实归类,不再回退到 images/generations。
import { MODEL_LIST_TIMEOUT_MS, modelsUrl } from './models.js'
import { authHeaders, withTimeout, isTimeoutError } from './http.js'
import { tl } from '../i18n/translate.js'

// 探活与拉模型列表打的是同一个端点,超时也共用同一个上限。
const PING_TIMEOUT_MS = MODEL_LIST_TIMEOUT_MS

export async function checkConnectivity(preset) {
  if (!preset) return { ok: false, category: 'unknown', message: tl('lib.connectivity.noPreset') }
  if (!preset.baseURL) return { ok: false, category: 'unknown', message: tl('lib.connectivity.missingBaseURL') }
  if (!preset.apiKey) return { ok: false, category: 'auth', message: tl('lib.connectivity.missingKey') }

  const url = modelsUrl(preset.baseURL)
  if (!url) return { ok: false, category: 'unknown', message: tl('lib.connectivity.missingBaseURL') }

  const timeout = withTimeout(null, PING_TIMEOUT_MS)
  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: authHeaders(preset.apiKey),
      signal: timeout.signal,
    })

    if (resp.status === 401 || resp.status === 403) {
      return {
        ok: false,
        category: 'auth',
        message: tl('lib.connectivity.auth', { status: resp.status }),
      }
    }
    if (!resp.ok) {
      let detail = ''
      try {
        detail = await resp.text()
      } catch (error) {
        // 读不到错误体不影响「接口返回了非 2xx」这一判断;超时则交给外层。
        if (isTimeoutError(error) || timeout.timedOut()) throw error
      }
      // 部分中转站没有 /v1/models,返回 404/405 —— 记为接口错误,绝不回退到真生成。
      return {
        ok: false,
        category: 'api',
        message: tl('lib.connectivity.api', { status: resp.status }),
        detail: detail.slice(0, 500),
      }
    }

    return { ok: true, category: 'ok', message: tl('lib.connectivity.ok') }
  } catch (e) {
    if (isTimeoutError(e) || timeout.timedOut()) {
      return {
        ok: false,
        category: 'timeout',
        message: tl('lib.connectivity.timeout', { seconds: PING_TIMEOUT_MS / 1000 }),
        detail: String(e),
      }
    }
    return {
      ok: false,
      category: 'network-or-cors',
      message: tl('lib.connectivity.cors'),
      detail: String(e),
    }
  } finally {
    timeout.dispose()
  }
}
