// 网络与图片规整工具。
//
// - callApi:统一的 fetch 封装,把失败归类为可区分的原因(design 风险:CORS/网络、鉴权、其他)。
// - toBlob:把提取到的 {kind,value} 图片统一拉取/解码为 Blob(design D4 收尾 + D 风险:
//   外链 url 立即下载落库,不长期依赖)。

export class ApiError extends Error {
  constructor(category, message, detail = null) {
    super(message)
    this.name = 'ApiError'
    this.category = category // 'network-or-cors' | 'auth' | 'api' | 'unknown'
    this.detail = detail
  }
}

export async function callApi(url, { apiKey, body, signal } = {}) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData
  let resp
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        // FormData 时不手动设 Content-Type,交给浏览器带 multipart boundary。
        ...(isForm ? {} : { 'Content-Type': 'application/json' }),
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: isForm ? body : JSON.stringify(body),
      signal,
    })
  } catch (e) {
    // fetch 抛异常 = 网络层失败,浏览器不区分 CORS 与断网(安全策略),统一归类。
    throw new ApiError('network-or-cors', '无法连接接口:可能是网络问题或接口未开放跨域(CORS)。', String(e))
  }

  if (resp.status === 401 || resp.status === 403) {
    throw new ApiError('auth', `鉴权失败(HTTP ${resp.status}):请检查 API Key 是否正确、是否有权限。`)
  }
  if (!resp.ok) {
    let detail = ''
    try {
      detail = await resp.text()
    } catch { /* ignore */ }
    throw new ApiError('api', `接口返回错误(HTTP ${resp.status})。`, detail.slice(0, 500))
  }

  return resp.json()
}

// 把一张提取图片规整为 Blob。
//   kind='dataUrl' → 解码 base64;kind='url' → fetch 下载(design:拿到即落库,不依赖外链)。
export async function toBlob(image) {
  if (image.kind === 'dataUrl') {
    return dataUrlToBlob(image.value)
  }
  // url:立即下载为 Blob
  try {
    const resp = await fetch(image.value)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return await resp.blob()
  } catch (e) {
    throw new ApiError('network-or-cors', '图片外链下载失败(可能已过期或不允许跨域)。', String(e))
  }
}

export function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(',')
  const mimeMatch = /data:([^;]+)/.exec(head)
  const mime = mimeMatch ? mimeMatch[1] : 'image/png'
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

// 把参考图 Blob 转成 data URL,供 chat image_url 内容块发送。
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
