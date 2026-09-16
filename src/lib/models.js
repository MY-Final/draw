// 模型发现:读取 OpenAI 兼容接口的 GET /v1/models,只返回可用于下拉选择的 id。
// 失败时保留分类,让设置页同时支持明确提示与手动填写。

import { tl } from '../i18n/translate.js'

export const MODEL_LIST_TIMEOUT_MS = 15000

export class ModelListError extends Error {
  constructor(category, message, detail = null) {
    super(message)
    this.name = 'ModelListError'
    this.category = category
    this.detail = detail
  }
}

export function modelsUrl(baseURL) {
  const base = String(baseURL || '').trim().replace(/\/+$/, '')
  if (!base) return ''
  return base.endsWith('/v1') ? `${base}/models` : `${base}/v1/models`
}

function authHeader(apiKey) {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
}

function timeoutSignal(ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    try { controller.abort(new DOMException('Timed out', 'TimeoutError')) } catch { controller.abort() }
  }, ms)
  return { signal: controller.signal, dispose: () => clearTimeout(timer), controller }
}

function isTimeout(error) {
  return error?.name === 'TimeoutError'
}

function modelId(item) {
  if (typeof item === 'string') return item.trim()
  if (!item || typeof item !== 'object') return ''
  return String(item.id || item.model || '').trim()
}

export async function fetchModels({ baseURL, apiKey = '', timeoutMs = MODEL_LIST_TIMEOUT_MS } = {}) {
  const url = modelsUrl(baseURL)
  if (!url) throw new ModelListError('unknown', tl('lib.models.needBaseURL'))

  const timeout = timeoutSignal(Math.max(1000, Number(timeoutMs) || MODEL_LIST_TIMEOUT_MS))
  let response
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: authHeader(apiKey),
      signal: timeout.signal,
    })
  } catch (error) {
    if (isTimeout(error)) {
      throw new ModelListError('timeout', tl('lib.models.timeout', { seconds: Math.round((Number(timeoutMs) || MODEL_LIST_TIMEOUT_MS) / 1000) }), String(error))
    }
    throw new ModelListError('network-or-cors', tl('lib.models.cors'), String(error))
  } finally {
    timeout.dispose()
  }

  if (response.status === 401 || response.status === 403) {
    throw new ModelListError('auth', tl('lib.models.auth', { status: response.status }))
  }
  if (!response.ok) {
    let detail = ''
    try { detail = await response.text() } catch { /* ignore */ }
    throw new ModelListError('api', tl('lib.models.api', { status: response.status }), detail.slice(0, 1000))
  }

  let payload
  try {
    payload = await response.json()
  } catch (error) {
    throw new ModelListError('api', tl('lib.models.invalidJson'), String(error))
  }

  const raw = Array.isArray(payload) ? payload : (payload?.data || payload?.models)
  if (!Array.isArray(raw)) {
    throw new ModelListError('api', tl('lib.models.missingData'))
  }
  const models = [...new Set(raw.map(modelId).filter(Boolean))]
  return { models, url }
}
