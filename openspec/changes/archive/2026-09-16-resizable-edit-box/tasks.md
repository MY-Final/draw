# Tasks

## 1. 编辑框手动高度(ResultsView.vue)
- [x] 1.1 新增 `manualEditHeight` / `editResizing` 状态与 `applyEditHeight()`(在保底高度 ~ 80% 视口高之间取钳)
- [x] 1.2 `autogrowEdit` 在存在手动高度时让位;`startEdit` 复位手动高度并清空 inline height
- [x] 1.3 新增指针拖拽处理(`onResizeStart/Move/End`,`setPointerCapture`,`preventDefault`)
- [x] 1.4 新增键盘处理(`onResizeKey`,`↑`/`↓` 每次 24px)

## 2. 模板与样式
- [x] 2.1 文本区下方新增把手按钮(`aria-label` + `title` 说明可拖动/方向键)
- [x] 2.2 补 `.bubble-edit-resize` / `.bubble-edit-grip` 样式,含 hover / focus-visible / 拖拽态与 `touch-action: none`

## 3. 验证
- [x] 3.1 `npm run lint` 通过
- [x] 3.2 `npm test` 通过
- [x] 3.3 `npm run build` 通过
- [x] 3.4 手动高程后继续输入不再自动增高;重进编辑复位为自适应(源码复核)
