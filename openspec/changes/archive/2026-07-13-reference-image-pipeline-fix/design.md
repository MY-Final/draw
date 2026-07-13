## Context

用户在 newapi 中转站(OpenAI 兼容)上实测暴露的一组问题,根因集中在参考图 / 图像端点 / 参数链路:

- **转圈**:`/v1/images/generations` 已计费返回 2048x2048,但前端永久 pending。全链路(`generationService.js` → `adapters.js` → `http.js`)状态机完整,唯一能永久挂起的是 `http.js` 的 `toBlob` 里 `fetch(image.value)` ——下载中转站返回的图片外链 URL,该 fetch 无超时,遇跨域/慢 CDN 就无限等。真实参考调用(gpt-image-2, `response_format: b64_json`)证明 b64 路径在该站可用。
- **画质假**:`Composer.vue` 的 `QUALITY_MAP` 把 1K/2K/4K 映射成往 prompt 末尾拼英文形容词(`", ultra detailed, 4k…"`),并未发送真实 `quality`。真实调用含 `quality: high`,说明 API 本有此参数。
- **协议要手选**:`protocol` 字段同时承载「走哪个端点」(可推断)与「模型支持哪种」(不可凭空知)两件事。改图其实已由「有无参考图」自动四象限路由,无需用户选。
- **粘贴失效**:`@paste` 挂在不可编辑的 `.composer-wrap` div 上(`Composer.vue:208`),且只读 `clipboardData.files`(截图/复制图片场景为空)。
- **pending 僵尸**:转圈后刷新,DB 留 `status:pending`,`ResultsView.vue` 删除按钮对 pending 不渲染 → 删不掉、ticker 显示上万秒。

## Goals / Non-Goals

**Goals**
- 生成不再永久转圈:失败要么成功,要么给出可读错误。
- 画质参数真实发送;不再污染用户 prompt。
- 用户默认无需理解 / 选择 protocol,改图无需选模式。
- 参考图可从剪贴板粘贴(含截图、网页复制图片)。
- 卡住的 pending 可自愈 / 可删。

**Non-Goals**
- 不做运行时「生成失败自动换端点重试」(用户选了 A:仅测试连接时探测,不在生成路径猜)。
- 不改结果图渲染 / CLS(属另一轮,见评审纪要)。
- 不引入服务端;纯前端。
- 不做参数记忆 / 粘性(维持每次默认)。

## Decisions

### D1:优先 b64_json,fetch 加超时(治转圈)
两图像端点 body/form 默认带 `response_format: 'b64_json'`。`toBlob` 对 `dataUrl` 走纯本地 `dataUrlToBlob`(不联网),彻底绕开跨域图片下载。
`http.js` 的 `callApi` 与 `toBlob` 的 fetch 均加 `AbortSignal.timeout`(API 调用建议 120s,图片外链下载 60s);超时抛 `ApiError('timeout', …)`。
**降级**:若某站不返回 b64(响应 `data[]` 仅有 `url`),保留现有 url→下载分支,此时超时兜底生效。二者共存,不是二选一。

### D2:quality 作为真实参数(画质变真)
新增 `QUALITIES = [{key:'high',label:'高'},{key:'medium',label:'中'},{key:'low',label:'低'}]`,默认 `high`(与真实调用一致)。`submit()` 把 `quality` 放进 `params`;两图像端点发送 `quality`(body 字段 / form 字段)。
**移除** `QUALITY_MAP` 及 `fullPrompt = text + qualitySuffix` 的偷拼逻辑 —— 发送给 API 的 prompt 就是用户原文。`size` 仍由 `computeSize(ratio, resolution)` 决定,与 quality 正交。
**UI**:画质与数量并入同一 params-row(避免三排过挤,呼应评审纪要"常驻区占空间")。

### D3:protocol 自动探测,改图路由无感
- **探测**:`testConnection` / 保存预设时,若用户未显式指定协议,先试 `images/generations`(或轻量探测),不通再试 `chat/completions`,把结果写进 preset.protocol。用户默认看不到该字段;编辑器里降级为「协议:自动 ▾(高级)」,展开才可手动锁定。
- **改图**:维持 `adapters.js` 现有四象限分派(chat→chat;images+refs→edits;images 无 refs→generations)。删除 `PresetManager.vue` 与 `Composer.vue` 里"参考图仅 chat 可用"类文案。这是纯文案 + 探测,不改分派逻辑。
- **默认协议**:`api-connection` spec「默认协议为文生图」放宽为「未探测/未指定时默认 images」,探测结果优先。

### D4:粘贴修复
`@paste` 从 `.composer-wrap` 移到 `<textarea>`(可编辑元素可靠触发);为覆盖"焦点不在输入框"的场景,同时在 `document` 上挂一个 paste 监听(mounted 加、unmounted 移,与现有 `onDocClick` 一致)。取图兼容两路:先 `clipboardData.files`,空则遍历 `clipboardData.items` 的 `getAsFile()`,取第一个 `image/*`。

### D5:pending 自愈
`workbench.js` 的 `init()`(refreshAll 后)扫描 `status:pending` 且 `Date.now()-createdAt > 2min` 的记录,`updateGeneration(id,{status:'failed',error:'生成中断(页面刷新或超时)'})`。同时 `ResultsView.vue` 放开对 pending 的删除按钮(去掉 `v-if !== 'pending'` 对删除的限制,或单独允许删除)。

### D6:UI 走 ui-ux-pro-max(design D9)
画质 tag 复用既有 `.tag` / `.active` 样式与设计 token;协议「高级」折叠沿用编辑器现有 field 风格。不新起视觉。

## Risks / Trade-offs

- **b64 体积**:base64 比二进制大 ~33%,大图响应变大。可接受 —— 换来的是不再转圈、不依赖外链存活。
- **探测可能计费一次**:测试连接会真发请求。仅建/测预设时发生一次,可接受;文案提示。
- **document 级 paste 误抢**:本 app 唯一大输入是 composer,风险低;仅当剪贴板含图才 `preventDefault`,纯文本不拦。
- **2min 阈值**:极慢但真实的生成可能被误判中断。阈值取保守值,且仅影响刷新后遗留的 pending(正常生成在内存态,不受影响)。

## Migration Plan

无数据迁移。旧预设 protocol 字段保留可用;新建走探测。旧 pending 记录在下次 init 时被 reconcile。上线即生效。

## Open Questions

- 探测用"真发一次最小生成"还是"打一个便宜的 models/健康端点"?倾向后者若中转站支持 `/v1/models`,否则回退到最小生成。实现时按站点能力决定,不阻塞本提案。
