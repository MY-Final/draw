# Design — add-instant-feedback-and-deploy

## 背景

`runGeneration` 第一步 `createGeneration` 就把 pending 记录写进 IndexedDB,但 `store.generations`(ResultsView 读的内存数组)只在整次生成结束后 `refreshAll()` 才更新 —— 这是消息延迟上屏的根因。ResultsView 已按 `gen.status` 分状态渲染(pending 显示"生成中"徽标),所以只要提前把 pending 显示出来即可,无需造假记录。

## 决策

### D1 — 乐观更新:提前显示已落库的 pending,而非造假记录

`store.generate` 在调用 `runGeneration` 时传入 `onPending(gen)` 回调;回调里把该 pending 记录 unshift 进 `this.generations`。这样:

```
点生成
  ├─ createGeneration(pending) 落库 → onPending → 内存插入 → 立即上屏 + 清空输入
  ├─ API 调用中……(该轮卡显示"生成中"+ 跳秒)
  └─ 完成 → updateGeneration(success/failed/empty) → refreshAll() 覆盖为最终态
```

- **Why 回调而非 store 自己造对象**:pending 记录带真实 id/createdAt/params,后续 refreshAll 用同 id 的最终记录自然替换,不会重影或错位。失败时库里是 failed 记录,拉回即失败卡。
- **一致性**:`onPending` 里插入的对象直接用 `createGeneration` 返回值,字段与库内一致。

### D2 — 移除底部通用骨架,由每轮 pending 卡承担"生成中"

ResultsView 现有的 `v-if="store.generating"` 独立骨架块删除;pending 记录进入 feed 后,该轮自身渲染"生成中"卡(可保留骨架样式用于图片区占位)。`store.generating` 仍用于禁用发送按钮等,不再驱动独立占位。

### D3 — 生成耗时:落 elapsedMs + 前端实时跳秒

- **落库**:`runGeneration` 在 `updateGeneration` 落最终状态时写 `elapsedMs = Date.now() - gen.createdAt`(成功/失败/空都记)。
- **展示**:回复卡头显示耗时。生成中(status pending)时前端用 setInterval 每 100ms 从 `Date.now() - createdAt` 算出实时秒数跳动;完成后读记录里的 `elapsedMs` 定格。
- **计时器生命周期**:计时器在 ResultsView 内按"是否存在 pending 轮"启停;组件 `onUnmounted` 清除,避免泄漏。仅一个共享 interval,不为每张卡各起一个。
- **格式**:`(ms/1000).toFixed(1) + 's'`;超过 60s 显示"分:秒"可后续再议,先只做秒。

### D4 — 部署走 GitHub Actions,不写入 app specs

GitHub Pages 部署是工程基建,不是 app 行为,故不建 `deployment` 能力 spec;以 design 决策 + tasks 落地。

- **workflow**:`.github/workflows/deploy.yml`,触发 `push: branches: [main]` + 手动 `workflow_dispatch`。步骤:checkout → setup-node(20)+ npm ci → npm run build → `actions/upload-pages-artifact`(path: dist)→ `actions/deploy-pages`。权限 `pages: write`、`id-token: write`,`concurrency` 防并发。
- **Pages source**:仓库 Settings → Pages → Source = "GitHub Actions"(需用户在网页端设一次)。
- **base 路径**:`vite.config.js` 已是 `base: './'`,相对路径适配 `/draw/` 子路径,**不改**。
- **无 SPA 回退**:项目无 vue-router,单页无路由,不需要 404.html。

### D5 — git 绑定与提交规范

- 首次 `git init` → `git remote add origin https://github.com/MY-Final/draw` → 首个 commit(`feat: 中文描述`)→ push 到 main。
- 由实施完成后、经用户二次确认再执行(推公开仓库不可逆)。
- commit 规范:`feat: <中文描述>`,后续提交沿用。

## 非目标

- 不引入 vue-router 或多路由。
- 不做自定义域名 / CNAME(如需后续再加)。
- 耗时不做历史统计/图表,仅单条展示。
