// 生成编排(design 数据流:写 generation(pending) → 适配调用 → 落库输出 → 更新状态)。
// Task 5.3 / 5.4:失败标记、不产生残缺素材。

import { generate } from './adapters.js'
import { toBlob, ApiError } from './http.js'
import { putAsset, getAssets } from './assetRepo.js'
import { createGeneration, updateGeneration } from './generationRepo.js'

// refImageIds:素材库中的 asset id 列表(仅 chat 协议有效)。
// onPending:pending 记录落库后立即回调,供 store 做乐观上屏(请求即时上屏)。
export async function runGeneration({ preset, prompt, refImageIds = [], params = {}, signal, onPending }) {
  // 1. 先落一条 pending 记录(即使失败也留痕,便于诊断)
  const gen = await createGeneration({ prompt, refImageIds, params: { ...params, model: preset.model, protocol: preset.protocol } })
  // 落库即通知:让 UI 立刻显示"生成中"这一轮,无需等待接口返回
  if (onPending) onPending(gen)

  try {
    // 2. 取参考图 Blob(chat 协议)
    const refAssets = refImageIds.length ? await getAssets(refImageIds) : []
    const refImages = refAssets.map((a) => ({ blob: a.blob, mime: a.mime }))

    // 3. 适配调用
    const { images, snippet } = await generate({ preset, prompt, refImages, params, signal })

    // 4. 无输出:标记 empty,保留 snippet(design 无法提取场景)
    if (!images.length) {
      return updateGeneration(gen.id, { status: 'empty', rawResponseSnippet: snippet, elapsedMs: Date.now() - gen.createdAt })
    }

    // 5. 逐张规整为 Blob 并落库(先全部成功再更新记录,避免残缺素材)
    const outputImageIds = []
    for (const img of images) {
      const blob = await toBlob(img)
      const asset = await putAsset({ blob, mime: blob.type, source: 'generated' })
      outputImageIds.push(asset.id)
    }

    return updateGeneration(gen.id, { status: 'success', outputImageIds, elapsedMs: Date.now() - gen.createdAt })
  } catch (e) {
    const message = e instanceof ApiError ? `[${e.category}] ${e.message}` : String(e?.message || e)
    await updateGeneration(gen.id, { status: 'failed', error: message, elapsedMs: Date.now() - gen.createdAt })
    throw e
  }
}
