## Why

素材库会同时存在 AI 生成、用户手动上传与整库导入的图片。此前不记录来源,素材一多便无从区分与筛选。补齐来源标记后,用户可按来源快速定位。

## What Changes

- 为每张素材记录**来源**:`AI 生成` / `我的上传` / `导入`。
- 素材格子展示**来源角标**;素材库支持**按来源筛选**。
- 缺失 `source` 字段的历史素材按 `AI 生成` 处理。

## Capabilities

### New Capabilities
<!-- 无新增能力 -->

### Modified Capabilities
- `asset-library`: 新增"素材来源区分与筛选"要求。

## Impact

- `src/lib/assetSource.js`:来源枚举、标签与归一化。
- 素材写入处(`assetRepo` / 上传 / 导入)带上 `source`。
- `src/components/LibraryPanel.vue`:来源角标与来源筛选。
- 无数据迁移:旧素材缺字段时按 `generated` 归一化。
