# Workspace (New Capability)

## 概述

工作区是**一级组织容器**,位于会话之上。一个工作区对应一个创作项目(如"品牌 Logo""小说封面")。
每个工作区包含若干会话、归属于该项目的素材和 prompt 模板。

## 数据模型

### IndexedDB: `workspaces` 表

```ts
interface Workspace {
  id: string           // crypto.randomUUID()
  name: string         // 用户可重命名
  createdAt: number    // Date.now()
  updatedAt: number    // Date.now()
  settings?: {
    defaultRatio?: string     // '1:1' | '16:9' | ...
    defaultResolution?: string // '1k' | '2k' | '4k'
    defaultN?: number
  }
}
```

### 现有表的扩展

**generations** 增加顶层字段 `workspaceId: string`。
**assets** 增加顶层字段 `workspaceId: string`。
**promptLibrary** 的 localStorage key 改为 `workbench.savedPrompts.<workspaceId>`。

### 向后兼容

无 `workspaceId` 的记录 → 视为属于默认工作区 `ws_default`。

## 操作

### 新建
- 用户点击侧栏"＋新建工作区"
- 弹出命名输入框(或直接创建"未命名工作区",可随后重命名)
- 创建空工作区:无会话、无素材、空 prompt 列表

### 切换
- 点击侧栏工作区名 → 展开/折叠会话列表
- 双击(或点击工作区名左侧图标) → 切到该工作区
- 切换行为见 D6

### 重命名
- 工作区 `⋯` 菜单选择"重命名"
- 内联输入框,同现有会话重命名交互

### 删除
- 工作区 `⋯` 菜单选择"删除工作区"
- 确认对话框(同现有会话删除),警告:该工作区下所有生成和素材会被删除
- 执行:删除 workspace 记录 + 删除所有 `workspaceId` 匹配的 generation + 删除所有 `workspaceId` 匹配的 asset + 清除 prompt 收藏

### 渲染(侧栏)
- 工作区列表按 `updatedAt` 倒序
- 展开状态按会话的 `lastAt` 倒序
- 当前工作区有视觉标识(圆点或高亮背景)

## 数据迁移

store `init()` 时检测:

```ts
const workspaces = await listWorkspaces()
if (workspaces.length === 0) {
  const defaultWs = await createWorkspace({ name: '我的工作区' })
  // 为所有无 workspaceId 的 generation 和 asset 打标
  await migrateLegacyData(defaultWs.id)
  // 迁移 prompt 收藏
  migrateLegacyPrompts(defaultWs.id)
}
```

迁移函数应幂等(只处理 `workspaceId` 为空/未定义的记录)。
