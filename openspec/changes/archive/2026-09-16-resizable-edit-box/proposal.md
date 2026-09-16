## Why

编辑历史 Prompt 时,编辑框只靠 `autogrowEdit` 随内容被动增高:长 prompt 展开后占据很大高度,而编辑框本身的 CSS 保底高度又让短 prompt 显得空旷。用户无法按自己的习惯压缩或展开编辑区,想对照上下文中其他结果时被编辑框挤占。缺一个把手,也让"编辑"这一高频操作少了主动控制空间。

## What Changes

- 编辑框新增**拖拽把手**:按住并上下拖动可手动调整编辑框高度,手动高度接管自动增高。
- 把手同时支持**键盘**:聚焦后用 `↑` / `↓` 调节高度(每次 24px),并在 hover / 聚焦 / 拖拽中有明确视觉反馈。
- 手动高度**只在本次编辑内生效**:取消或重新进入编辑时复位为"随内容自适应"。
- 高度被限制在编辑框**保底高度**(现有 CSS `min-height` 的解析值)与约 **80% 视口高**之间,不产生越界或抖动。

## Capabilities

### New Capabilities
<!-- 无新增能力 -->

### Modified Capabilities
- `image-generation`:「编辑历史 Prompt」补充"编辑框高度可调"的行为要求(默认随内容自适应,提供把手可手动调整并优先于自动增高,重进编辑复位)。

## Impact

- `src/components/ResultsView.vue`:编辑态新增把手按钮与手动高度状态(`manualEditHeight` / `editResizing`),`autogrowEdit` 在手动高度存在时让位;新增指针拖拽与键盘处理;`.bubble-edit-*` 样式补充把手。
- 无数据迁移、无接口改动:纯前端交互增强,不影响生成记录与存储结构。
