# Tasks

## 1. 调度与状态(workbench.js)
- [x] 1.1 新增 `generationQueue` 与 `MAX_GENERATION_QUEUE = 5`
- [x] 1.2 生成中提交走 `enqueueGeneration`,队满返回 `{ ok:false, reason:'full' }`
- [x] 1.3 `removeQueuedGeneration` / `promoteQueuedGeneration`(提前到队首)
- [x] 1.4 当前任务结束后自动取队首续跑,并以排队项携带的 workspace/conversation 落库
- [x] 1.5 删除工作区/会话/清空时同步清理相关排队项

## 2. UI(ResultsView.vue)
- [x] 2.1 对话流尾部呈现当前会话的排队项与序号
- [x] 2.2 非队首项「提前」、所有项「移除」

## 3. 验证
- [x] 3.1 空闲直接生成;生成中提交入队
- [x] 3.2 队满拒绝并提示上限
- [x] 3.3 前序结束后自动续跑,结果落回发起上下文
- [x] 3.4 `npm run lint` / `npm test` / `npm run build` 通过
