## Context

全新项目,无既有代码。目标是一个纯前端、零后端的 AI 绘画工作台,浏览器直连 OpenAI/NewAPI 兼容接口。核心约束:所有数据(Key、图片、历史)都留在用户本机;部署即静态托管。

经探索确定的关键心智模型:**没有会话,只有图**。系统 = 一个「素材库」+ 一堆「生成事件」。图片是一等公民,可被任意生成事件引用为参考图。"多轮改图"不是会话记忆,而是"拿旧输出图当新输入的参考图"这一操作的特例(无状态)。

## Goals / Non-Goals

**Goals:**
- v1 首屏即可纯文生图,开箱即用。
- 一套输入模型(文字 + 若干参考图)同时适配 `images/generations` 与 `chat/completions`。
- 图片 Blob 与元数据分离存储,支持复用、不复制字节。
- 存储可观测、可管理、可 zip 迁移。

**Non-Goals:**
- 会话记忆 / 多轮上下文链(明确排除,选方案 A 无状态)。
- 后端、账号、云同步。
- 图生视频、局部重绘蒙版、批量队列(留待后续)。
- 绕过 CORS 的代理(纯前端不引入中转)。

## Decisions

### D1: 无状态素材模型(方案 A,而非会话记忆)
每次生成请求 = 文字 + 当次选中的参考图,自行打包一次性发送。"多轮" = 把某张输出图拖回参考槽。
- **为什么**:工作台里每张图都应独立可复用,不被锁进某条会话;两种协议都能走;数据模型扁平(两张表,无树)。
- **备选**:维护 `messages` 链的会话记忆(方案 B)——更"聪明"但只有 chat 能用、更贵更重、图被锁死在会话里。已否决。

### D2: 数据模型 —— assets 与 generations 分离
```
assets:      { id, blob, mime, width, height, size, createdAt, source }
generations: { id, createdAt, prompt, refImageIds[], params{model,protocol,size,...},
               outputImageIds[], status, error?, cost? }
```
图字节只存一份在 `assets`;生成事件用 id 引用输入与输出。
- **为什么**:同一张图可同时是 A 的输出、B 的参考;引用而非复制。
- **备选**:把 base64 直接内联进 generation 记录——体积 +33%、无法复用、删除困难。已否决。

### D3: 协议适配层(Adapter)
统一接口 `generate({prompt, refImages, params}) -> {images[]}`,两个实现:
- `ImagesAdapter` → `POST /v1/images/generations`,解析 `data[].b64_json | url`。参考图不支持(edits 端点各家不一,v1 不做)。
- `ChatAdapter` → `POST /v1/chat/completions`,参考图作为 `image_url` 内容块;响应交给提取器。
- **为什么**:上层 UI 与存储只认统一的 `Generation` 结果,协议差异被隔离。

### D4: chat 响应抠图提取器(最大技术风险)
NewAPI 生态把图塞在多处,提取器需按序兜底:
```
1. message.content 数组中的 {type:"image_url"} → url
2. content(字符串)里的 markdown ![](URL) / ![](data:image/...;base64,...)
3. message.images[] 私有扩展数组
4. content 里裸露的 http(s) 图片 URL 一行文本
→ 全部规整为 {kind:'url'|'dataUrl', value}, 再统一拉取/解码成 Blob
```
- **为什么**:这是"支持任何接口"承诺能否兑现的关键;单独可测。

### D5: 存储技术选型
- IndexedDB(经 `idb` 薄封装)存 Blob 与元数据两个 object store。
- 显示 Blob 用 `URL.createObjectURL`,避免 base64 转换与内存膨胀。
- 容量:同时展示 `navigator.storage.estimate()`(浏览器配额/已用)与按 assets 累加的业务用量。
- 导入导出:JSZip,导出 `manifest.json`(generations 元数据)+ `assets/<id>.<ext>`;导入按 manifest 回填。

### D6: Key 存储
`localStorage` 明文(纯前端无安全隐藏处),UI 如实标注"仅存本机、请勿在公共设备使用"。

### D7: 协议切换粒度
设置中维护多个「接口预设」(baseURL+key+model+protocol);生成面板可下拉临时切换当前预设。默认预设走 `images/generations`。

### D8: 分享级导出 —— 预设(A)与配方(B),Key 强制剥离
在整库 zip(C,见 D5)之外,新增两类面向分享的导出:
- **A 接口预设**:导出 baseURL/model/protocol 等非凭据字段,**强制剥离 Key**;对方导入后预设标记为"缺 Key",需自填。
- **B 单次生成配方**:导出 prompt/参数/协议 + 所需参考图 Blob,使他人可复现;同样**强制剥离 Key**。导入后参考图落库、面板预填,由对方用自己的接口发起。
- **不变量**:Key 是本机凭据,**任何分享级导出路径都不得写出 Key**——这是硬约束,非可选项(不提供"带 Key 导出"的开关)。
```
   导出物对比
   ┌─────────┬──────────────────────────┬──────────┐
   │ 类型    │ 内容                      │ 含 Key?  │
   ├─────────┼──────────────────────────┼──────────┤
   │ C 整库  │ 全部预设/生成/素材        │ 否(剥离)│
   │ A 预设  │ baseURL/model/protocol    │ 否(剥离)│
   │ B 配方  │ prompt/参数/协议/参考图   │ 否(剥离)│
   └─────────┴──────────────────────────┴──────────┘
```
- **为什么**:分享的是"配置"与"怎么画",不是"我的凭据"。默认安全,不给用户误伤自己的机会。
- **备选**:可选带 Key(勾选+警告)——已否决,风险不对称,一次误操作即泄露。

### D9: 实施走 UI/UX 技能
UI 相关实现 SHALL 通过 `uiuxpromax` 技能进行(用户将于 apply 前安装)。在该技能可用前不落 UI 代码;apply 阶段所有界面工作以此技能为准。

## Risks / Trade-offs

- **CORS 墙** → 部分接口不允许浏览器直连。缓解:错误提示明确区分 CORS/网络/鉴权;文档说明"支持任何接口"以接口允许跨域为前提。
- **抠图提取器覆盖不全** → 某中转格式没兜住,图丢失。缓解:提取器分层兜底 + 保留原始响应片段便于诊断 + 可测试用例集。
- **IndexedDB 容量与逐出** → 浏览器可能在压力下清数据。缓解:容量面板预警 + zip 导出作为用户可控备份。
- **Key 明文** → 公共设备泄露风险。缓解:明确告知 + 提供一键清除。
- **图片 URL 过期**(chat 返回外链) → 缓解:拿到 url 立即下载为 Blob 落库,不长期依赖外链。

## Open Questions

- 导出 zip 是否需要分卷 / 大小上限(超大库一次性打包的内存压力)?v1 先不做,记录为后续。
- 分享文件(A/B)是否需要版本号/schema 标识以便向后兼容不同版本工作台?建议 v1 就带上 `schemaVersion` 字段,细节在实现时定。
