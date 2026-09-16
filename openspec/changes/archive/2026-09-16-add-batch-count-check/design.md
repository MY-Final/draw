## Context

`generationService.runGeneration` 在拿到 `images` 后直接走成功路径。批量请求下若接口少返,用户无法得知。本次在成功落库处补一层数量核对。

## Goals / Non-Goals

**Goals**
- 少返时显式告警并保留原始响应,用户可核对与追责。
- 不因少返丢弃已拿到(已计费)的图,也不误报为完全成功。

**Non-Goals**
- 不做自动重试补齐缺失张数。
- 不对返回多于请求张数的情况做特殊处理。

## Decisions

### D1:partial 判定 = requested > 1 且 images.length < requested
`requested = Math.max(1, Number(params.n) || 1)`。仅当 `requested > 1 && images.length < requested` 时置 `partial`,避免把单图请求的返回值差异误判为少返。

### D2:仍标记 success,附 `partialNote` + `rawResponseSnippet`
保留全部已返回图片并落为 `success`,附带 `partialNote`(请求/实际张数)与截断的原始响应,交由 UI 展示告警。理由:已拿到且可能已计费,丢弃不合理;但也不能静默当完全成功。

## Risks / Trade-offs

- **部分接口 n 语义不同**:少数接口可能把 n 解释各异。权衡:以"请求张数 vs 返回张数"这一可观测事实告警,不猜测接口语义,由用户据原始响应判断。

## Migration Plan

无数据迁移。新增字段仅在 partial 场景写入,旧记录不受影响。
