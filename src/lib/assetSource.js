// 素材来源分类(asset.source):区分 AI 生成 / 手动上传 / 备份导入。
// 旧记录可能缺 source 字段,统一按 generated 处理(老版本只会是生成图)。

export const SOURCE_FULL_LABEL = {
  generated: 'AI 生成',
  'reference-uploaded': '我的上传',
  imported: '导入',
}

export const SOURCE_SHORT_LABEL = {
  generated: 'AI',
  'reference-uploaded': '上传',
  imported: '导入',
}

export function normalizeSource(source) {
  return SOURCE_FULL_LABEL[source] ? source : 'generated'
}

export function sourceFullLabel(source) {
  return SOURCE_FULL_LABEL[normalizeSource(source)]
}

export function sourceShortLabel(source) {
  return SOURCE_SHORT_LABEL[normalizeSource(source)]
}
