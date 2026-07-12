## Why

两个体验硬伤 + 一项部署基建:

1. **消息延迟上屏**:点「生成」后,用户的请求气泡要等整次生成完成才出现(因为 `store.generations` 只在末尾 `refreshAll()` 时才更新),输入框也迟迟不清空。对话式界面应当"发出即上屏"。
2. **看不到耗时**:生成快慢无感知,用户不知道等了多久、值不值。
3. **无自动部署**:仓库尚未初始化,也没有 CI;希望 push 即自动构建并发布到 GitHub Pages。

## What Changes

- **请求即时上屏(乐观更新)**:点生成的瞬间,把已落库的 pending 记录立即插入内存 `store.generations`,用户气泡 + 该轮"生成中"卡瞬间出现,输入框立即清空。移除底部那个不带 prompt 的通用骨架占位(改由每轮自己的 pending 卡承担)。失败时该轮卡如实转为失败态(记录本就落库,非幽灵消息)。
- **生成耗时显示**:生成记录落 `elapsedMs`;回复卡在生成中实时跳秒、完成后定格显示最终耗时(如"3.2s")。
- **GitHub Pages 自动部署**:新增 `.github/workflows/deploy.yml`,push 到 main 时用 GitHub Actions 构建(npm ci + build)并部署 `dist` 到 Pages(`actions/deploy-pages`),dist 不进仓库。README 补部署说明与 Pages 地址。

## Capabilities

### Modified Capabilities
- `image-generation`: 新增"请求即时上屏"与"生成耗时"两条行为需求。

## Impact

- 代码:`stores/workbench.js`(generate 乐观插入 pending)、`lib/generationService.js`(落 elapsedMs)、`components/ResultsView.vue`(移除通用骨架、卡片显示耗时/跳秒计时器)、`components/Composer.vue`(发起后立即 clear)。
- 新增:`.github/workflows/deploy.yml`;README 部署段落。
- 部署基建(workflow)按 design 决策落地,不写入 app 行为 specs(D3)。
- 首次 `git init` + 关联 remote `https://github.com/MY-Final/draw` + 首推,由实施后经用户确认代为执行;commit 规范 `feat: 中文描述`。
- 部署后暗礁(README 提示):github.io 为 https,若填写 http 接口会被浏览器混合内容拦截;本项目 `base: './'` 已适配 Pages 子路径 `/draw/`,无需改动;无 vue-router,无 SPA 刷新 404 问题。
- 依赖既有会话/生成数据模型(bootstrap + 前两个已归档 change)。
