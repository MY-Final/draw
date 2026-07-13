// 连通性检查 + 协议自动探测 —— 发最小请求,把结果归类为可区分的原因;
// 未锁定协议时顺带判定该接口应走 images 还是 chat,写回预设。
import { callApi, ApiError } from './http.js'
import { PROTOCOL_CHAT, PROTOCOL_IMAGES } from './presets.js'

// 最小 images 探活请求(尽量便宜:256x256、n=1)。
async function probeImages(preset) {
  await callApi(`${preset.baseURL}/v1/images/generations`, {
    apiKey: preset.apiKey,
    body: { model: preset.model, prompt: 'ping', n: 1, size: '256x256' },
  })
}
// 最小 chat 探活请求(max_tokens:1)。
async function probeChat(preset) {
  await callApi(`${preset.baseURL}/v1/chat/completions`, {
    apiKey: preset.apiKey,
    body: { model: preset.model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 },
  })
}

// 探测协议:先试 images,接口层错误(模型不认该端点)再试 chat。
// 返回 { protocol } 或抛 ApiError(鉴权/网络/超时等不应误判为协议问题)。
export async function detectProtocol(preset) {
  try {
    await probeImages(preset)
    return PROTOCOL_IMAGES
  } catch (e) {
    // 仅当是"接口/请求"类错误(如该模型不支持 images 端点)才尝试 chat;
    // 鉴权/网络/超时属于连接问题,直接上抛,不误判协议。
    if (e instanceof ApiError && e.category === 'api') {
      await probeChat(preset)
      return PROTOCOL_CHAT
    }
    throw e
  }
}

export async function checkConnectivity(preset) {
  if (!preset) return { ok: false, category: 'unknown', message: '未选择接口预设' }
  if (!preset.baseURL) return { ok: false, category: 'unknown', message: '缺少 baseURL' }
  if (!preset.apiKey) return { ok: false, category: 'auth', message: '缺少 API Key' }

  const locked = preset.protocol === PROTOCOL_CHAT || preset.protocol === PROTOCOL_IMAGES
  try {
    if (!locked) {
      // 自动探测:判定协议并回传,供调用方写回预设。
      const protocol = await detectProtocol(preset)
      return { ok: true, category: 'ok', message: `连接成功(已自动识别为 ${protocol} 协议)`, protocol }
    }
    if (preset.protocol === PROTOCOL_CHAT) {
      await probeChat(preset)
    } else {
      await probeImages(preset)
    }
    return { ok: true, category: 'ok', message: '连接成功', protocol: preset.protocol }
  } catch (e) {
    if (e instanceof ApiError) {
      return { ok: false, category: e.category, message: e.message, detail: e.detail }
    }
    return { ok: false, category: 'unknown', message: String(e?.message || e) }
  }
}
