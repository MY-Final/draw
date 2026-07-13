// 图像接口适配层 —— 统一接口:
//   generate({ preset, prompt, refImages, params, signal }) -> { images: {kind,value}[], raw, snippet }
//
// refImages: [{ blob, mime }]。标准 OpenAI images 接口:
//   无参考图 → images/generations(文生图);带参考图 → images/edits(改图)
// 上层拿到 images 后统一交给 http.toBlob 落库。

import { callApi } from './http.js'

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
  // 默认要 b64_json:直接拿到图片数据落库,绕开"二次下载跨域外链"这个转圈根源。
  // 调用方可用 responseFormat 显式覆盖(如某站不支持 b64,置为其它值或空)。
  body.response_format = params.responseFormat || 'b64_json'

  const raw = await callApi(url, { apiKey: preset.apiKey, body, signal })

  const images = []
  for (const d of raw?.data || []) {
    if (d.b64_json) images.push({ kind: 'dataUrl', value: `data:image/png;base64,${d.b64_json}` })
    else if (d.url) images.push({ kind: 'url', value: d.url })
  }
  return { images, raw, snippet: images.length ? null : safeSnippet(raw) }
}

// ImagesEditAdapter —— POST /v1/images/edits(multipart)。images 协议带参考图时改图。
// 多张参考图仅取第一张(edits 端点通常只接受一张)。
async function generateViaImagesEdit({ preset, prompt, refImages, params, signal }) {
  const url = `${preset.baseURL}/v1/images/edits`
  const first = refImages[0]
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
  const ext = (first.mime?.split('/')[1] || 'png').replace('jpeg', 'jpg')
  form.append('image', first.blob, `image.${ext}`)

  const raw = await callApi(url, { apiKey: preset.apiKey, body: form, signal })

  const images = []
  for (const d of raw?.data || []) {
    if (d.b64_json) images.push({ kind: 'dataUrl', value: `data:image/png;base64,${d.b64_json}` })
    else if (d.url) images.push({ kind: 'url', value: d.url })
  }
  return { images, raw, snippet: images.length ? null : safeSnippet(raw) }
}

export async function generate({ preset, prompt, refImages = [], params = {}, signal } = {}) {
  if (!preset) throw new Error('未选择接口预设')
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
