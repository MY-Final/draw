## Why

当前 Composer 尺寸选择器只有几个固定选项(1024、1024×1024等),无法灵活控制宽高比和分辨率。参考图仅支持从已有素材中选择,不支持本地上传或粘贴。素材库图片拖到 Composer 当参考图也不支持。

## What Changes

1. **尺寸选择器重构**:组合选择器 = 宽高比(1:1 / 16:9 / 9:16 / 4:3 / 3:4) × 分辨率(1K / 2K / 4K)。映射到实际 size 参数(如 2K + 16:9 → 2048×1152)。同时 2K/4K 时自动追加 quality 关键词到 prompt。

2. **参考图上传与粘贴**:支持文件选择上传和剪贴板粘贴图片到 Composer 参考图区域,上传的图片存入素材库(`source:'reference-uploaded'`),然后作为参考图加入该轮生成。

3. **从素材库拖放**:在素材库面板(LibraryPanel)的图片上拖拽到 Composer 参考图区,松手后自动添加为参考图。

## Capabilities

### New Capabilities
- `reference-upload`: 文件上传和剪贴板粘贴参考图,存入素材库并关联到生成。

### Modified Capabilities
- `image-generation`: 尺寸选择器改为宽高比 × 分辨率组合;2K/4K 时追加 quality prompt;支持从素材库拖放图片为参考图;上传/粘贴图片自动作为参考图。

## Impact

- `Composer.vue` — 尺寸选择器重构、上传/粘贴入口、拖放目标区
- `AssetPanel.vue` (或类似素材库面板) — 图片可拖拽
- `src/lib/imageGeneration.js` 或 `generationService.js` — quality prompt 追加逻辑
- `assetRepo.js` — 已支持 putAsset,上传路径已存在(`source:'reference-uploaded'`),无需大改
- 素材库面板(`LibraryPanel` 或 `AssetPanel`) — 新增 DnD 拖拽能力
