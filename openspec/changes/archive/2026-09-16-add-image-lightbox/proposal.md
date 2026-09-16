## Why

出图验收需要看细节(手指、文字、边缘),仅靠缩略图与 `contain` 展示远不够;素材也常需复制提示词或直接带去别处。此前的预览只是静态展示,缺缩放、平移与复制能力。

## What Changes

- 点击结果图或素材进入**大图预览**:支持滚轮缩放、双击在原始比例与放大之间切换、放大后拖拽平移(并可复位)。
- 预览内可**复制该图提示词**与**将图片复制到剪贴板**。
- 多图场景支持在相邻图之间**左右切换**(含键盘 `←` `→` 与 `+` `-` `0`)。

## Capabilities

### New Capabilities
<!-- 无新增能力 -->

### Modified Capabilities
- `asset-library`: 新增"大图预览"要求(缩放/平移/复制/相邻切换)。

## Impact

- `src/components/ImageLightbox.vue`:缩放/平移/复位、复制提示词、复制图片、相邻切换。
- `src/components/ResultsView.vue` / 素材库:点击进入预览并传入相邻图列表。
- `src/lib/clipboard.js`:图片复制到剪贴板。
- 无数据迁移、无接口改动。
