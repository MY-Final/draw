// 生成编排(design 数据流:写 generation(pending) → 适配调用 → 落库输出 → 更新状态)。
// Task 5.3 / 5.4:失败标记、不产生残缺素材;支持 AbortSignal 取消。

import { generate } from './adapters.js'
import { toBlob, ApiError } from './http.js'
import { putAsset, getAssets, deleteAssets } from './assetRepo.js'
import { createGeneration, updateGeneration } from './generationRepo.js'

// refImageIds:素材库中的 asset id 列表(参考图走 images/edits)。
// onPending:pending 记录落库后立即回调,供 store 做乐观上屏(请求即时上屏)。

const STATUS_MESSAGES = [
  '正在排队',
  '模型正在处理中',
  '正在生成图片',
  '即将完成',
  '正在渲染',
  '正在优化细节',
  'AI 正在创作',
]

function isAbortError(e, signal) {
  return (signal && signal.aborted)
    || (e && (e.name === 'AbortError' || e.name === 'TimeoutError' && signal?.aborted))
}

// 安全更新:记录可能已被用户删除(取消/软删),不因 missing 再抛二次错误。
async function safeUpdate(id, patch) {
  try {
    return await updateGeneration(id, patch)
  } catch {
    return null
  }
}

export async function runGeneration({
  preset, prompt, fullPrompt, refImageIds = [], params = {}, signal, onPending, workspaceId,
}) {
  // 1. 先落一条 pending 记录(即使失败也留痕,便于诊断)
  const statusMessage = STATUS_MESSAGES[Math.floor(Math.random() * STATUS_MESSAGES.length)]
  const gen = await createGeneration({
    prompt,
    refImageIds,
    params: { ...params, prompt: fullPrompt || prompt, model: preset.model, protocol: preset.protocol },
    statusMessage,
    workspaceId,
  })
  // 落库即通知:让 UI 立刻显示"生成中"这一轮,无需等待接口返回
  if (onPending) onPending(gen)

  const createdAssetIds = []
  try {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    // 2. 取参考图 Blob
    const refAssets = refImageIds.length ? await getAssets(refImageIds) : []
    const refImages = refAssets.map((a) => ({ blob: a.blob, mime: a.mime }))

    // 3. 适配调用(用 fullPrompt 发送,保持 prompt 原始存储)
    const apiPrompt = fullPrompt || prompt
    const { images, snippet } = await generate({
      preset, prompt: apiPrompt, refImages, params, signal,
    })

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    // 4. 无输出:标记 empty,保留 snippet
    if (!images.length) {
      return (await safeUpdate(gen.id, {
        status: 'empty',
        rawResponseSnippet: snippet,
        elapsedMs: Date.now() - gen.createdAt,
      })) || { ...gen, status: 'empty' }
    }

    // 5. 逐张规整为 Blob 并落库;中途取消则清掉已写入的孤儿图
    const outputImageIds = []
    for (const img of images) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const blob = await toBlob(img)
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const asset = await putAsset({ blob, mime: blob.type, source: 'generated', workspaceId })
      createdAssetIds.push(asset.id)
      outputImageIds.push(asset.id)
    }

    return (await safeUpdate(gen.id, {
      status: 'success',
      outputImageIds,
      elapsedMs: Date.now() - gen.createdAt,
    })) || { ...gen, status: 'success', outputImageIds }
  } catch (e) {
    // 取消/失败时清掉本轮已落库但未挂到 success 记录上的图
    if (createdAssetIds.length) {
      try { await deleteAssets(createdAssetIds) } catch { /* ignore */ }
    }

    const aborted = isAbortError(e, signal)
    const message = aborted
      ? '已取消'
      : (e instanceof ApiError ? `[${e.category}] ${e.message}` : String(e?.message || e))

    const updated = await safeUpdate(gen.id, {
      status: 'failed',
      error: message,
      elapsedMs: Date.now() - gen.createdAt,
    })

    if (aborted) {
      // 取消视为可预期结束,不向上抛,避免 store 当成 lastError 弹红条
      return updated || { ...gen, status: 'failed', error: message, cancelled: true }
    }
    throw e
  }
}
