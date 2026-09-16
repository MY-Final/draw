// 图像接口适配层 —— 统一接口:
//   generate({ preset, prompt, refImages, params, signal }) -> { images: {kind,value}[], raw, snippet }
//
// refImages: [{ blob, mime }]。标准 OpenAI images 接口:
//   无参考图 → images/generations(文生图);带参考图 → images/edits(改图)
// 上层拿到 images 后统一交给 http.toBlob 落库。

import { callApi, DEFAULT_REQUEST_TIMEOUT_MS } from './http.js'
import { tl } from '../i18n/translate.js'

// 从各种响应形态中提取图片,尽量不丢图:
//  标准:data[].b64_json / data[].url
//  兜底:output[].content[].image_url / content[].url / content[].b64_json / 顶层 images[]
//  url 字段也可能是 data: 前缀的 base64,统一按 dataUrl 处理,避免外链下载走弯路。
function extractImages(raw) {
  const images = []
  const push = (value, isData = false) => {
    if (typeof value !== 'string' || !value) return
    const data = isData || value.startsWith('data:')
    images.push({ kind: data ? 'dataUrl' : 'url', value })
  }

  for (const d of raw?.data || []) {
    if (d?.b64_json) push(`data:image/png;base64,${d.b64_json}`, true)
    else if (d?.url) push(d.url)
    else if (typeof d?.image === 'string') push(d.image)
  }
  if (images.length) return images

  for (const item of raw?.output || []) {
    for (const c of item?.content || []) {
      const u = c?.image_url || c?.imageUrl
      if (typeof u === 'string') push(u)
      else if (u && typeof u === 'object' && typeof u.url === 'string') push(u.url)
      else if (typeof c?.url === 'string') push(c.url)
      else if (typeof c?.b64_json === 'string') push(`data:image/png;base64,${c.b64_json}`, true)
    }
  }
  if (!images.length && Array.isArray(raw?.images)) {
    for (const u of raw.images) push(u)
  }
  return images
}

// ImagesAdapter —— POST /v1/images/generations
async function generateViaImages({ preset, prompt, params, signal }) {
  const url = `${preset.baseURL}/v1/images/generations`
  const body = {
    model: preset.model || params.model,
    prompt,
    n: params.n || 1,
  }
  // size 有值才发;Auto 宽高比时 params.size 为 null,交由服务端自适应
  if (params.size) body.size = params.size
  // 画质:作为真实参数发送(high/medium/low),不再靠往 prompt 拼形容词伪造
  if (params.quality) body.quality = params.quality
  // response_format 仅在调用方显式指定时发送:部分中转站的 generations 不认 b64_json
  // 会卡住(实测某 newapi:发 b64_json → 服务端已出图但响应不回 → 客户端超时)。
  // 不指定时由服务端默认(通常返回 url),url 再由 http.toBlob 下载落库(有超时兜底)。
  if (params.responseFormat) body.response_format = params.responseFormat

  const raw = await callApi(url, {
    apiKey: preset.apiKey, body, signal, timeoutMs: preset.requestTimeoutMs || DEFAULT_REQUEST_TIMEOUT_MS,
  })

  const images = extractImages(raw)
  return { images, raw, snippet: images.length ? null : safeSnippet(raw) }
}

// ImagesEditAdapter —— POST /v1/images/edits(multipart)。images 协议带参考图时改图。
// 官方 edits 端点(GPT Image 系)支持最多 16 张源图:多图场景每张以 image[] 字段重复
// 发送;单图沿用 image 字段,兼容 DALL·E 2 与旧中转站。
async function generateViaImagesEdit({ preset, prompt, refImages, params, signal }) {
  const url = `${preset.baseURL}/v1/images/edits`
  const form = new FormData()
  form.append('model', preset.model || params.model)
  form.append('prompt', prompt)
  form.append('n', String(params.n || 1))
  // size 有值才发;Auto 宽高比时省略,交由服务端自适应
  if (params.size) form.append('size', params.size)
  // 画质:真实参数(high/medium/low)
  if (params.quality) form.append('quality', params.quality)
  // 默认要 b64_json,绕开外链下载转圈(同 generations)
  form.append('response_format', params.responseFormat || 'b64_json')
  // 单图字段名保持 image;多图对齐官方写法,每张以 image[] 携带,文件名按序编号。
  const field = refImages.length > 1 ? 'image[]' : 'image'
  refImages.forEach((img, i) => {
    const ext = (img.mime?.split('/')[1] || 'png').replace('jpeg', 'jpg')
    form.append(field, img.blob, `image-${i + 1}.${ext}`)
  })

  const raw = await callApi(url, {
    apiKey: preset.apiKey, body: form, signal, timeoutMs: preset.requestTimeoutMs || DEFAULT_REQUEST_TIMEOUT_MS,
  })

  const images = extractImages(raw)
  return { images, raw, snippet: images.length ? null : safeSnippet(raw) }
}

export async function generate({ preset, prompt, refImages = [], params = {}, signal } = {}) {
  if (!preset) throw new Error(tl('lib.adapters.noPreset'))
  const hasRefs = refImages.length > 0
  // 标准 OpenAI images 接口:有参考图 → images/edits(改图);无 → images/generations(文生图)
  if (hasRefs) {
    return generateViaImagesEdit({ preset, prompt, refImages, params, signal })
  }
  return generateViaImages({ preset, prompt, params, signal })
}

function safeSnippet(raw) {
  try {
    const s = JSON.stringify(raw)
    return s.length > 2000 ? s.slice(0, 2000) + '…(truncated)' : s
  } catch {
    return String(raw)
  }
}
