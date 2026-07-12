# Tasks

## T1 — 尺寸选择器:宽高比 × 分辨率组合

- [x] 重构 Composer.vue 的尺寸选择区:两级按钮组(宽高比 5 个 + 分辨率 3 个)
- [x] 实现 `computeSize(ratio, resolution)` 纯函数,输出 `"WxH"` 字符串
- [x] 默认值:宽高比 1:1,分辨率 1K
- [x] 选中的比例/分辨率按钮有高亮样式(primary 色)
- [x] 提交时将计算后的 size 传入 `params.size`

## T2 — Quality Prompt 追加

- [x] 定义 `QUALITY_MAP` 映射(1k→'', 2k→', high detail, sharp focus', 4k→', ultra detailed, 4k, ultra sharp, intricate details')
- [x] 在 `store.generate()` 中追加 quality prompt,发送 `fullPrompt` 给接口
- [x] 存储时 `prompt` 保留原始用户输入,不包含追加部分
- [x] (可选)generation 记录中加 `fullPrompt` 字段便于调试

## T3 — 参考图上传(文件选择)

- [x] 参考图区添加"上传"按钮(📎 或加号图标),触发隐藏 `<input type="file" accept="image/*">`
- [x] 选择文件后:读取 blob → `putAsset({ blob, mime, name, source:'reference-uploaded' })` → `addReference(assetId)`
- [x] 上传完成后关闭 file input(重置 value 以便重复选同一文件)

## T4 — 参考图上传(剪贴板粘贴)

- [x] 在 Composer 区域监听 `paste` 事件
- [x] 检测 `clipboardData.files` 或 `items` 中是否含图片
- [x] 有图片:走上传流程(同上),并提示用户(可选 toast)
- [x] 注意:不要拦截纯文本粘贴(用户可能粘贴 prompt)

## T5 — 素材库拖放(DnD)

- [x] 素材库面板中每张图片容器设置 `draggable="true"`
- [x] `dragstart` 事件设置 `dataTransfer` 数据 `JSON.stringify({ assetId })`
- [x] Composer 参考图区监听 `dragover`(preventDefault + 视觉高亮)
- [x] `drop` 事件:解析 assetId → `addReference(assetId)`(已存在则不重复)
- [x] 拖放完成后视觉高亮恢复正常
