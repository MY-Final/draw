# 贡献指南

感谢你愿意参与。这个项目是**纯前端、零后端**的 AI 绘画工作台：没有服务器、没有账号，
浏览器直连用户自己的 OpenAI / NewAPI 兼容接口，数据全部留在本机。

## 环境要求

- Node.js **>= 20**（见 `.nvmrc` / `package.json` 的 `engines`）。
- npm（随 Node 附带）。

## 本地开发

```bash
npm install
npm run dev          # 启动 Vite 开发服务器
```

首次使用：点「添加接口」→ 填 Base URL / API Key / 模型 → 测试连接 → 保存 → 生成。

> 开发时若要对真实接口联调，请确保接口允许跨域（CORS），否则浏览器会拦截请求。

## 提交前必须通过

```bash
npm run check        # = lint + 单元测试 + 生产构建
```

单独运行：

```bash
npm run lint         # 合并标记/语法检查 + ESLint
npm test             # Vitest 单元测试
npm run test:e2e -- --workers=1   # Playwright 端到端（自动起 dev server）
npm run build        # 生产构建到 dist/
npm run format       # Prettier 格式化（按需，勿在全库大重排时混入功能改动）
```

CI（`.github/workflows/ci.yml`）会在每个 PR 与 push 上跑 `npm run check` 和 E2E，
两者都绿才允许合入。

## 代码风格

- 遵循现有风格：**无分号、单引号、2 空格缩进**（Prettier 配置见 `.prettierrc.json`）。
- 使用 Vue 3 `<script setup>` + Composition API；状态集中在一个 Pinia store。
- 新增逻辑优先放在 `src/lib/`（纯函数、可测），组件只负责视图。
- 不引入 UI 框架；样式走 `src/styles/tokens.css` 的设计 token，图标用内联 SVG。
- **不要提交 API Key、真实凭据或 `.env`**；所有分享级导出都必须经 `stripKey()` 剥离凭据。

## 提交信息

使用 [Conventional Commits](https://www.conventionalcommits.org/) 前缀，与现有历史保持一致：

```
feat: 新增 XXX
fix: 修复 XXX
docs: 更新 README
refactor: 重构 XXX
chore: 杂项
```

中文或英文均可，描述清楚「做了什么」即可。

## 测试

- 纯逻辑改动请在 `src/lib/__tests__/` 补**单元测试**（Vitest，node 环境 + fake-indexeddb）。
- UI / 交互改动请在 `tests/e2e/` 补或更新 **Playwright** 用例。
- 修复 bug 时尽量补一个能复现该 bug 的测试。

## 规格（OpenSpec）

仓库用 OpenSpec 记录能力级需求，位于 `openspec/specs/`，历史变更在 `openspec/changes/archive/`。
较大的功能建议先写清楚需求与取舍，再动手实现。

## 更多

- 架构与数据流：[`docs/architecture.md`](./architecture.md)
- 变更记录：[`CHANGELOG.md`](./CHANGELOG.md)
- 已知约束与部署方式：见 [`README.md`](./README.md)
