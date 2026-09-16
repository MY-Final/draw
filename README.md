<div align="center">

# 🎨 AI 绘画工作台

**纯前端、零后端的 AI 绘画工作台 —— 填入你自己的 OpenAI / NewAPI 兼容接口即可画图,数据全留本机。**

**简体中文** · [English](./README.en.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Stars](https://img.shields.io/github/stars/MY-Final/draw?style=social)](https://github.com/MY-Final/draw/stargazers)
[![Vue 3](https://img.shields.io/badge/Vue-3-42b883?logo=vuedotjs&logoColor=white)](https://vuejs.org/)
[![Vite](https://img.shields.io/badge/Vite-646cff?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Vitest](https://img.shields.io/badge/Vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)

[**在线体验**](https://120403.xyz/draw/) · [快速开始](#快速开始) · [一键部署](#一键部署)

<img src="./docs/hero.png" alt="当前 AI 绘画工作台：工作区与会话、生成结果卡、参数区、生成队列与素材库" width="820">

</div>

---

一个**纯前端、零后端**的 AI 绘画工作台。填上你自己的 OpenAI / NewAPI 兼容接口就能画图,所有数据(接口 Key、图片、历史)全部留在你本机浏览器,部署即静态托管。

## 特性

- **零后端**:浏览器直连接口,无服务器、无账号、无云同步。
- **标准 images 协议**:文生图走 `images/generations`,带参考图自动走 `images/edits`(OpenAI 兼容);旧版 `chat` / `auto` 预设会自动迁移为 `images`。
- **参考图 / 多轮改图**:把一张或多张素材(含以往生成结果)设为参考图再生成(单次最多 16 张,全部随请求发送)—— 多轮改图就是"拿旧图当参考"的特例,无会话状态;参考图失效时会明确提示,不会静默降级为文生图。缩略图支持鼠标拖拽排序,也可以聚焦后用 `←` `→` `Home` `End` 调整顺序(会播报移动结果)。
- **生成队列**:图片接口一次只跑一个请求,空闲时直接生成;生成中再提交(按钮已变成「取消」时按 `Ctrl/⌘ + Enter`)会进入队列,最多排 5 单。排队项可「提前」或「移除」,当前任务结束后自动按序续跑;排队时会记住发起时的工作区和会话,中途切走上下文也不会把结果落错地方。
- **消息可编辑**:生成完成后可编辑该条 prompt,并以新内容 + 原参数/参考图创建新的生成事件;原历史记录保持不变。编辑框默认随内容自适应,拖动底部把手(或聚焦把手后用 `↑` `↓`)可手动调整高度,重新进入编辑复位为自适应。
- **删除可撤销**:删单条生成、批量删素材、删会话、删工作区都有 5 秒撤销窗口(统一风格的撤销提示,移动端关掉抽屉也还在)。窗口内只从界面移除,数据仍在本地;窗口内刷新页面不会真的删掉内容。仍被生成记录引用的素材会阻止删除并说明原因。
- **大图预览**:点击结果或素材进入预览,支持滚轮缩放、双击缩放/还原、放大后拖拽平移,并可直接复制提示词、把图片复制到剪贴板。
- **素材来源可区分**:素材库按「AI 生成 / 我的上传 / 导入」筛选,格子上带来源角标,素材多了也不混。
- **批量数量核对**:请求 N 张但接口实际只返回 M 张时,结果卡明确告警并保留接口原始返回,不再静默丢图。
- **本地素材库**:图片以 Blob 存 IndexedDB,默认不过期;元数据与图字节分离,一图可多处复用不重复占用;仍被历史记录引用的素材不会被直接删除。
- **长任务友好**:每个接口可配置 30–1800 秒请求超时(默认 180 秒);用户主动取消与超时分别记录,页面刷新后遗留任务会标记为中断。接口已返回外链图片时,图片下载仍有 60 秒保护。
- **工作区与移动端**:支持工作区、会话历史、统一搜索(`Ctrl/⌘ K`,结果带缩略图,选中即切到目标工作区),以及移动端导航抽屉和素材库入口;移动端参考图是单行横向滚动,输入区高度不再随参考图数量增长。
- **收藏 Prompt 库**:把常用提示词存进当前工作区,支持搜索与就地编辑(重名会被拦截)。
- **快捷操作**:`/` 聚焦输入框、`Alt + N` 新建创作、`Ctrl/⌘ + K` 搜索、`Ctrl/⌘ + Enter` 生成(生成中则入队);空状态提供可点击的灵感标签,点一下直接填入。
- **存储管理**:查看用量、删除素材;整库 zip 导入带进度反馈,采用合并策略(同 ID 覆盖,不清空本机数据,已有 API Key 保留),并可开启备份提醒。
- **备份与分享**(均**不含 API Key**):
  - 整库 zip 导出 / 导入(换机、换浏览器迁移)。
  - 接口预设分享(对方导入后自填 Key)。
  - 单次生成"配方"分享(含参考图,对方用自己的接口复现)。

## 演示

<div align="center">
  <img src="./docs/demo.gif" alt="当前工作台、接口设置与数据保护流程演示" width="720">
  <br><br>
  <img src="./docs/mobile.png" alt="移动端：生成队列、参考图单行横向滚动与素材库入口" width="300">
</div>


## 快速开始

```bash
npm install
npm run dev      # 本地开发
npm run build    # 构建静态产物到 dist/
npm run preview  # 预览构建产物
npm test         # 运行测试
npm run check    # lint + 测试 + 生产构建
```

首次使用:点击「添加接口」→ 填 Base URL / API Key / 模型 → 「测试连接」→ 保存 → 输入描述 → 生成。没思路时直接点空状态里的灵感标签,即可填入示例提示词再改。

### 快捷键

| 快捷键 | 作用 |
|--------|------|
| `Ctrl/⌘ + Enter` | 生成;正在生成时改为「加入队列」(最多 5 单) |
| `Enter` | 输入框内换行 |
| `Ctrl/⌘ + K` | 打开统一搜索 |
| `/` | 聚焦输入框(在输入框里输入 `/` 不受影响) |
| `Alt + N` | 新建创作 |
| `Esc` | 关闭浮层 / 取消编辑(有改动会先确认) |
| `←` `→` `Home` `End` | 聚焦参考图缩略图时调整顺序 |
| `+` `-` `0` | 大图预览缩放 / 重置(同样支持滚轮与双击) |

> **生图等待说明**:每个接口默认等待 180 秒,可在接口设置中调整为 30–1800 秒。超时会标记为失败,用户主动取消会标记为已取消;如果页面被刷新,正在进行的任务会被标记为“页面已刷新中断”。
>
> **队列说明**:生成是单通道的,一次只跑一个请求,其余排队(上限 5 单)。队列只存在于当前页面内存里,刷新页面会清空尚未开始的那部分。

## 部署

`npm run build` 产出的 `dist/` 是纯静态资源,可托管到任意静态服务器、对象存储、GitHub Pages 等。构建已用相对路径(`base: './'`),支持部署到子路径。

### GitHub Pages（自动）

仓库已内置 `.github/workflows/deploy.yml`：push 到 `main` 即自动构建并发布（也可在 Actions 页手动触发）。首次启用需一步手动设置：

1. 在 GitHub 仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。
2. push 到 `main`，等待 Actions 跑完。
3. 访问 <https://my-final.github.io/draw/>（项目部署在 `/draw/` 子路径，`base: './'` 已适配，资源不会 404）。

> **混合内容提醒**：github.io 是 https 站点,浏览器会拦截页面里对 **http** 接口的请求（混合内容）。请确保你填的接口 Base URL 是 **https**;否则请求会被静默拦截。

## 一键部署

点击下方按钮,将本仓库 fork 到你的 GitHub 账号后,可直接部署到对应平台:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/MY-Final/draw)
[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/MY-Final/draw)
[![Deploy to Cloudflare Pages](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/MY-Final/draw)
[![Fork for GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Fork%20%26%20Deploy-121011?logo=github)](https://github.com/MY-Final/draw/fork)

各平台均提供免费额度,部署后即可获得自己的公开访问地址。构建参数一致:

| 平台 | 构建命令 | 输出目录 | 说明 |
|------|----------|----------|------|
| Vercel | `npm run build` | `dist` | 按钮 clone 后自动识别 |
| Netlify | `npm run build` | `dist` | 按钮 clone 后自动识别 |
| Cloudflare Pages | `npm run build` | `dist` | 框架预设选 **Vite** 即可 |
| GitHub Pages | — | — | fork 后参见上文「[GitHub Pages(自动)](#github-pages自动)」,由内置 Actions 自动发布 |

## 已知约束

- **CORS**:浏览器直连第三方接口受同源策略限制。"支持任何接口"以该接口**允许跨域**为前提;不允许跨域的接口在纯前端下无法直连(错误提示会区分 CORS/网络、鉴权、其他)。
- **连通性探测**:「测试连接」只 `GET /v1/models`,不会触发画图计费。
- **生图请求**:生成接口按接口预设的 30–1800 秒超时执行,超时原因会保存在结果卡详情中;接口返回外链图片后,下载阶段有 60 秒超时保护。
- **单通道生成**:同一时间只跑一个请求,其余进入内存队列(上限 5 单);刷新页面后队列不恢复。
- **删除是延迟落库**:删会话/工作区/素材/单条生成都有 5 秒撤销窗口。窗口内数据仍在库里,此时刷新页面等于放弃这次删除,内容会照旧显示。
- **API Key 明文**:纯前端无安全隐藏处,Key 存 localStorage 明文,请勿在公共设备保存;界面提供「一键清除凭据」。
- **浏览器存储**:IndexedDB 可能在存储压力下被浏览器清理;重要素材请用整库 zip 导出备份。

## 技术栈

**前端**:Vue 3(Composition API + `<script setup>`)+ Pinia 状态管理 · Vite 构建 · 标准 OpenAI images 协议适配层(`generations` / `edits` 自动路由)。

**存储**:idb(IndexedDB)存图 Blob 与生成记录,元数据与图字节分离、一图可多处复用;localStorage 存接口预设、主题、会话标题等轻量偏好。

**测试**:Vitest 单元测试(+ fake-indexeddb)覆盖生成管线、队列调度、删除撤销、引用感知、分享脱敏、Prompt 库与工作区回归;Playwright 跑桌面端(1440×900)与移动端(390×844)冒烟测试,覆盖初始化、工作区切换、队列与取消、参考图键盘排序、导入反馈、弹窗焦点与移动端布局。

```bash
npm test                          # 单元测试
npm run test:e2e -- --workers=1   # 端到端测试(自动启动 dev server)
```

**样式**:纯 CSS 设计系统(design tokens,深/浅双主题),不依赖 UI 框架;图标为内联 SVG(Lucide 风格)。

**工具**:JSZip(整库 zip 备份 / 恢复)。

## 架构要点

```
数据模型:assets(图 Blob) 与 generations(生成事件)分离,以 id 相互引用。
适配层  :统一 generate();无参考图 → generations,有参考图 → edits;生成请求使用接口预设超时。
调度    :生成单通道 + 内存队列(上限 5);排队项记住发起时的 workspaceId / conversationId,结果不会落错会话。
生命周期:用户可主动取消;刷新后遗留 pending 自动收口;删除会话/工作区时同步清理活跃请求与孤儿产物。
删除    :生成/素材/会话/工作区统一「延迟落库 + 5 秒撤销」,窗口内只在内存隐藏,刷新后以库中数据为准。
存储    :Blob 落库,显示走 URL.createObjectURL 并集中释放;引用感知删除避免历史记录裂图。
分享    :所有分享级导出强制经 stripKey() 剥离 Key(有测试锁定)。
```

详见 `openspec/changes/archive/2026-07-11-bootstrap-drawing-workbench/` (proposal / design / specs / tasks)。

## 许可证

[MIT](./LICENSE) © MY-Final

如果这个项目对你有帮助,欢迎点个 ⭐ Star 支持一下。

