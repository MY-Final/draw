## Context

现状链路:`Composer.vue` 的 `refImageIds` 已经是数组,UI 允许堆叠多张缩略图;`generationService.runGeneration` 取全部 ref 的 Blob 传给 `adapters.generate`;唯一截断点在 `adapters.js` 的 `generateViaImagesEdit`——`const first = refImages[0]` 后只 `form.append('image', first.blob, ...)`,其余参考图从未进入请求。UI 因此把非首张标记为「未用」并提示"仅第一张会发送"。

官方能力(2026-08 文档):`POST /v1/images/edits` 支持「一张或多张源图」,GPT Image 模型最多 16 张;multipart 示例为重复的 `image[]` 字段(`-F "image[]=@a.png" -F "image[]=@b.png"`)。DALL·E 2 仍只接受单张 `image`。

## Goals / Non-Goals

**Goals**
- 用户选择的每张参考图都真实随 edits 请求发送,不再有"选了没用"。
- 单图路径行为完全不变(现有 DALL·E 2 / 旧中转站兼容不回归)。
- UI 语义与官方上限一致:顺序可见、超 16 张明确提示。

**Non-Goals**
- 不切换到 JSON body(`images: [{ image_url }]`)形态:本应用持有本地 Blob,multipart 是既有且对中转站最稳的路径;JSON 形态留给中转站自行支持。
- 不做"多图降级策略"(如部分模型不支持时自动只发第一张)——模型能力由接口报错如实暴露,不静默吞。
- 不改参考图排序/去重规则(维持添加顺序、自动去重)。

## Decisions

### D1:单图 `image`、多图 `image[]`(全部发送)
`generateViaImagesEdit` 按参考图数量选择字段名:
- 1 张:`form.append('image', blob, ...)` —— 与现状逐字节一致,兼容 DALL·E 2。
- 2+ 张:每张 `form.append('image[]', blob, ...)` —— 对齐官方多图 multipart 写法。

文件名按顺序编号(`image-1.png` / `image-2.png`…),便于中转站/服务端区分图序。

### D2:UI 徽章从「用/未用」改为「顺序数字」
`ref-thumb` 上的 `secondary` 降级样式与「未用」徽章删除;所有缩略图等权显示,左上角徽章显示 `1..n`(添加顺序),`:title` 统一为"将作为参考图发送"。`ref-tip` 在有图时显示「N 张参考图」,无图时提示"上传、粘贴或拖入参考图(可多张)"。

### D3:16 张上限
新增 `MAX_REFERENCES = 16`(官方上限)。`addReference` 超限时不加入、复用 `referenceNotice` 提示「参考图最多 16 张,已忽略新添加的图片。」。`applyPrefill`(分享配方回填)同样收敛到前 16 张,避免历史配方把必然失败的请求发出去。

### D4:上限只拦「加入」,不拦「入库」
超出上限时图片仍会正常 `addReferenceAsset` 进素材库(用户随时可再选),只是不加入本次生成,行为可预期。

## Risks / Trade-offs

- **中转站兼容**:多图 `image[]` 依赖中转站把 multipart 透传给支持多图的上游(OpenAI 官方已支持)。若某站仍只收单张,多图请求会得到该站返回的明确报错,不静默丢图——这比"假成功"可诊断。
- **请求体积**:多图请求体随参考图数量线性增大,与官方行为一致,无额外取舍。
- **16 张截断**:极端场景(配方含 >16 张)会被收敛,但官方 API 本身不支持,属正确防护。

## Migration Plan

无数据迁移。历史生成记录的 `refImageIds` 字段语义不变(本就是数组),旧记录展示不受影响;新生成的多图记录落库结构与现状一致。
