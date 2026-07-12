# Image Generation (Modified Capability)

## 变更 1:尺寸选择器重构

### 现状
Composer 使用单个 `size` 选择,目前是一组固定选项(1024、1024×1024 等)。

### 改为
两级组合:宽高比 + 分辨率。

**宽高比选项**:

| key  | 标签   | 宽/高 |
|------|--------|-------|
| 1:1  | 方形   | 1     |
| 16:9 | 横屏   | 16/9  |
| 9:16 | 竖屏   | 9/16  |
| 4:3  | 横屏   | 4/3   |
| 3:4  | 竖屏   | 3/4   |

**分辨率选项**:

| key | 标签 | 基准像素 | quality prompt |
|-----|------|----------|----------------|
| 1k  | 1K   | 1024     | 无             |
| 2k  | 2K   | 2048     | `, high detail, sharp focus` |
| 4k  | 4K   | 4096     | `, ultra detailed, 4k, ultra sharp, intricate details` |

**尺寸计算函数**:

```ts
function computeSize(ratio: string, resolution: string): string {
  const resMap = { '1k': 1024, '2k': 2048, '4k': 4096 }
  const base = resMap[resolution]
  const [w, h] = ratio.split(':').map(Number)
  if (w === h) return `${base}x${base}`
  if (w > h) return `${base}x${Math.round(base * h / w)}`
  return `${Math.round(base * w / h)}x${base}`
}
```

### 存储
- `params.size` 仍为 `"WxH"` 字符串,兼容下游
- 新增 `params.ratio` 和 `params.resolution` 用于记录用户选择(可选,便于调试)

## 变更 2:Quality Prompt 追加

在 `store.generate()` 中,提交前根据所选分辨率追加 quality prompt:

```ts
const QUALITY_MAP = {
  '1k': '',
  '2k': ', high detail, sharp focus',
  '4k': ', ultra detailed, 4k, ultra sharp, intricate details',
}

const suffix = QUALITY_MAP[resolution]
const fullPrompt = suffix ? prompt + suffix : prompt
```

- `prompt` 保持原样存储和显示
- 传给 `runGeneration` 的是 `fullPrompt`

## 变更 3:参考图上传与粘贴

参考图区域的"+"按钮添加 `<input type="file" accept="image/*">`,选择后:

```
file → blob → putAsset({ blob, mime, name, source: 'reference-uploaded' })
→ addReference(assetId)
```

全局 `paste` 事件(在 Composer 区域内)检测 `event.clipboardData.files` 或 `items` 中是否有图片,有则自动走上传流程。

**去重**:同一文件(同名+同大小)不上传两次?初期不做严格去重,以用户体验为先。用户想换一张同样名字的正常图片应能上传。

**上限**:同一轮生成参考图数量上限维持不变(现有逻辑:无硬上限,但 UI 显示有限区域)。

## 变更 4:拖放 DnD

### 素材库侧(drag source)
- 素材库中每张图片 `img` 或容器设置 `draggable="true"`
- `@dragstart` → `event.dataTransfer.setData('application/json', JSON.stringify({ assetId }))`

### Composer 侧(drop target)
- 参考图区域监听 `@dragover.prevent` (显示高亮)
- `@drop` → 解析 dataTransfer → `addReference(assetId)`

### 限制
- 已作为参考图的 asset 再次 drop 时不重复添加
- 不支持从外部(文件管理器)拖入(与上传不同,DnD 仅素材库内部)
