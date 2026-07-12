## Why

四个轻量增强,提升日常顺手度与项目可分享性,均为纯前端、不依赖接口能力:

1. 项目已开源到 GitHub,但界面里没有回链,访客/自己找不到仓库。
2. README 缺一键部署入口,他人 fork 后上手成本高。
3. 生成中只有单一"生成中"文案,过程感单调。
4. 常用 prompt 每次重敲,缺少收藏复用。

## What Changes

- **GitHub 仓库链接**:左侧栏底部加一个指向 `https://github.com/MY-Final/draw` 的链接(SVG 图标 + 新标签打开)。
- **README 一键部署**:补 Vercel、Netlify 一键部署徽章/链接。
- **生成中随机文案**:生成中回复卡的提示文案从一组写死文案中随机取(如"正在排队""模型正在处理中""正在生成图片"…),每次生成随机其一。
- **Prompt 收藏(文本模板库)**:用户可收藏 prompt 文本(独立于任何生成),本地持久化;输入框旁提供入口浏览并一键填入,可删除。

## Capabilities

### New Capabilities
- `prompt-library`: prompt 文本模板的收藏、列出、填入、删除(localStorage 持久化)。

### Modified Capabilities
- `image-generation`: 生成中回复卡文案改为从一组文案中随机取。

## Impact

- 代码:`SideBar.vue`(GitHub 链接)、`AppIcon.vue`(github 图标)、`ResultsView.vue`(随机文案)、新增 `lib/promptLibrary.js`(localStorage CRUD)、`Composer.vue` 或新组件(prompt 收藏入口 + 填入)、store(prompt 收藏状态)。
- 文档:`README.md`(Vercel/Netlify 一键部署)。
- 无接口依赖、不碰素材落库,低风险;可与 Change B(参考图与尺寸)并行或先行。
