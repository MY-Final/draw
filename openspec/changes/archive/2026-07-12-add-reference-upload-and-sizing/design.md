# Design — add-reference-upload-and-sizing

## 决策

### D1 — 尺寸选择器:宽高比 × 分辨率组合

将当前单选下拉(或按钮组)改为两级选择:

**第一级:宽高比**(占主导视觉,按钮组样式)
| 标签 | 比例 |
|------|------|
| 方形 | 1:1 |
| 横屏 | 16:9 |
| 竖屏 | 9:16 |
| 横屏 | 4:3 |
| 竖屏 | 3:4 |

**第二级:分辨率**(次级样式,小按钮组)
| 标签 | 基准像素 | 说明 |
|------|----------|------|
| 1K  | 1024     | 基础质量,无 prompt 追加 |
| 2K  | 2048     | 中等质量,追加 quality prompt |
| 4K  | 4096     | 高质量,追加 quality prompt |

**组合映射逻辑**:先确定宽高比的基础边长(如 1:1 → 两边相等;16:9 → 宽>高),然后乘以对应分辨率基准值。

例如:
- 2K + 1:1 → 2048×2048
- 2K + 16:9 → 2048×1152(2048/16×9)
- 4K + 9:16 → 2304×4096(4096/16×9=2304,但 4K 基准是长边 4096)

实际算法:
```
基准 = 分辨率值(1024/2048/4096)
if 比例宽>高:
  width = 基准, height = 基准 / 比例(宽/高)
if 比例高>宽:
  height = 基准, width = 基准 / 比例(高/宽)
if 1:1:
  width = height = 基准
```

**Why 组合而非预设列表**:预设列表(如 1024、1024×1024、1792×1024等)数量有限且用户不易理解背后的宽高比逻辑。组合式更直观地表达了"比例"和"大小"两个独立维度。

### D2 — Quality Prompt 追加

`2K` 时在 prompt 末尾追加 `, high detail, sharp focus`;`4K` 时追加 `, ultra detailed, 4k, ultra sharp, intricate details`。

追加时机:提交时在 store `generate()` 内部,将追加后的完整 prompt 传给 `runGeneration`。原始 prompt 存储和显示不应包含追加部分(用户看到的是原始 prompt,但发送给接口的是追加后的)。

在 generation 记录中:
- `prompt` 字段保持用户原始输入
- 新增 `fullPrompt` 或通过 `params.prompt` 字段存储实际发送的完整 prompt

**Why 不污染原始 prompt**:用户收藏的是自己输入的文本,不能带上 quality 后缀。UI 中气泡显示原始 prompt,调试时可查看 fullPrompt。

### D3 — 参考图上传

三种路径统一到同一个入口函数:

```
uploadRefImage(file: File) → assetId: string
```

流程:
1. 读取文件 → `URL.createObjectURL` 预览(或直接走 AssetImage)
2. `await putAsset({ blob, mime, name, source: 'reference-uploaded' })` 入库
3. 获取返回的 `assetId`
4. `addReference(assetId)` 加入 Composer 参考图列表

**支持的输入方式**:

| 方式 | 触发 | 实现 |
|------|------|------|
| 文件选择 | Composer 参考图区"📎"按钮 → `<input type="file" accept="image/*">` | file input click |
| 剪贴板粘贴 | Ctrl+V / Cmd+V 时检测剪贴板含图片 | `paste` 事件 → `clipboardData.items` |
| 拖放(DnD) | 从素材库面板拖图片到参考图区 | dragstart + drop 事件,传递 assetId |

### D4 — 拖放(DnD)从素材库到 Composer

素材库面板(AssetPanel 或类似)每张图片可拖拽(draggable)。拖拽数据格式:JSON string `{ assetId: string }`。

Composer 参考图区作为 drop target:
- `dragover` → `preventDefault()` 显示拖放提示(边框高亮)
- `drop` → 解析 dataTransfer,调用 `addReference(assetId)`
- 如果该 asset 已经是参考图,不重复添加

### D5 — UI 走 ui-ux-pro-max

沿用设计 token,按钮组用 `.btn-group` 风格,无圆形按钮或 emoji。上传和 DnD 用 SVG 图标(paperclip, plus)。

## 数据流

```
用户选择 16:9 + 2K
  → Composer 计算 size = "2048×1152"
  → store.generate({ prompt, refImageIds, params: { size, n } })
  → 内部追加 quality prompt → fullPrompt = prompt + ", high detail, sharp focus"
  → runGeneration({ prompt: fullPrompt, ... })
  
用户粘贴/上传图片
  → readAsBlob → putAsset(blob, 'reference-uploaded')
  → addReference(assetId)
  → (与普通参考图同路)
  
用户从素材库拖图片
  → dragstart { assetId }
  → drop → addReference(assetId)
```
