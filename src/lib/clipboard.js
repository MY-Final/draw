// 从剪贴板数据提取第一张图片,兼容两条路径:
//  - files:文件管理器复制文件时通常有
//  - items:截图工具 / 网页"复制图片"通常只在这里,需 getAsFile()
// 传入 DataTransfer(event.clipboardData);无图返回 null。
export function imageFromClipboard(clipboardData) {
  if (!clipboardData) return null
  const f = clipboardData.files?.[0]
  if (f && f.type && f.type.startsWith('image/')) return f
  for (const item of clipboardData.items || []) {
    if (item.kind === 'file' && item.type && item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) return file
    }
  }
  return null
}
