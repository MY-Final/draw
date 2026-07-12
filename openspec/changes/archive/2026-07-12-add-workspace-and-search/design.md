# Design — add-workspace-and-search

## 决策

### D1 — 数据模型:Workspace 作为顶层容器

```
Workspace
├── id: string (crypto.randomUUID())
├── name: string
├── createdAt: number
├── updatedAt: number
└── settings: { defaultRatio?, defaultResolution?, defaultN? }
```

存储:IndexedDB 新增 `workspaces` 表(与 `generations` / `assets` 同级)。

**引用方式**:generations 和 assets 各自增加一个顶层字段 `workspaceId: string`。

```
Generation {
  ...existing fields,
  workspaceId: string  // NEW
}

Asset {
  ...existing fields,
  workspaceId: string  // NEW
}
```

### D2 — 素材归属:跟工作区走(A 方案)

每个工作区有独立的素材池。Assets 的 `workspaceId` 决定它在哪个工作区可见:
- `LibraryPanel.vue` 只显示 `workspaceId === activeWorkspaceId` 的素材
- 切换工作区时右侧素材库完全刷新

**例外**:跨工作区复用作品?初期不做。用户可在工作区之间手动下载再上传。

### D3 — Prompt 收藏:按工作区隔离

当前 `promptLibrary.js` 用 localStorage key `workbench.savedPrompts` 存全局列表。
改为按工作区存储,key 为 `workbench.savedPrompts.<workspaceId>`。

### D4 — 数据迁移

首次加载检测:如果 IndexedDB 中没有 `workspaces` 表,或 `workspaces` 表为空:
1. 自动创建默认工作区(id = `ws_default`, name = "我的工作区")
2. 将所有现有 generations(无 `workspaceId` 或 `workspaceId === undefined`)的 `workspaceId` 设为 `ws_default`
3. 将所有现有 assets 的 `workspaceId` 设为 `ws_default`
4. 将现有 promptLibrary 内容复制到 `workbench.savedPrompts.ws_default`

迁移是一次性的,幂等(检测目标表是否存在)。

### D5 — 左侧栏:工作区树

```
┌─────────────────────┐
│  ＋ 新建工作区        │
├─────────────────────┤
│ 📁 我的工作区 ●      │ ← 当前工作区(圆点标识)
│   ├ 会话 1           │
│   ├ 会话 2           │
│   └ 会话 3           │
│ 📁 品牌 Logo         │
│   ├ Logo v1          │
│   └ Logo v2          │
├─────────────────────┤
│ 存储与备份 / 接口设置  │
│ GitHub / 主题切换     │
└─────────────────────┘
```

交互:
- 点击工作区名:展开/折叠该工作区的会话列表
- 点击会话:切到该会话(同现在)
- 右键或 `⋯` 菜单:重命名工作区 / 删除工作区
- 工作区名前显示文件夹图标,当前工作区右侧有 ● 标识

### D6 — 切换工作区行为

切换工作区:
1. `activeWorkspaceId` 更新
2. `conversationId` 重置为该工作区内最新会话(或新建)
3. 中间 ResultsView 刷新(只显示该 workspace 的 generations)
4. 右侧素材库刷新(只显示该 workspace 的 assets)
5. Composer 清空参考图
6. Prompt 收藏 popover 切换为该工作区的列表

### D7 — 统一搜索(⌘K 面板)

**触发方式**:
- 键盘:⌘K(macOS) / Ctrl+K(Windows)
- 也可在界面某个位置点一下(比如顶部栏加一个搜索图标)

**UI**:

```
┌─────────────────────────────────────┐
│  🔍 搜索...                  [⌘K]  │
├─────────────────────────────────────┤
│ 📁 工作区                           │
│   ├ 上海旅游                        │
│   └ 品牌 Logo                       │
│                                     │
│ 💬 会话                             │
│   ├ 画一张上海东方明珠 (上海旅游)     │
│   └ 奶茶海报设计 (品牌 Logo)         │
│                                     │
│ 📝 Prompt                           │
│   ├ 上海 奶茶 海报                   │
│   └ 东方明珠 背景                    │
│                                     │
│ 🖼 素材                             │
│   ├ IMG_0032 (上海旅游)             │
│   └ 东方明珠.png (上海旅游)         │
└─────────────────────────────────────┘
```

**搜索范围与排序**:
- 从所有工作区(不限于当前)中搜索
- 匹配字段:workspace.name / generation.prompt / asset.name / asset.id / prompt text
- 大小写不敏感,支持多关键词(空格分词,全匹配优先)
- 分类排序:工作区 > 会话 > Prompt > 素材
- 每类最多显示 5 条,点击跳转:
  - 工作区:切到该工作区(最近的会话)
  - 会话:切到该工作区 + 该会话
  - Prompt:填入 Composer 输入框(同现有 prompt 收藏点击行为)
  - 素材:预览大图

**实现方式**:
- 纯前端搜索,在内存中全量遍历(数据规模:几百条 generation + 几百张素材,完全够)
- `UnifiedSearch.vue` 组件,浮层/模态框
- 输入防抖 200ms
- 键盘导航:↑↓ 选结果,Enter 确认,Esc 关闭

### D8 — 不涉及接口变更

所有改动在纯前端范围内。IndexedDB 的 schema 版本号需要 bump(新增 workspaces 表、generations 和 assets 加 workspaceId 字段)。
