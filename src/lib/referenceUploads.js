// 参考图批量上传保持用户选择/拖入顺序；全部参考图会随 edits 请求一并发送
// (多图以重复的 image[] 字段携带)，顺序必须稳定。
export async function uploadInOrder(items, upload) {
  const results = []
  for (const item of items) results.push(await upload(item))
  return results
}
