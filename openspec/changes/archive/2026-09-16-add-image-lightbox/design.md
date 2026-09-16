## Context

`ImageLightbox.vue` 已是点击图后弹出的全屏预览,但只做静态展示。本次补齐缩放/平移/复制与相邻切换。

## Goals / Non-Goals

**Goals**
- 能看清细节:缩放、平移、复位。
- 便于复用:复制提示词、复制图片。
- 多图可连续浏览。

**Non-Goals**
- 不做图片编辑/裁剪。
- 不做多图对比布局。

## Decisions

### D1:缩放范围 1x–4x,变换在内层 stage
`MIN_SCALE = 1`、`MAX_SCALE = 4`;`transform` 施加在 `AssetImage` 外层 `stage`(组件是多根节点,样式不透传到 `<img>`)。缩回 1x 时一并清位移,避免图停在画面外。

### D2:指针捕获平移
放大后拖拽平移,`setPointerCapture` 保证指针移出元素仍持续跟随;未放大时不平移,双击切换缩放/复位。

### D3:复制走剪贴板 API,失败降级提示
复制提示词用 `navigator.clipboard.writeText`,复制图片用 `ClipboardItem`;不支持时提示改用下载,不静默失败。

### D4:相邻切换复用列表
由调用方传入相邻图 `list`,预览内用 `←` `→` 或按钮切换;`+` `-` `0` 控制缩放/复位。

## Risks / Trade-offs

- **剪贴板图片兼容性**:部分浏览器不支持写图片。权衡:检测能力并给出降级提示(下载),不强行实现。

## Migration Plan

无数据迁移。
