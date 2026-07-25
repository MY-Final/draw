// 参考图批量上传保持用户选择/拖入顺序。接口当前只发送第一张，顺序必须稳定。
export async function uploadInOrder(items, upload) {
  const results = []
  for (const item of items) results.push(await upload(item))
  return results
}
