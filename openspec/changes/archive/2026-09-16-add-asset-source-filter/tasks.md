# Tasks

## 1. 来源模型(assetSource.js / 写入侧)
- [x] 1.1 定义 `generated` / `reference-uploaded` / `imported` 及全/短标签
- [x] 1.2 `normalizeSource` 对缺失/未知来源归为 `generated`
- [x] 1.3 生成、上传、导入三条写入路径分别带上对应 `source`

## 2. UI(LibraryPanel.vue)
- [x] 2.1 素材格子展示来源角标(短标签)
- [x] 2.2 素材库按来源筛选(全标签)

## 3. 验证
- [x] 3.1 三类来源素材角标与筛选正确
- [x] 3.2 无 `source` 的历史素材显示为 AI 生成
- [x] 3.3 `npm run lint` / `npm test` / `npm run build` 通过
