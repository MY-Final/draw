## Why

当前应用只有一个扁平的"会话"组织层级,所有生成记录按时间顺序堆在一起。半个月后想找一张特定主题的图只能靠翻,素材库也是全局一锅端。

用户需要**项目级组织**:把生成、素材、参考图、Prompt 收藏全部归到一个"工作区"(项目)下。同时需要一个**统一搜索入口**,像 VSCode 的 ⌘K 那样跨所有数据源搜索,让找回内容像打字一样简单。

## What Changes

### 1. 工作区(Project)

新增一级组织层级:工作区(Workspace)。一个工作区包含:
- **会话**(Conversations) — 聊天流,和现在一样按时间倒序
- **素材**(Assets) — 归属于该工作区的图片(含生成图和上传的参考图)
- **Prompt 收藏** — 归属于该工作区的 prompt 模板
- **设置** — 工作区名称、默认参数等

当前所有数据自动归入一个"默认工作区"。用户可新建、重命名、删除工作区。

切换工作区时,中间对话流和右侧素材库全部刷新。

### 2. 统一搜索(Unified Search)

一个搜索入口(⌘K / Ctrl+K 快捷键),模态框覆盖全应用。
搜索范围跨所有工作区:
- 工作区名称
- 会话内生成记录的 prompt
- 素材文件名/ID
- 参考图文件名/ID
- 收藏的 prompt 文本

结果按类型分组,键盘上下选择,回车跳转。

## Capabilities

### New Capabilities
- `workspace`: 工作区 CRUD,工作区级会话/素材/Prompt 隔离
- `unified-search`: 跨数据源的统一搜索引擎(⌘K 面板)

### Modified Capabilities
- `conversation-history`: 会话列表改为按工作区分组显示
- `asset-library`: 素材按工作区过滤
- `prompt-library`: prompt 按工作区过滤
- `image-generation`: 生成时标记所属工作区

## Impact

- 新增 `src/stores/workspace.js` 或集成到现有 store
- IndexedDB 新增 `workspaces` 表
- `generations` 和 `assets` 加 `workspaceId` 字段
- `SideBar.vue` 重构:工作区树 + 会话折叠
- `ResultsView.vue` / `LibraryPanel.vue` 按工作区过滤
- 新增搜索组件 `UnifiedSearch.vue`(模态框 + 键盘导航)
- 数据迁移:首次升级自动建默认工作区,现有数据全部迁入
