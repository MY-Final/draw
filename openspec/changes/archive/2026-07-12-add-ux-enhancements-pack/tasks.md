# Tasks

## T1 — GitHub 仓库链接

- [x] 在 `SideBar.vue` 底部导航区(存储与备份之后、接口设置之前)添加 GitHub 链接
- [x] SVG 图标使用 github 图标(AppIcon 或内联 SVG),标签"GitHub"
- [x] `target="_blank" rel="noopener noreferrer"` 打开 `https://github.com/MY-Final/draw`
- [x] 如有必要,在 `AppIcon.vue` 或图标系统中注册 github 图标

## T2 — README 一键部署徽章

- [x] 在 README 部署节之后追加"## 一键部署"小节
- [x] Vercel 一键部署按钮: Markdown 链接 `https://vercel.com/new/clone?repository-url=https://github.com/MY-Final/draw` + SVG 徽章
- [x] Netlify 一键部署按钮: Markdown 链接 `https://app.netlify.com/start/deploy?repository=https://github.com/MY-Final/draw` + SVG 徽章
- [x] 两个徽章并排,样式统一(shield.io 风格)

## T3 — 生成中随机文案

- [x] 在 `generationService.js` 或一个 constant 文件中定义 `STATUS_MESSAGES` 数组(7 条中文文案)
- [x] 在创建 pending generation 时随机选一条写入 `statusMessage` 字段
- [x] `ResultsView.vue` 中 "生成中" badge 文案从固定改为显示 `gen.statusMessage`

## T4 — Prompt 收藏(localStorage CRUD)

- [x] 新增 `src/lib/promptLibrary.js`,导出 `loadPrompts()`, `savePrompts()`, `addPrompt(text)`, `removePrompt(id)`, `getAllPrompts()`
- [x] `addPrompt`:若 text 已存在则返回 `{ ok: false, reason: 'duplicate' }`,否则添加并保存
- [x] `src/components/Composer.vue` 输入框右侧加 ⭐ 按钮
- [x] ⭐ 按钮:输入框非空时亮色可点;空时灰色
- [x] 点击 ⭐ 展开 popover,列出已收藏 prompt(最多显示 50 条,时间倒序)
- [x] popover 内每项可点击填入输入框(替换当前内容),右边 × 删除按钮
- [x] 空状态显示"暂无收藏的 prompt"
- [x] popover 打开时再点 ⭐ 关闭
- [x] popover 点击外部关闭(click-outside 指令或监听)
