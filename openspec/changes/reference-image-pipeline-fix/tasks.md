# Tasks

## 1. 治转圈:b64 优先 + fetch 超时
- [x] 1.1 `src/lib/http.js` `callApi`:fetch 加超时(~120s),超时抛 `ApiError('timeout', …)`;与传入 signal 合并(AbortSignal.any 或手动)
- [x] 1.2 `src/lib/http.js` `toBlob`:外链下载 fetch 加超时(~60s),超时抛 `ApiError('timeout', …)`
- [x] 1.3 `src/lib/adapters.js` `generateViaImages`:body 默认 `response_format: 'b64_json'`(未显式覆盖时)
- [x] 1.4 `src/lib/adapters.js` `generateViaImagesEdit`:form 默认追加 `response_format: 'b64_json'`
- [x] 1.5 确认 `data[].b64_json` 优先于 `url` 的解析顺序不变;url 分支保留为降级

## 2. 画质变真
- [x] 2.1 `src/components/Composer.vue`:新增 `QUALITIES`(高/中/低 → high/medium/low),`quality` ref 默认 `'high'`
- [x] 2.2 移除 `QUALITY_MAP` 与 `fullPrompt = text + qualitySuffix`;发送 prompt = 用户原文
- [x] 2.3 `submit()`:`quality` 放入 `params`
- [x] 2.4 `src/lib/adapters.js` 两图像端点发送 `quality`(body 字段 / form 字段)
- [x] 2.5 UI:画质 tag 与数量并入同一 params-row(复用 `.tag`/`.active`,走设计 token)

## 3. 改图无感 + 协议自动探测
- [x] 3.1 删除"参考图仅 chat 协议可用"类文案(`PresetManager.vue` field helper、`Composer.vue` proto-tip 等)
- [x] 3.2 `src/lib/connectivity.js`:实现协议探测(先 images 再 chat,仅接口错误才切),写回 preset.protocol
- [x] 3.3 `testConnection`:未锁定协议时借机探测并返回结果(PresetManager 写回表单)
- [x] 3.4 `PresetManager.vue`:协议字段降级为「高级 ▾」+ auto 选项,新建默认 auto
- [x] 3.5 确认 `adapters.js` 四象限分派逻辑不变(chat→chat;images/auto+refs→edits;images/auto 无 refs→generations)

## 4. 粘贴参考图
- [x] 4.1 `src/components/Composer.vue`:`@paste` 从 `.composer-wrap` 移除(改 document 监听)
- [x] 4.2 mounted 时在 `document` 挂 paste 监听(unmounted 移除),覆盖焦点不在输入框场景
- [x] 4.3 取图兼容:先 `clipboardData.files`,空则遍历 `items` 的 `getAsFile()`(抽到 `lib/clipboard.js`)
- [x] 4.4 仅当剪贴板含图才 `preventDefault`;纯文本粘贴不拦截

## 5. pending 自愈
- [x] 5.1 `src/stores/workbench.js` `init()`:refreshAll 后把 `pending` 且超时(>2min)的记录 reconcile 成 failed(注明中断)
- [x] 5.2 `src/components/ResultsView.vue`:放开对 pending 记录的删除(骨架下加「卡住了?删除」)

## 6. 验证与测试
- [x] 6.1 补 `adapters` 测试:两图像端点默认发 `b64_json`、发 `quality`、Auto 时不发 size
- [x] 6.2 补 paste 提取测试:files 路径与 items 路径均能取到图
- [x] 6.3 补协议探测测试:images 通→images;images 接口错→chat;鉴权失败不误判
- [ ] 6.4 手动实测(newapi + gpt-image-2):generations 不再转圈、拿到 b64;带参考图走 edits 成功 —— **需用户在真实中转站验证**
- [x] 6.5 `npx vitest run` 全绿(56);`npx vite build` 通过
- [x] 6.6 `openspec validate reference-image-pipeline-fix --strict` 通过
