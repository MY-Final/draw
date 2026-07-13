## Why

用户在真实使用 newapi 中转站时遇到一连串问题:`/v1/images/generations` 生成后**一直转圈**(服务端已计费返回、但前端卡死),参考图**无法粘贴**,"画质"标签选了却**不是真的画质**(只是往 prompt 偷偷拼英文形容词),以及必须手动选 `images/chat` 协议这个纯技术概念。根因集中在**参考图 / 图像端点 / 参数**这条链路上,值得一次性打通。

## What Changes

- **修转圈**:图像端点(`images/generations` 与 `images/edits`)默认请求 `response_format: 'b64_json'`,直接拿 base64 落库,绕开"二次下载跨域图片 URL"这个卡死点;并给所有 `fetch`(API 调用 + 图片外链下载)加超时,超时归类为明确错误而非永久 pending。**BREAKING**(仅默认行为):不再默认走 url 外链下载。
- **画质变真**:新增独立的 `quality`(高/中/低 → `high/medium/low`)参数并真实发送给 API;移除 `QUALITY_MAP` 往用户 prompt 末尾静默追加英文形容词的假动作。`size` 仍由 比例 × 分辨率 决定。
- **改图无感**:删除"参考图仅 chat 协议可用"等误导文案;明确四象限自动路由(有参考图 + images 协议 → `images/edits`;chat 协议 → `chat/completions`)本就无需用户选择。
- **协议自动探测**:新建/测试预设时自动探测该接口走 images 还是 chat 端点,用户默认不再需要手动选协议;协议字段降级为"自动 / 高级"。
- **粘贴图片**:修复参考图粘贴 —— paste 监听改到可靠位置(不再挂在不可编辑的 div 上),并兼容从 `clipboardData.items` 取图(覆盖截图工具 / 网页"复制图片"场景)。
- **pending 自愈**:`init()` 时把超时未完成的 pending 记录 reconcile 成 failed,并允许删除 pending 记录,消除"永久生成中且删不掉"的僵尸卡片。

## Capabilities

### New Capabilities
<!-- 无新增能力 -->

### Modified Capabilities
- `image-generation`: 生成参数新增真实 `quality`、图像端点默认 `b64_json`、请求超时与 pending 自愈、参考图粘贴、协议/改图路由对用户无感。
- `api-connection`: 预设的协议字段支持自动探测,用户默认无需手动选择 images/chat。

## Impact

- `src/lib/adapters.js`:两图像端点加 `response_format: 'b64_json'` 与 `quality`;导出探测函数。
- `src/lib/http.js`:`callApi` 与 `toBlob` 的 `fetch` 加超时;超时归类为 ApiError。
- `src/lib/generationService.js`:落库路径兼容 b64 优先;传递 quality。
- `src/lib/presets.js` / `PresetManager.vue`:协议自动探测,协议字段降级为高级/自动。
- `src/components/Composer.vue`:新增画质 tag(高/中/低)、删除 QUALITY_MAP 偷拼、修复 onPaste(挂载位置 + items 兼容)、清理误导文案。
- `src/stores/workbench.js`:`init()` reconcile 超时 pending;放开 pending 删除。
- `src/components/ResultsView.vue`:允许删除 pending 记录。
- 测试:补 adapters(b64/quality/size 省略)、computeSize、协议探测、paste 提取的覆盖。
- UI 改动走 `ui-ux-pro-max`(design D9),画质 tag 复用既有 tag 样式与设计 token。
