## Context

编辑入口在 `ResultsView.vue` 用户气泡内联展开(`editingGenId`)。`autogrowEdit` 在进入编辑与输入时按 `scrollHeight` 量高,上限约 80% 视口;`.bubble-edit-input` 另有 `min-height: clamp(200px, 35vh, 360px)` 保底。两者叠加后用户只能被动接受高度。stash 中曾有一版未完成的把手 WIP(仅有指针拖拽、且下限 96px 与 CSS 保底冲突),本次把它做完整。

## Goals / Non-Goals

**Goals**
- 让用户能主动压缩/展开编辑框,且操作同时支持指针与键盘。
- 手动高度不破坏既有自动增高与保底高度的行为。

**Non-Goals**
- 不做高度跨编辑/跨会话记忆(编辑是临时态,重进即自适应)。
- 不做宽度调整或等比缩放。
- 不改生成、存储与请求逻辑。

## Decisions

### D1:手动高度用 `manualEditHeight` 标记,自动增高让位
`autogrowEdit` 在 `manualEditHeight.value != null` 时直接返回;`startEdit` 复位为 `null`。手动高度通过 textarea 的 inline `height` 生效,该 inline 样式在文本区被销毁时自然清除,重进编辑时再显式清空一次以防复用。

### D2:上下限复用现有设计值
下限取 `getComputedStyle(el).minHeight`(即现有 `clamp(200px, 35vh, 360px)` 的解析 px 值),避免与 CSS 保底打架(否则拖到 96px 仍被 CSS 顶回,产生"手柄没反应"的错觉);上限取 80% 视口高,与自动增高封顶一致。

### D3:指针 + 键盘双通道
把手是 `<button type="button">`。指针:`pointerdown` 时记录起始高度并 `setPointerCapture`,元素样式 `touch-action: none` 防止触摸拖动时滚动页面;`preventDefault` 抑制拖拽期间的文本选中。键盘:`↑`/`↓` 以当前高度为基准调整 24px,并 `preventDefault` 阻止页面滚动。

## Risks / Trade-offs

- **手动高度不持久**:离开编辑即复位。权衡:编辑是临时态,持久化收益低、实现与心智成本高,故不做。
- **保底高度偏高**:桌面端编辑框最低约 200px。这是既有设计,本次不改,仅保证拖拽下限与其一致。

## Migration Plan

无数据迁移。纯前端交互增强,上线即生效。

## Open Questions

- 是否需要"双击把手复位为自动"?暂不做,重新进入编辑即可复位;若后续有诉求再单开 change。
