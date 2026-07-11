## Why

工作台能一直生成、却删不掉任何东西:`deleteGeneration` 早已写好但从没被 store 调用,也没有任何 UI 入口。历史会话、失败/空结果、误生成的图只增不减,越用越乱。这轮补上一套"能删且删得干净"的基础能力,并防止误删掉用户想留的图。

## What Changes

- **删整段会话**:左侧导航项可删掉一整段会话(其全部生成记录)。破坏性操作,走二次确认弹窗。
- **删单条生成**:对话流回复卡可删掉某一次生成(尤其失败/空结果)。走可撤销 toast(延迟提交:先从视图移除,几秒后才落库删除,期间可撤销)。
- **清空全部**:一键重置整个工作台(删所有生成 + 所有素材),**保留接口预设与 Key**。归到"存储与备份"抽屉,走确认弹窗。
- **连带图片规则(三者统一)**:删除生成/会话时,其产出图 `outputImageIds` 仅在**未被收藏 且 未被任何存活记录当参考图引用**时才连带删除;满足任一保留条件即保留。参考图 `refImageIds` 永不连带删除(那是用户自有素材)。
- **重命名会话**:会话标题默认派生自首个 prompt,现允许手动重命名并本地持久化(与删除同处右键/悬浮菜单,顺带补齐)。

## Capabilities

### Modified Capabilities
- `conversation-history`: 新增删除会话、重命名会话;会话标题可被手动覆盖(优先于派生标题)。
- `asset-library`: 新增"连带删除产出图"的引用感知规则(未收藏且未被引用才删);新增清空全部素材。
- `image-generation`: 新增删除单条生成(可撤销)与清空全部生成。

## Impact

- 代码:`generationRepo.js`(deleteGeneration 已存在;新增按会话批删、清空);`assetRepo.js`(引用感知的连带删除判定);`conversations.js` / store(会话标题覆盖表、删除/重命名 action、删除生成 action、清空全部);`SideBar.vue`(会话项菜单:重命名 / 删除);`ResultsView.vue`(回复卡删除按钮 + 撤销 toast);`BackupTools.vue` 或存储抽屉(清空全部入口)。
- 数据模型:会话标题覆盖需持久化 —— 用 localStorage 存 `{conversationId: title}` 映射(会话本身仍是派生视图,不建表)。
- 撤销机制:单条删除走延迟提交(内存移除 + setTimeout 落库),撤销窗口内刷新页面属极端边角,不做软删。
- 安全:连带删除必须先做引用检查,否则会删掉别的会话仍在用的参考图,导致裂图。
- 依赖 `bootstrap-drawing-workbench` 与 `add-conversational-chat-ui`(均已归档)的数据模型、会话派生与素材收藏。
