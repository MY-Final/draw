# Prompt Library (New Capability)

## 概述

用户可收藏 prompt 文本模板到本地,并在 Composer 中一键填入,减少重复输入。纯文本,不关联图片或生成事件。

## 存储

localStorage key `workbench.savedPrompts`, JSON 序列化 `SavedPrompt[]`:

```ts
interface SavedPrompt {
  id: string        // crypto.randomUUID()
  text: string      // prompt 文本
  createdAt: number // Date.now()
}
```

不进 IndexedDB(纯文本无需 Blob)。导出/导入暂不耦合,后续可附加到 zip。

## 操作

### 收藏(create)
- Composer 输入框右侧加 ⭐ 按钮
- 输入框非空时按钮亮色可点
- 点击:以当前 prompt 文本创建 `SavedPrompt`,写入 localStorage
- 去重:若已有完全相同的 text,toast 提示"已收藏过",不重复添加

### 浏览(list + fill in)
- 点击 ⭐ 按钮展开一个小弹出面板(Popover),列出所有已收藏 prompt
- 每项显示 prompt 文本(单行截断,超出省略)
- 点击某一行:以该 prompt **替换**输入框当前内容(不是追加)
- 若 popover 已打开再点 ⭐ 则关闭

### 删除(delete)
- 每项右侧 × 按钮,点击删除该项
- 无确认弹窗,直接删除(可依据设计原则做撤销,但 prompt 删除不常发生,直接删即可)

### 空状态
- 无收藏时 popover 内显示"暂无收藏的 prompt"
- ⭐ 按钮变灰(非空时才亮)

## UI 位置

Composer 区域,输入框与发送按钮之间。参考:

```
[ 输入框                               ] [⭐] [发送]
```

⭐ 按钮:

| 状态   | 表现 |
|--------|------|
| 输入框为空 | 灰色,点击无反应或弹出空面板 |
| 输入框非空 | 主色(蓝),可收藏 |
| popover 打开 | 反转/高亮状态 |

Popover 样式:
- 与输入框同宽或略窄,悬浮在输入框上方
- max-height 200px,超出滚动
- 分隔:每项 border-bottom + hover 背景
- × 删除按钮在右侧,小尺寸

## 影响

- 新增 `src/lib/promptLibrary.js`(5 个函数:load/save/add/remove/getAll)
- 修改 `src/components/Composer.vue`(加 ⭐ 按钮 + popover + 交互逻辑)
- 不依赖 store(纯 localStorage 工具函数),但也可考虑在 store 里加 `savedPrompts` 响应式状态(看需要)

## 边界

- prompt 文本过长(>500 字):收藏完整文本,列表中截断显示,填入时全量填入
- 空文本:不允许收藏,按钮灰色
- 极端大量(>100 条):列表按时间倒序,显示最新 50 条,但存储全部
