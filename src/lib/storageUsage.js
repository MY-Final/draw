// 存储用量(design D5 / Task 7.1)—— 浏览器 estimate 与业务累计并列。
import { totalAssetBytes, countAssets } from './assetRepo.js'

export async function getStorageUsage() {
  const [businessBytes, assetCount, estimate] = await Promise.all([
    totalAssetBytes(),
    countAssets(),
    navigator.storage?.estimate ? navigator.storage.estimate() : Promise.resolve(null),
  ])
  return {
    businessBytes, // 素材库按 asset.size 累加
    assetCount,
    browserUsage: estimate?.usage ?? null, // 浏览器视角已用
    browserQuota: estimate?.quota ?? null, // 浏览器视角配额
  }
}

export function formatBytes(n) {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(1)} ${units[i]}`
}
