// 浏览器下载工具(纯前端触发下载)。
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  triggerDownload(url, filename)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// 可读文件名:优先用 prompt/素材名,截断并去掉路径非法字符;无可读信息时退回内部 id。
export function imageFileName({ id = 'image', prompt = '', name = '', ext = 'png' } = {}) {
  const base = (prompt || name || '')
    .trim().replace(/\s+/g, ' ')
    .replace(/[\\/:*?"<>|\r\n]+/g, '')
    .slice(0, 48)
  return `${base || id}.${ext}`
}

export function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
  downloadBlob(blob, filename)
}

function triggerDownload(url, filename) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

// 选择本地文件(供导入)。返回 File 或 null。
export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    if (accept) input.accept = accept
    input.onchange = () => resolve(input.files?.[0] || null)
    input.click()
  })
}
