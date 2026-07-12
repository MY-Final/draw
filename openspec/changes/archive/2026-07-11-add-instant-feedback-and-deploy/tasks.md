# Tasks

> 约束:UI/UX 实现走 `ui-ux-pro-max` 技能,沿用现有中性灰+蓝 token,不用 emoji 图标。commit 规范 `feat: 中文描述`。

## 1. 请求即时上屏(乐观更新)

- [x] 1.1 `generationService.js`:runGeneration 支持 `onPending(gen)` 回调,在 createGeneration 落库后立即触发
- [x] 1.2 `stores/workbench.js`:generate() 传入 onPending —— 把 pending 记录 unshift 进 `this.generations`(内存乐观插入)
- [x] 1.3 `Composer.vue`:发起后立即清空输入(不再等 await 完成;时序上乐观插入已保证上屏)
- [x] 1.4 `ResultsView.vue`:移除底部 `v-if="store.generating"` 通用骨架;由每轮 pending 卡承担"生成中"
- [x] 1.5 校验:失败/空时同一条就地转最终态,无重复、无幽灵条目

## 2. 生成耗时

- [x] 2.1 `generationService.js`:updateGeneration 落最终状态时写 `elapsedMs = Date.now() - gen.createdAt`(成功/失败/空)
- [x] 2.2 `ResultsView.vue`:回复卡头显示耗时;pending 轮用单个 setInterval 实时跳秒
- [x] 2.3 计时器生命周期:无 pending 轮时停;onUnmounted 清除,避免泄漏
- [x] 2.4 格式化:`(ms/1000).toFixed(1)+'s'`

## 3. GitHub Pages 自动部署(design D4)

- [x] 3.1 新增 `.github/workflows/deploy.yml`:push main + workflow_dispatch 触发;checkout → setup-node 20 + npm ci → npm run build → upload-pages-artifact(dist)→ deploy-pages
- [x] 3.2 权限 `pages: write` / `id-token: write`;concurrency 防并发
- [x] 3.3 确认 `vite.config.js` base 保持 './'(适配 /draw/ 子路径,不改)
- [x] 3.4 README:部署说明 + Pages 地址(https://my-final.github.io/draw/)+ 需在 Settings→Pages 设 Source=GitHub Actions + http 接口混合内容提醒

## 4. git 绑定与首推(design D5,经用户确认后执行)

- [x] 4.1 `git init` + 关联 remote `https://github.com/MY-Final/draw`
- [x] 4.2 首个 commit(`feat: 中文描述`)并 push 到 main
- [x] 4.3 提示用户在 GitHub 网页端设 Pages Source = GitHub Actions,确认 Actions 跑通

## 5. 验证

- [x] 5.1 单元测试全绿(现有回归)
- [x] 5.2 `npm run build` 通过
- [x] 5.3 浏览器实测:点生成瞬间上屏 + 输入框清空;耗时跳秒并定格;失败态就地更新
- [x] 5.4 部署实测:Actions 跑通,Pages 站点可访问且资源不 404
