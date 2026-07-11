# Tasks

> 约束:UI/UX 实现走 `ui-ux-pro-max` 技能(design D6),沿用现有中性灰+蓝 token,危险操作用告警色,不用 emoji 图标(新增 SVG trash 图标)。

## 1. 连带删除:引用感知判定(asset-library)

- [x] 1.1 `assetRepo.js` / 新工具:给定"要删的产出图集合"与"删除后存活的 generations",算出真正可删的产出图(未收藏 且 未被存活记录 refImageIds 引用)
- [x] 1.2 参考图永不参与连带删除(仅产出图 outputImageIds 参与判定)
- [x] 1.3 单元测试:收藏保留 / 被引用保留 / 未收藏无引用才删 / 参考图不删

## 2. 删除单条生成 + 可撤销(image-generation)

- [x] 2.1 store:deleteGeneration action —— 延迟提交(内存移除 + setTimeout 落库),暴露撤销句柄
- [x] 2.2 落库回调里执行 `deleteGeneration` + 按 §1 连带删产出图
- [x] 2.3 撤销:清定时器 + 恢复内存条目,不触碰素材
- [x] 2.4 `ResultsView.vue`:回复卡操作区加删除按钮;撤销 toast(几秒窗口)

## 3. 删除会话 + 落点(conversation-history)

- [x] 3.1 store:deleteConversation(id) —— 批删该会话所有 generation(按 §1 连带删图)
- [x] 3.2 删当前会话后切到最近的其他会话;无则新建空会话
- [x] 3.3 `SideBar.vue`:会话项悬浮/右键菜单;删除走确认弹窗
- [x] 3.4 删除会话时清除其标题覆盖(见 §4)

## 4. 重命名会话(conversation-history)

- [x] 4.1 标题覆盖存 localStorage `workbench.convTitles` 映射
- [x] 4.2 `conversations.js`:deriveConversations 读覆盖表,覆盖标题优先于派生首句
- [x] 4.3 store:renameConversation(id, title);会话菜单加"重命名"入口
- [x] 4.4 单元测试:覆盖标题优先;删除会话清除覆盖项

## 5. 清空全部(asset-library + image-generation)

- [x] 5.1 repo:批量清空 generations 与 assets(保留 presets/activePresetId/Key)
- [x] 5.2 store:resetWorkbench action;清空标题覆盖表
- [x] 5.3 存储与备份抽屉:清空全部入口 + 确认弹窗(标注"不可逆")

## 6. 图标与视觉(ui-ux-pro-max)

- [x] 6.1 `AppIcon.vue`:新增 trash SVG 图标
- [x] 6.2 确认弹窗组件 / 撤销 toast:走设计系统,危险操作告警色

## 7. 验证

- [x] 7.1 单元测试全绿(连带删除判定、标题覆盖)
- [x] 7.2 `npm run build` 通过
- [x] 7.3 浏览器实测:删会话(含删当前会话落点)、删单条+撤销、清空全部、重命名、被引用图不误删
