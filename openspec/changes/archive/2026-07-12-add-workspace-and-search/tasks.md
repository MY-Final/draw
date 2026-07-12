# Tasks

## T1 — IndexedDB schema:新增 workspaces 表 + generations/assets 加 workspaceId

- [x] `src/lib/db.js` 中新增 `workspaces` 表定义,bump schema 版本号
- [x] `src/lib/workspaceRepo.js` 新增: `listWorkspaces`, `createWorkspace`, `updateWorkspace`, `deleteWorkspace`
- [x] `generationRepo.js` 的 `createGeneration` 支持 `workspaceId` 参数
- [x] `assetRepo.js` 的 `putAsset` 支持 `workspaceId` 参数
- [x] 现有 generations/assets 的 `workspaceId` 为空时向后兼容

## T2 — Store:工作区状态与操作

- [x] `workbench.js` store 新增 `workspaces`, `activeWorkspaceId` 状态
- [x] store actions: `initWorkspaces`(含数据迁移), `createWorkspace`, `renameWorkspace`, `deleteWorkspace`, `switchWorkspace`
- [x] `switchWorkspace` 动作:更新 activeWorkspaceId,重置 conversationId,清空 Composer
- [x] 派生 getter: `currentWorkspace`, `workspaceConversations`, `workspaceAssets`

## T3 — 数据迁移

- [x] 检测首次运行:workspaces 表为空时自动创建默认工作区"我的工作区"
- [x] 迁移:为所有无 workspaceId 的 generation 设置 workspaceId = ws_default
- [x] 迁移:为所有无 workspaceId 的 asset 设置 workspaceId = ws_default
- [x] 迁移:复制现有 promptLibrary 到 `workbench.savedPrompts.ws_default`
- [x] 幂等:检测条件确保只跑一次

## T4 — 左侧栏重构:工作区树

- [x] SideBar.vue 会话列表区域改造:工作区 → 折叠会话列表
- [x] 顶部"新建创作"改为"新建工作区"
- [x] 工作区名前图标(📁 SVG),展开/折叠箭头
- [x] 当前工作区高亮/圆点标识
- [x] 工作区 `⋯` 菜单:重命名/删除(含确认对话框)
- [x] 内联重命名输入(同现有会话重命名)
- [x] 点击工作区名展开会话;点击会话切换(同现有)

## T5 — 素材库按工作区过滤

- [x] `LibraryPanel.vue` 显示的 assets 按 `workspaceId === activeWorkspaceId` 过滤
- [x] 切换工作区时素材库自动刷新
- [x] 新上传的参考图自动带有当前工作区 workspaceId

## T6 — Prompt 收藏按工作区隔离

- [x] `promptLibrary.js` 的 key 改为 `workbench.savedPrompts.<workspaceId>`
- [x] 切换工作区时 prompt popover 显示对应列表
- [x] 上层 Composer.vue 无需改动(已用 getAllPrompts/addPrompt/removePrompt)

## T7 — 统一搜索组件(⌘K)

- [x] 新建 `src/components/UnifiedSearch.vue`
- [x] 模态框样式:居中浮层 + 半透明遮罩 + 搜索输入框
- [x] 键盘快捷键 ⌘K/Ctrl+K 全局监听(在 App.vue 或顶层)
- [x] 搜索逻辑:遍历 workspaces/conversations/prompts/assets,按类型分组
- [x] 结果渲染:分组标题 + 图标 + 结果列表 + 选中高亮
- [x] 键盘导航:↑↓ 移动选中,Enter 跳转,Esc 关闭
- [x] 跳转行为:工作区→switchWorkspace,会话→switchWorkspace+switchConversation, prompt→填入 Composer,asset→预览
- [x] 无结果状态:"未找到匹配结果"
- [x] 输入防抖 200ms
