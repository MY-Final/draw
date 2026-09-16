## Why

图片接口一次只处理一个请求。此前用户在生成进行中再次提交会被直接拒绝或体验含糊,长耗时任务期间无法连续排单。补上生成队列后,用户可在等待时继续提交后续请求,系统按序自动执行。

## What Changes

- 生成改为**单通道**:同一时间至多一个请求在跑。
- 生成进行中再次提交(输入区按钮已变为「取消」时按 `Ctrl/⌘ + Enter`)进入**队列**,上限 5 单。
- 排队项可**移除**,非队首项可**提前**到队首;当前任务结束后按序自动开始下一单。
- 排队项**记住发起时的工作区与会话**,即使用户中途切走上下文,结果也落到发起时的会话。
- 队列为**内存态**:刷新页面后未开始的部分不恢复。

## Capabilities

### New Capabilities
<!-- 无新增能力 -->

### Modified Capabilities
- `image-generation`: 新增"生成队列与单通道执行"要求。

## Impact

- `src/stores/workbench.js`:`generationQueue` 状态、`enqueueGeneration` / `removeQueuedGeneration` / `promoteQueuedGeneration` 与调度续跑。
- `src/components/ResultsView.vue`:对话流内呈现当前会话的排队项与「提前 / 移除」操作。
- 无数据迁移、无接口改动。
