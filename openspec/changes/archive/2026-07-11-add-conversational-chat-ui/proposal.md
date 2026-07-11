## Why

当前生成历史把 prompt 和结果图混在一张卡里,看不清"哪句话对应哪张图"。改成对话式(用户请求气泡 + AI 回复卡)后,一眼就能顺着读下来。同时补上工作台该有的常用动作:收藏、重新生成;并解除一个此前的能力限制 —— 让 images 协议模型(如 gpt-image-2)也能基于参考图改图(经 images/edits 端点),使"改图/多轮"对更多模型可用。

## What Changes

- **对话式历史呈现**:每次生成拆成「用户请求气泡」+「AI 回复卡」两块;回复卡含模型名、状态、结果图、参考图缩略、操作区。图标用 SVG(不用 emoji),prompt 不重复展示。
- **收藏素材**:素材可标记收藏,素材库可按收藏筛选。
- **重新生成**:一键用相同 prompt / 参数 / 参考图再生成一次(落在当前画布)。
- **images/edits 改图**(**修改原 non-goal**):当 images 协议附带参考图时,改走 `images/edits` 端点(multipart),使 gpt-image 等模型可基于原图改图。参考图输入不再限定 chat 协议。
- **对话记录持久化 + 左侧导航**:每次"新建创作"= 一段独立对话(会话);历史对话持久保留,在左侧栏按日期分组列出(今天 / 昨天 / 本月更早 / 更早按月),点击可切回,标题取该对话首个 prompt。生成后输入框清空。

## Capabilities

### New Capabilities
- `conversation-history`: 会话(对话)的持久化、按日期分组的导航列表、切换与标题派生。

### Modified Capabilities
- `image-generation`: 参考图协议限制放宽(images 经 edits 亦可);新增 images/edits 改图、重新生成、对话式历史呈现;生成后清空输入框。
- `asset-library`: 新增素材收藏与按收藏筛选。

## Impact

- 代码:`adapters.js`(新增 images/edits multipart 分支)、`http.js`(支持 FormData 发送)、`assetRepo.js`(favorite 字段)、`ResultsView.vue`(对话式重构)、`Composer.vue`(images 协议放开参考图)、`generationService`/store(重新生成、收藏)。
- 兼容性:`images/edits` 各家支持度不一(gpt-image 系支持,dall-e-3 不支持),沿用"支持任何接口"的容错策略 —— 失败时按接口错误如实提示。
- 依赖 `bootstrap-drawing-workbench`(已完成)的数据模型与适配层。
