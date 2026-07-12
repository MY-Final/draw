## Context

宽高比选择目前藏在 `Composer.vue` 底部 `composer-bar` 里一个 `⚙` chip 触发的 `params-pop` 弹层(L235-264)。三个已知问题 + 一个布局诉求(见 proposal)。`size` 参数在 `adapters.js` 被直接透传给 `images/generations` 与 `images/edits` 端点(`params.size || '1024x1024'`),因此 Auto 语义必须落到适配层。

## Goals / Non-Goals

**Goals**
- 参数常驻输入框上方,一点即选,消除"展开/收起"心智负担。
- 宽高比用标准比例字面显示。
- 新增 Auto 并作为默认,Auto 时不发 size。

**Non-Goals**
- 不改动 chat 协议的参数传递(chat 不发 size)。
- 不做参数预设/记忆(下次打开沿用上次)——保持每次默认 Auto。
- 不改历史记录的存储结构。

## Decisions

### D1:Auto = 不发送 size 字段(而非发送 `size:'auto'` 字面)
`computeSize(ratio, res)` 在 `ratio === 'auto'` 时返回 `null`。`submit()` 里 `params.size` 即为 `null`。适配层改为:
```
if (params.size) body.size = params.size          // generations
if (params.size) form.append('size', params.size) // edits
```
去掉原 `|| '1024x1024'` 兜底。理由:`size:'auto'` 字面并非所有 OpenAI 兼容接口都认,"不指定"是最稳的自适应方式。

**风险**:极少数接口把"无 size"视为必填错误。缓解:此时用户可显式选一个具体比例,错误由请求如实回显(符合现有"不静默吞错"约定)。

### D2:布局 —— 参数移至输入框上方,全平铺
比例 8 项平铺一行(窄屏 `flex-wrap` 自然换行),画质 + 数量放第二行。删除 `showParams` 状态、`params-pop` 弹层、`⚙` chip。`composer-bar` 只留协议提示 + 收藏 + 生成按钮。`onDocClick` 只保留 `showPromptLib` 分支(本就如此,无需改)。

### D3:标签文案
`RATIOS` 改为 `[{key:'auto',label:'Auto'}, {key:'1:1',...}, ...]`,label 即 key 的展示形态。`computeSize` 的 `split(':')` 分支只在非 auto 时走。

### D4:向后兼容 prefill
`applyPrefill` 保持现有旧格式解析(L144-163)。新增:若 `prefill.params.ratio === 'auto'` 则直接 `ratio.value = 'auto'`(computeSize 返回 null,提交时不发 size)。历史里存的具体 ratio 仍照常回填。

### D5:UI 实现走 ui-ux-pro-max(design D9)
tag 平铺的间距、分组标签("比例"/"画质"/"数量")、高亮态、换行行为使用既定设计系统 token(`--space-*`、`--color-primary`、`--color-on-primary`、`--radius-*` 等),复用现有 `.btn-group-item.active` 的高亮语义。

## Risks / Trade-offs

- **窄屏拥挤**:8 个比例 tag 在 760px 下换行可能占两行。权衡:接受换行,优先"不用点进去"。若过挤,可后续把低频比例(3:2/2:3)收进"更多"。
- **默认行为变更**:老用户默认从 1024x1024 变 Auto。影响面小(多数接口 Auto 会给合理默认),且是本次明确诉求。

## Migration Plan

无数据迁移。纯前端行为变更,历史记录读取不受影响(`ResultsView` 不读 size/ratio)。上线即生效。

## Open Questions

- 是否需要"记住上次选择"?当前决定不做(每次 Auto)。若后续有诉求再单开 change。
