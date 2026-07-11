// chat/completions 响应抠图提取器(design D4 —— 最大技术风险,单独可测)。
//
// NewAPI 生态把图塞在多处,按序兜底,全部规整为 { kind: 'url'|'dataUrl', value }。
// 输入:一个 chat/completions 响应对象(已 JSON.parse)。
// 输出:{ images: ExtractedImage[], snippet: string }
//   images 为空时,snippet 保留原始响应片段供诊断(design 无法提取场景)。

const DATA_URI_RE = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g
// markdown 图片:![alt](URL) —— URL 可能是 http(s) 或 data URI
const MARKDOWN_IMG_RE = /!\[[^\]]*\]\((\s*<?)([^)\s]+)(>?\s*)\)/g
// 裸露的 http(s) 图片 URL(结尾常见图片扩展名,或带查询串的图片链接)
const BARE_IMG_URL_RE = /https?:\/\/[^\s"'<>)]+?\.(?:png|jpe?g|webp|gif|bmp|svg)(?:\?[^\s"'<>)]*)?/gi

function classify(value) {
  const v = String(value).trim()
  if (v.startsWith('data:image/')) return { kind: 'dataUrl', value: v }
  return { kind: 'url', value: v }
}

function pushUnique(list, seen, item) {
  if (!item || !item.value) return
  if (seen.has(item.value)) return
  seen.add(item.value)
  list.push(item)
}

// 从任意字符串里抠出所有图片承载形式。
function extractFromText(text, out, seen) {
  if (!text || typeof text !== 'string') return

  // 1. markdown 图片语法(最常见)
  let m
  MARKDOWN_IMG_RE.lastIndex = 0
  while ((m = MARKDOWN_IMG_RE.exec(text)) !== null) {
    pushUnique(out, seen, classify(m[2]))
  }

  // 2. data URI(可能不在 markdown 里,裸出现)
  DATA_URI_RE.lastIndex = 0
  const dataMatches = text.match(DATA_URI_RE) || []
  for (const d of dataMatches) pushUnique(out, seen, classify(d))

  // 3. 裸露 http(s) 图片 URL
  BARE_IMG_URL_RE.lastIndex = 0
  const urlMatches = text.match(BARE_IMG_URL_RE) || []
  for (const u of urlMatches) pushUnique(out, seen, classify(u))
}

// content 可能是字符串,也可能是内容块数组(含 {type:'image_url'})。
function extractFromContent(content, out, seen) {
  if (typeof content === 'string') {
    extractFromText(content, out, seen)
    return
  }
  if (Array.isArray(content)) {
    for (const block of content) {
      if (!block || typeof block !== 'object') {
        if (typeof block === 'string') extractFromText(block, out, seen)
        continue
      }
      // OpenAI 视觉内容块:{ type:'image_url', image_url:{ url } } 或 { image_url:'...' }
      if (block.type === 'image_url' || block.image_url) {
        const url = typeof block.image_url === 'string' ? block.image_url : block.image_url?.url
        if (url) pushUnique(out, seen, classify(url))
      }
      // 某些中转:{ type:'output_image', image:'...' } 或 { type:'image', ... }
      if (block.type === 'output_image' || block.type === 'image') {
        const url = block.url || block.image || block.b64_json
        if (url) {
          const val = block.b64_json && !String(url).startsWith('data:')
            ? `data:image/png;base64,${url}`
            : url
          pushUnique(out, seen, classify(val))
        }
      }
      // 内容块里嵌文本
      if (typeof block.text === 'string') extractFromText(block.text, out, seen)
    }
  }
}

export function extractImagesFromChatResponse(resp) {
  const out = []
  const seen = new Set()

  const choices = resp?.choices || []
  for (const choice of choices) {
    const message = choice?.message || choice?.delta || {}

    // A. content(字符串 / 内容块数组)
    extractFromContent(message.content, out, seen)

    // B. message.images[] 私有扩展(某些中转:字符串或 {url}/{b64_json})
    if (Array.isArray(message.images)) {
      for (const img of message.images) {
        if (typeof img === 'string') {
          pushUnique(out, seen, classify(img))
        } else if (img && typeof img === 'object') {
          const val = img.url || img.image_url?.url || img.image_url ||
            (img.b64_json ? `data:image/png;base64,${img.b64_json}` : null)
          if (val) pushUnique(out, seen, classify(val))
        }
      }
    }

    // C. 极端兜底:message 上直接挂 url 字段
    if (typeof message.url === 'string') pushUnique(out, seen, classify(message.url))
  }

  // D. 顶层也可能挂 data(个别把 images 接口风格塞进 chat 响应的中转)
  if (Array.isArray(resp?.data)) {
    for (const d of resp.data) {
      if (d?.url) pushUnique(out, seen, classify(d.url))
      else if (d?.b64_json) pushUnique(out, seen, classify(`data:image/png;base64,${d.b64_json}`))
    }
  }

  const snippet = out.length === 0 ? buildSnippet(resp) : null
  return { images: out, snippet }
}

// 无法提取时,保留一段可诊断的响应片段(截断,避免过大)。
function buildSnippet(resp) {
  try {
    const s = JSON.stringify(resp)
    return s.length > 2000 ? s.slice(0, 2000) + '…(truncated)' : s
  } catch {
    return String(resp).slice(0, 2000)
  }
}
