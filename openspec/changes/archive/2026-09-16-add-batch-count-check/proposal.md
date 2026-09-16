## Why

用户请求批量生成(数量 N > 1)时,部分 OpenAI 兼容接口会实际只返回 M 张(M < N)。此前系统把它当作完全成功处理,用户难以察觉少了图、也不便核对与计费。补齐数量核对后,少返会被显式告警。

## What Changes

- 请求张数 N > 1 且接口实际返回 M < N 时,该次生成仍标记为**成功**(保留已拿到、已计费的图),但附带**告警**:注明"请求 N 张,实际返回 M 张",并保留**接口原始响应片段**便于核对。
- 返回足量(M ≥ N)或只请求 1 张时,**不**产生该告警。

## Capabilities

### New Capabilities
<!-- 无新增能力 -->

### Modified Capabilities
- `image-generation`: 新增"批量数量核对"要求。

## Impact

- `src/lib/generationService.js`:生成成功后按 `requested = n` 与 `images.length` 比对,写入 `partialNote` 与 `rawResponseSnippet`。
- `src/components/ResultsView.vue`:回复卡展示 partial 告警与响应片段。
- 无数据迁移、无接口改动。
