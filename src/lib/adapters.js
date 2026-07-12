// 协议适配层(design D1/D3)—— 统一接口:
//   generate({ preset, prompt, refImages, params, signal }) -> { images: {kind,value}[], raw, snippet }
//
// refImages: [{ blob, mime }]。四象限分派:
//   images 无参考图 → images/generations;images 带参考图 → images/edits(改图)
//   chat → chat/completions(参考图作为 image_url 块)
// 上层拿到 images 后统一交给 http.toBlob 落库,不关心协议差异。

import { callApi, blobToDataUrl } from './http.js'
import { extractImagesFromChatResponse } from './imageExtractor.js'
import { PROTOCOL_CHAT } from './presets.js'

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
  // 部分接口支持 response_format;优先要 b64 以便直接落库,不依赖外链。
  if (params.responseFormat) body.response_format = params.responseFormat

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

// ChatAdapter —— POST /v1/chat/completions,参考图作为 image_url 内容块
async function generateViaChat({ preset, prompt, refImages, params, signal }) {
  const url = `${preset.baseURL}/v1/chat/completions`

  const content = [{ type: 'text', text: prompt }]
  for (const ref of refImages || []) {
    const dataUrl = await blobToDataUrl(ref.blob)
    content.push({ type: 'image_url', image_url: { url: dataUrl } })
  }

  const body = {
    model: preset.model || params.model,
    messages: [{ role: 'user', content }],
  }
  if (params.maxTokens) body.max_tokens = params.maxTokens

  const raw = await callApi(url, { apiKey: preset.apiKey, body, signal })
  const { images, snippet } = extractImagesFromChatResponse(raw)
  return { images, raw, snippet }
}

export async function generate({ preset, prompt, refImages = [], params = {}, signal } = {}) {
  if (!preset) throw new Error('未选择接口预设')
  const hasRefs = refImages.length > 0
  // 四象限分派(design D1):
  //   images 无参考图 → generations;images 带参考图 → edits
  //   chat  → chat/completions(参考图作为 image_url 块)
  if (preset.protocol === PROTOCOL_CHAT) {
    return generateViaChat({ preset, prompt, refImages, params, signal })
  }
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
