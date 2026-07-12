# Image Generation (Modified Capability)

## 变更:随机生成文案

现状:生成中 card head 显示固定文案"生成中"(`<span class="badge">生成中</span>`)。

改为:每次新 pending 轮随机选一条文案,该轮整个 pending 期间固定显示同一条(不跳变)。

## 文案池

```js
const STATUS_MESSAGES = [
  '正在排队…',
  '模型正在处理中…',
  '正在生成图片…',
  '即将完成…',
  '正在渲染…',
  '正在优化细节…',
  'AI 正在创作…',
]
```

7 条,刚好覆盖从排队到完成的语义。如需增减直接在数组中改动。

## 随机策略

- 每轮生成(即每个 pending `gen` 对象)随机选一条
- **在 pending 记录创建时**决定,即 `createGeneration` 或 `onPending` 回调里写入选中的文案
- 存储字段:可在 generation 对象上加一个 `statusMessage?: string` 字段
- 该轮完成后文案不再变化(虽然此时 badge 已改为 success/failed,文案不再显示)

## 实现方式 A:generation 字段(推荐)

在 generation 对象的 `params` 或顶层加 `statusMessage`:

```ts
interface Generation {
  // ... existing fields
  statusMessage?: string  // 该轮随机选中的文案
}
```

- 在 `generationService.js` 中,`generate()` 接到 `onPending` 时,从数组随机取一条附上
- 或更简单:在 store 的 `generate()` action 中,创建 generation 对象时写入
- ResultsView 中,`gen.status === 'pending'` 时显示 `gen.statusMessage` 而非固定"生成中"

## 实现方式 B:运行时计算(更轻)

不落库,只在 ResultsView 中维护一个 `Map<genId, string>`,新 pending 出现时随机取一条存入 map,同一 genId 不再更换。

方式 A 更干净(数据驱动),方式 B 更轻(不改数据模型)。推荐 A。

## 影响

- `src/lib/generationService.js` — 在 createGeneration 或 onPending 中写入 statusMessage
- `src/stores/workbench.js` — 无需改(透传)
- `src/components/ResultsView.vue` — card head 的"生成中"badge 文案改为显示 statusMessage
