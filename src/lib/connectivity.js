// 连通性检查 —— 发一个最小 images 请求,把结果归类为可区分的原因。
import { callApi, ApiError } from './http.js'

export async function checkConnectivity(preset) {
  if (!preset) return { ok: false, category: 'unknown', message: '未选择接口预设' }
  if (!preset.baseURL) return { ok: false, category: 'unknown', message: '缺少 baseURL' }
  if (!preset.apiKey) return { ok: false, category: 'auth', message: '缺少 API Key' }

  try {
    // 优先用 /v1/models 探活(便宜、不计费);不支持则退到最小 images 生成。
    await callApi(`${preset.baseURL}/v1/models`, { apiKey: preset.apiKey, body: undefined })
      .catch(async () => {
        await callApi(`${preset.baseURL}/v1/images/generations`, {
          apiKey: preset.apiKey,
          body: { model: preset.model, prompt: 'ping', n: 1, size: '256x256' },
        })
      })
    return { ok: true, category: 'ok', message: '连接成功' }
  } catch (e) {
    if (e instanceof ApiError) {
      return { ok: false, category: e.category, message: e.message, detail: e.detail }
    }
    return { ok: false, category: 'unknown', message: String(e?.message || e) }
  }
}
