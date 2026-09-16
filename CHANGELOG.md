# Changelog

本项目的所有重要变更都会记录在此文件。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added
- **CI 质量门**：新增 `ci.yml`，PR 与 push 均运行 `npm run check`（lint + 单测 + 构建）与 Playwright E2E。
- **界面 i18n**：接入 `vue-i18n`，支持中/英切换并持久化，默认按浏览器语言探测；
  覆盖全部视图组件（外壳、侧栏、输入区、结果流、素材库、接口设置、数据保护、搜索、大图预览与各弹窗）
  以及 `lib` 层文案（接口/网络/鉴权错误、导入校验、素材来源标签、默认命名、生成状态与日期分组），
  共 481 条文案键。错误引导改按分类判断（`failureCategory` / `lastErrorKind`），不再依赖中文文案匹配。
- **站点元信息**：`index.html` 补充 Open Graph / Twitter 卡片、canonical 与 robots；
  新增 `public/robots.txt`、`public/sitemap.xml` 与 `public/og.png`。
- **文档**：新增 `CONTRIBUTING.md`、`CHANGELOG.md` 与 `docs/architecture.md`。
- **代码规范工具**：接入 ESLint（flat config + `eslint-plugin-vue`）与 Prettier，新增 `npm run format`。

### Changed
- `deploy.yml` 的部署前校验统一为 `npm run check`（此前只跑测试与构建）。
- `package.json` 增加 `engines.node >= 20`，新增 `.nvmrc`。

### Removed
- 移除未使用的组件 `SideDrawer.vue` 与死代码导出（`objectUrl.releaseAll`、
  `presets.isMissingKey`、store 的 `defaultProtocolLabel` 及若干未使用 getter/局部变量）。

## [0.1.0] - 2026-07-11

首个可用版本：一个纯前端、零后端的 AI 绘画工作台。

### Added
- 标准 OpenAI `images` 协议适配（`generations` / `edits` 自动路由），支持任意兼容接口。
- 参考图 / 多轮改图（单次最多 16 张，支持拖拽与键盘排序）；多张参考图随请求发送。
- 生成队列（单通道、内存排队上限 5 单，排队项记住发起上下文）。
- 消息可编辑并重新生成；编辑框自适应高度、可拖拽调整。
- 删除可撤销：单条生成 / 素材批次 / 会话 / 工作区均有 5 秒撤销窗口，并做引用感知保护。
- 大图预览：滚轮缩放、双击缩放/还原、平移、复制提示词与图片。
- 本地素材库：Blob 存 IndexedDB，元数据与字节分离、一图多处复用，来源可区分与筛选。
- 工作区、会话历史与统一搜索（`Ctrl/⌘ K`）；移动端导航抽屉与素材库入口。
- 收藏 Prompt 库；空状态灵感标签；批量数量核对告警。
- 存储管理：用量查看、一键清除凭据、整库 zip 导入/导出、备份提醒。
- 备份与分享（均不含 API Key）：整库导出/导入、接口预设分享、单次生成配方分享。
- 设计系统（design tokens，深/浅双主题）、Vue 3 + Pinia + Vite 技术栈、
  Vitest 单元测试与 Playwright E2E。

[Unreleased]: https://github.com/MY-Final/draw/commits/main
[0.1.0]: https://github.com/MY-Final/draw/releases
