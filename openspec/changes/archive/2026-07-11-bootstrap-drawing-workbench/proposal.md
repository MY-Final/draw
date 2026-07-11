## Why

想要一个开箱即用、随处部署的 AI 绘画入口:不搭服务器、不存用户数据、填上自己的 API Key 就能画。现有工具要么绑定后端、要么锁死某个模型;而 OpenAI/NewAPI 兼容接口已成事实标准,一个纯前端工作台就能把"任何兼容接口 + 本地存储"组合成个人可控的绘画环境。

## What Changes

- 新建一个 Vue 3 纯前端应用,零后端,可静态托管。
- 支持配置任意 OpenAI/NewAPI 兼容接口(baseURL + key + model),Key 仅存本机。
- 支持两种绘画协议:默认 `images/generations`(纯文生图),可切 `chat/completions`(支持参考图)。
- **文生图**为 v1 首屏体验;**参考图**是进阶能力,仅在 chat 协议下可用(参考图槽在 images 协议下禁用)。
- 生成结果进入本地**素材库**:每张图独立存储、可复用为下一次生成的参考图(即"多轮改图 = 参考图特例",无会话状态)。
- 图片以 Blob 存 IndexedDB,元数据与图字节分离、以 id 引用;默认不过期。
- 存储管理:展示用量、逐条删除;整库 zip 导出 / 导入。
- 分享级导出:接口预设(A)与单次生成配方(B)可导出分享、导入复现;**所有分享导出强制剥离 API Key**。

## Capabilities

### New Capabilities
- `api-connection`: 接口预设的增删改、协议选择、Key 本地存储、连通性检查。
- `image-generation`: 发起生成、参数配置、两种协议适配、从 chat 响应中提取图片的健壮提取器。
- `asset-library`: 本地素材库,Blob 图片存储、预览、复用为参考图。
- `storage-management`: 存储用量展示、删除、整库 zip 导入导出。

### Modified Capabilities
<!-- 无 — 全新项目,无既有 spec -->

## Impact

- 全新代码库:Vue 3 + Vite,IndexedDB(建议经 idb 封装),JSZip 处理导入导出。
- 无后端、无数据库、无鉴权服务。
- 部署 = 静态资源托管(任意静态服务器 / 对象存储 / GitHub Pages 等)。
- 已知约束:浏览器直连第三方接口受 **CORS** 限制,"支持任何接口"以接口允许跨域为前提;`images/generations` 协议不支持参考图。
