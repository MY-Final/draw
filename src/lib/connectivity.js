// 连通性检查(Task 3.4)—— 发一个最小请求,把结果归类为可区分的原因。
import { callApi, ApiError } from './http.js'
import { PROTOCOL_CHAT } from './presets.js'

export async function checkConnectivity(preset) {
  if (!preset) return { ok: false, category: 'unknown', message: '未选择接口预设' }
  if (!preset.baseURL) return { ok: false, category: 'unknown', message: '缺少 baseURL' }
  if (!preset.apiKey) return { ok: false, category: 'auth', message: '缺少 API Key' }

  try {
    if (preset.protocol === PROTOCOL_CHAT) {
      await callApi(`${preset.baseURL}/v1/chat/completions`, {
        apiKey: preset.apiKey,
        body: { model: preset.model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 },
      })
    } else {
      await callApi(`${preset.baseURL}/v1/models`, { apiKey: preset.apiKey, body: undefined })
        .catch(async () => {
          // 有些接口 /v1/models 不支持 POST;退而发一个最小 images 请求探活。
          await callApi(`${preset.baseURL}/v1/images/generations`, {
            apiKey: preset.apiKey,
            body: { model: preset.model, prompt: 'ping', n: 1, size: '256x256' },
          })
        })
    }
    return { ok: true, category: 'ok', message: '连接成功' }
  } catch (e) {
    if (e instanceof ApiError) {
      return { ok: false, category: e.category, message: e.message, detail: e.detail }
    }
    return { ok: false, category: 'unknown', message: String(e?.message || e) }
  }
}
