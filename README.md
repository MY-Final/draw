# AI 绘画工作台

一个**纯前端、零后端**的 AI 绘画工作台。填上你自己的 OpenAI / NewAPI 兼容接口就能画图,所有数据(接口 Key、图片、历史)全部留在你本机浏览器,部署即静态托管。

## 特性

- **零后端**:浏览器直连接口,无服务器、无账号、无云同步。
- **两种协议**:默认 `images/generations`(纯文生图),可切 `chat/completions`(支持参考图)。
- **参考图 / 多轮改图**:把任一素材(含以往生成结果)设为参考图再生成 —— 多轮改图就是"拿旧图当参考"的特例,无会话状态。
- **本地素材库**:图片以 Blob 存 IndexedDB,默认不过期;元数据与图字节分离,一图可多处复用不重复占用。
- **存储管理**:查看用量、删除素材;支持整库 zip 导出/导入与备份提醒。
- **备份与分享**(均**不含 API Key**):
  - 整库 zip 导出 / 导入(换机、换浏览器迁移)。
  - 接口预设分享(对方导入后自填 Key)。
  - 单次生成"配方"分享(含参考图,对方用自己的接口复现)。

## 快速开始

```bash
npm install
npm run dev      # 本地开发
npm run build    # 构建静态产物到 dist/
npm run preview  # 预览构建产物
npm test         # 运行测试
```

首次使用:左侧「新建」一个接口预设 → 填 Base URL / API Key / 模型 / 协议 → 「测试连接」→ 保存 → 输入描述 → 生成。

## 部署

`npm run build` 产出的 `dist/` 是纯静态资源,可托管到任意静态服务器、对象存储、GitHub Pages 等。构建已用相对路径(`base: './'`),支持部署到子路径。

### GitHub Pages(自动)

仓库已内置 `.github/workflows/deploy.yml`:push 到 `main` 即自动构建并发布(也可在 Actions 页手动触发)。首次启用需一步手动设置:

1. 在 GitHub 仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。
2. push 到 `main`，等待 Actions 跑完。
3. 访问 **https://my-final.github.io/draw/**（项目部署在 `/draw/` 子路径，`base: './'` 已适配，资源不会 404）。

> **混合内容提醒**:github.io 是 https 站点,浏览器会拦截页面里对 **http** 接口的请求(混合内容)。请确保你填的接口 Base URL 是 **https**;否则请求会被静默拦截。

## 一键部署

点击下方按钮,将本仓库 fork 到你的 GitHub 账号后,可直接部署到对应平台:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/MY-Final/draw)
[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/MY-Final/draw)

两个平台都提供免费额度,部署后即可获得自己的公开访问地址。

## 已知约束

- **CORS**:浏览器直连第三方接口受同源策略限制。"支持任何接口"以该接口**允许跨域**为前提;不允许跨域的接口在纯前端下无法直连(错误提示会区分 CORS/网络、鉴权、其他)。
- **参考图仅 chat 协议**:`images/generations` 协议不支持参考图,选中该协议时参考图区会禁用并提示。
- **API Key 明文**:纯前端无安全隐藏处,Key 存 localStorage 明文,请勿在公共设备保存;界面提供「一键清除凭据」。
- **浏览器存储**:IndexedDB 可能在存储压力下被浏览器清理;重要素材请用整库 zip 导出备份。

## 技术栈

Vue 3 + Vite · Pinia · idb(IndexedDB)· JSZip · 纯 CSS 设计系统(深/浅双色)。

## 架构要点

```
数据模型:assets(图 Blob) 与 generations(生成事件)分离,以 id 相互引用。
适配层  :统一 generate() 接口隔离两种协议;chat 响应经健壮的抠图提取器规整。
存储    :Blob 落库,显示走 URL.createObjectURL 并集中释放。
分享    :所有分享级导出强制经 stripKey() 剥离 Key(有测试锁定)。
```

详见 `openspec/changes/archive/2026-07-11-bootstrap-drawing-workbench/` (proposal / design / specs / tasks)。
