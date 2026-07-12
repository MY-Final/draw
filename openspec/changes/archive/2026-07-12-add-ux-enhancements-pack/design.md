# Design — add-ux-enhancements-pack

## 决策

### D1 — GitHub 链接:侧栏底部,新标签打开

在 `SideBar.vue` 底部导航区加一个 GitHub 链接项,用 SVG 图标 + 文字"GitHub",`target="_blank"` + `rel="noopener noreferrer"`。放置顺序:存储与备份 → 接口设置 → GitHub → 主题切换。

- **Why 侧栏底部**:与"存储与备份""接口设置"同一片低优先级操作区,不抢主流程。

### D2 — README 部署徽章:Vercel 和 Netlify 两种

在 README 部署段(H2 之后)插入"## 一键部署",附 Vercel 和 Netlify 的一键 deploy 按钮(Markdown 链接 + SVG 徽章)。两个平台都用对应 SVG 徽章图片(shield 风格)。

- **Vercel**:`https://vercel.com/new/clone?repository-url=https://github.com/MY-Final/draw`
- **Netlify**:`https://app.netlify.com/start/deploy?repository=https://github.com/MY-Final/draw`

### D3 — 生成中随机文案:写死数组,每生成随机一个

在 ResultsView 或 constant 中维护一个文案数组 `[ "正在排队…", "模型正在处理中…", "正在生成图片…", "即将完成…", "正在渲染…" ]`。每次有新 pending 轮随机取一个,该轮卡在整个 pending 期间显示同一条(不跳变)。

- **Why 同一条不跳**:避免文案频繁跳变,用户读不清。随机是"每轮一次"而非"每帧一次"。
- **文案数量**:5–8 条,中文简短(4–8 字 + "…")。

### D4 — Prompt 收藏(文本模板库)

#### 数据模型
localStorage `workbench.savedPrompts` → `[{ id: string, text: string, createdAt: number }]`。纯文本,不关联生成或素材。JSON 序列化。

#### CRUD 入口
- **收藏**:Composer 输入框旁加一个"⭐"按钮,当前 prompt 非空时点亮,点一下收藏当前 prompt 文本;重复点击提示"已收藏过"(按文本去重)。
- **列表与填入**:⭐按钮旁或弹出一个小面板,列出已收藏 prompt;点某一项把文本填入输入框(不覆盖已有内容,追加到末尾?还是替换?→ 替换输入框内容,简单直接)。若用户想追加,自己先 copy。
- **删除**:列表中每项有 × 删除按钮。

#### 存储
纯 localStorage,不进 IndexedDB(prompt 是短文本,不涉 Blob)。导出/导入为 JSON(line-delimited),可附加在整库 zip 里(可后续补,先不耦合)。

### D5 — UI 走 ui-ux-pro-max

沿用现有中性灰+蓝 token,SVG 图标(github/star/x),不用 emoji。Prompt 面板走设计系统弹出层样式。
