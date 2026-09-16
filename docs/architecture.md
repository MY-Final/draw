# 架构说明

本文件展开 README 中的「架构要点」，说明数据如何在浏览器内流动、各模块职责边界，
以及为什么这样设计。所有内容都以本仓库为准；能力级别的约束见 [`openspec/specs/`](../openspec/specs)。

## 总览

纯前端、零后端：没有服务端进程，也没有账号体系。浏览器直接调用用户自己填入的
OpenAI / NewAPI 兼容接口，图片与历史落在本机 IndexedDB，轻量偏好落在 localStorage。
产物是纯静态资源，可托管到任意静态服务器。

```
┌─────────────────────────── 浏览器 ───────────────────────────┐
│                                                              │
│  Vue 3 组件层 (src/components)                                │
│    Composer / ResultsView / SideBar / LibraryPanel / ...     │
│              │  读写状态                                      │
│              ▼                                                │
│  Pinia store (src/stores/workbench.js)  ← 单一状态源          │
│              │  调用                                          │
│              ▼                                                │
│  逻辑 / 持久化层 (src/lib)                                     │
│    generationService → adapters → http → 接口                 │
│    assetRepo / generationRepo / workspaceRepo → IndexedDB     │
│    presets / promptLibrary / backupReminder → localStorage    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                    │ HTTPS（用户自带的 Base URL）
                    ▼
             OpenAI / NewAPI 兼容接口
```

## 数据模型

核心是**把「图」和「生成事件」拆开**：

- `assets`：图片 Blob + 元数据，按 id 存两份记录（字节与元数据分离，便于只读元数据）。
  同一张图可被多处引用而不重复占用空间。
- `generations`：一次生成请求的事件记录（prompt、参数、状态、引用的 assetId、
  参考图 id、耗时、错误分类、原始响应片段等）。
- `workspaces`：工作区；`generations` / `assets` 都带 `workspaceId`。
- `conversations` 不落库，由 `generations` 现场派生（`src/lib/conversations.js`），
  标题的手动覆盖另存于 localStorage。

这样设计的好处：删除一张素材时能通过引用关系判断是否还有历史记录在用，
避免删出「裂图」；会话只是视图分组，不需要额外的同步逻辑。

## 适配层与请求

`src/lib/adapters.js` 提供统一的 `generate()`：

- 无参考图 → `POST /v1/images/generations`
- 有参考图 → `POST /v1/images/edits`（单次最多 16 张）

响应解析对多种返回形态保持宽容（`b64_json`、`url`、数组或对象包装），
尽量不因中转站差异而丢图。`src/lib/http.js` 负责 fetch 封装、超时信号合并、
以及把失败归类为 CORS/网络、鉴权、接口错误等（错误分类有单元测试锁定）。

## 生成管线与队列

`src/lib/generationService.js` 串起一次生成：

1. 先写入一条 `pending` 记录并上屏（即时反馈）；
2. 调适配层拿图，把 Blob 经 `assetRepo` 落库；
3. 回填 `generations` 状态（成功 / 失败 / 取消 / 超时 / 刷新中断）。

调度层（store）保证**单通道**：同一时间只跑一个请求，其余进入内存队列（上限 5 单）。
排队项会记住发起时的 `workspaceId` / `conversationId`，用户中途切走上下文也不会把结果落错会话。
队列只存在于当前页面内存，刷新即清空。

## 删除与撤销

单个生成、素材批次、会话、工作区的删除都走**延迟落库 + 5 秒撤销**：
窗口期内只从界面（内存）移除，IndexedDB 数据仍在；撤销即恢复，窗口内刷新等于放弃删除。
素材删除前会做引用感知检查，仍被历史记录引用的素材会被阻止并说明原因。

## 存储与内存

- 图片以 Blob 存 IndexedDB（`src/lib/db.js`，含版本迁移）。
- 显示时统一走 `src/lib/objectUrl.js` 的引用计数 ObjectURL 缓存，集中创建与释放，避免长时间运行泄漏。
- localStorage 只放轻量偏好：接口预设、主题、会话标题覆盖、Prompt 库、备份提醒状态等。

## 备份与分享

`src/lib/share.js` 统一处理所有导入 / 导出：

- 整库 zip 导出 / 导入（换机迁移，合并策略，同 id 覆盖）。
- 接口预设分享。
- 单次生成「配方」分享（含参考图，不含 Key）。

**凭据不变量**：所有分享级导出强制经 `stripKey()` 剥离 API Key，并有测试锁定。
API Key 在纯前端下只能明文存 localStorage，界面提供「一键清除凭据」。

## 目录结构

```
src/
  App.vue                根壳：三栏布局、移动端抽屉、全局快捷键、启动/错误屏
  main.js                应用引导（Vue + Pinia）
  components/            视图组件（Composer/ResultsView/SideBar/LibraryPanel/...）
  composables/           可复用组合式逻辑（useDialogA11y：焦点陷阱与 Escape）
  lib/                   逻辑与持久化层（见上）
  lib/__tests__/         Vitest 单元测试（node + fake-indexeddb）
  stores/workbench.js    唯一 Pinia store：状态 + 动作
  styles/tokens.css      设计 token、深/浅主题、基础样式
tests/e2e/               Playwright 冒烟测试（桌面 + 移动端）
scripts/lint.mjs         合并标记与语法检查
openspec/specs/          能力规格（需求级约束）
```

## 测试策略

- **单元测试**：`src/lib/__tests__/`，覆盖端点路由、响应解析、取消/超时分类、
  队列上下文、删除撤销语义、引用感知删除、分享脱敏、Prompt 库、会话派生等。
- **端到端**：`tests/e2e/`，桌面端 1440×900 与移动端 390×844，覆盖初始化、
  工作区切换、队列与取消、参考图键盘排序、导入反馈、弹窗焦点与移动端布局。
- **CI**：PR 与 push 均跑 `npm run check`（lint + 单测 + 构建）与 Playwright E2E。

## 设计取舍

- **不做服务端代理**：以「接口允许跨域」为前提，换取零后端与数据不出本机。
- **单通道生成**：图片生成本就慢，排队比并发更容易解释与控制。
- **延迟删除 + 撤销**：优于每次破坏性操作都弹确认框。
- **会话派生而非存储**：减少一份需要维护一致性的状态。
