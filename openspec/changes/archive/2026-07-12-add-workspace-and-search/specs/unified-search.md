# Unified Search (New Capability)

## 概述

一个统一搜索入口(⌘K / Ctrl+K),跨所有工作区搜索工作区名、会话 prompt、素材、参考图、收藏的 prompt。结果按类型分组,键盘导航,点击跳转。

## 触发

| 方式 | 说明 |
|------|------|
| ⌘K / Ctrl+K | 全局键盘快捷键 |
| 顶部搜索图标 | 可选的 UI 入口,先不做 |

快捷键在 `App.vue` 或 `ResultsView.vue` 或顶层挂载 `keydown` 监听:
```ts
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    showSearch.value = true
  }
})
```

## UI

### 布局

```
┌──────────────────────────────────────┐
│  🔍 搜索... (input, autofocus)       │
├──────────────────────────────────────┤
│  📁 工作区 (最多 5 条)               │
│    ├ 上海旅游                         │
│    └ 品牌 Logo                        │
│  💬 会话 (最多 5 条)                 │
│    ├ 画一张上海东方明珠               │
│    └ 奶茶海报设计                     │
│  📝 Prompt (最多 5 条)              │
│    ├ 上海 奶茶 海报                  │
│    └ 东方明珠 背景                   │
│  🖼 素材 (最多 5 条)                │
│    ├ IMG_0032                        │
│    └ 东方明珠.png                    │
│                                      │
│  (无结果时: "未找到匹配结果")         │
├──────────────────────────────────────┤
│  ↑↓ 选择 · Enter 跳转 · Esc 关闭     │
└──────────────────────────────────────┘
```

### 样式
- 半透明遮罩(backdrop)
- 搜索框居中偏上,宽度 540px max
- 白底(或 elevation 背景)
- 选中行高亮(primary 色背景)
- 每类结果前有图标区分

### 键盘导航
| 键 | 行为 |
|----|------|
| ↑↓ | 移动选中行 |
| Enter | 跳转到选中项 |
| Esc | 关闭 |
| Backspace(输入为空) | 关闭 |

## 搜索逻辑

### 数据源
```ts
const sources = {
  workspaces: store.workspaces,
  conversations: store.conversations,  // 带 workspace name
  prompts: savedPrompts,               // 从所有工作区收集
  assets: store.assets,                // 带 workspace name
}
```

### 匹配规则
- 大小写不敏感
- 空格分词:每个词都必须在同一字段中匹配(AND 逻辑)
- 匹配字段:
  - workspace: `name`
  - conversation: `title`(派生标题或手动重命名),显示时附 `workspace.name`
  - prompt: `text`
  - asset: `name`, `id`

### 排序
搜索结果按类型优先级排列:
1. 工作区(精确匹配 > 前缀匹配 > 包含匹配)
2. 会话
3. Prompt
4. 素材

同类型内按匹配度:完全匹配 > 前缀匹配 > 子串匹配 > 模糊匹配。

### 跳转行为
跳转时关闭搜索面板,执行对应操作:

| 类型 | 跳转行为 |
|------|----------|
| workspace | 切换到该工作区(最新会话) |
| conversation | 切换到该工作区 + 该会话 |
| prompt | 填入 Composer 输入框(同现有 prompt 收藏) |
| asset | 打开预览大图(ImageLightbox) |

## 组件

`UnifiedSearch.vue` — 独立组件,在 `App.vue` 挂载:

```html
<UnifiedSearch v-if="showSearch" @close="showSearch = false" />
```

Props/Events: 无需 props,直接从 store 读取数据。

## 性能

数据规模:预计 < 100 个工作区,< 1000 条生成,< 2000 张素材。全量内存遍历 + 简单字符串匹配,无性能问题。输入防抖 200ms 即可。
