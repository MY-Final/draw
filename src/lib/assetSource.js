// 素材来源分类(asset.source):区分 AI 生成 / 手动上传 / 备份导入。
// 旧记录可能缺 source 字段,统一按 generated 处理(老版本只会是生成图)。

import { tl } from '../i18n/translate.js'

const VALID_SOURCES = new Set(['generated', 'reference-uploaded', 'imported'])

export function normalizeSource(source) {
  return VALID_SOURCES.has(source) ? source : 'generated'
}

export function sourceFullLabel(source) {
  return tl(`lib.assetSource.full.${normalizeSource(source)}`)
}

export function sourceShortLabel(source) {
  return tl(`lib.assetSource.short.${normalizeSource(source)}`)
}
