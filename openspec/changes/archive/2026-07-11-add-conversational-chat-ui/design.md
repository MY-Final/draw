## Context

`bootstrap-drawing-workbench` 已交付无状态素材模型 + 两协议适配 + 对话式底部输入布局。本 change 在其上做三件事:对话式历史卡片、收藏/重新生成、以及放开"images 协议不能带参考图"这一限制。

关键触发:用户使用的 gpt-image-2 是 images 协议,原设计里参考图仅 chat 可用,导致改图流程在该模型上不可用。OpenAI images 系其实有 `/v1/images/edits` 端点支持"原图 + prompt → 改图",可解此限制。

## Goals / Non-Goals

**Goals:**
- 历史呈现改为"用户气泡 + AI 回复卡",一眼分清请求与产出。
- 素材可收藏、可筛选;生成可一键重做。
- images 协议带参考图时走 edits 端点,使 gpt-image 可改图。

**Non-Goals:**
- 会话记忆(仍是无状态方案 A;重新生成/改图都是独立事件)。
- 蒙版局部重绘(edits 的 mask 参数暂不做,只做整图改)。
- dall-e-3 等不支持 edits 的模型的改图(失败即如实提示,不特殊兼容)。

## Decisions

### D1: images 参考图 → images/edits 端点
适配层按"协议 + 是否带参考图"四象限分派:
```
            无参考图                带参考图
  images →  images/generations     images/edits (multipart)
  chat   →  chat/completions       chat/completions (image_url 块)
```
- edits 请求为 `multipart/form-data`:`image`(参考图,取第一张)、`prompt`、`model`、`size`;解析同 generations(`data[].b64_json|url`)。
- **为什么**:解锁 gpt-image 改图,且复用既有响应解析,改动收敛在适配层。
- **备选**:继续禁用 images 参考图 —— 已被用户决策否决。

### D2: 放宽"参考图仅 chat"约束(修改原 spec)
参考图输入不再按协议禁用。UI 上 images 与 chat 都可加参考图;仅当接口实际不支持时,由请求失败如实提示(沿用 CORS/鉴权/接口错误的分类)。这是对 `image-generation` spec 中"参考图仅在 chat 协议可用"requirement 的 MODIFIED。

### D3: 收藏 = asset.favorite 布尔字段
在 asset 记录加 `favorite`(默认 false),不新增表。素材库加"仅看收藏"筛选。收藏是纯本地标记,随整库 zip 一起导出。

### D4: 重新生成 = 复制入参新起一次事件
读取某条 generation 的 prompt/params/refImageIds,以当前画布重新调用生成。不复用旧输出、不改旧记录(无状态、可追溯)。

### D5: 对话式卡片(UI,走 ui-ux-pro-max)
每条 generation 渲染为两块:用户请求气泡(右对齐、仅 prompt)+ AI 回复卡(左对齐:模型名 + 状态徽标 + 结果图 + 参考图缩略 + 操作区)。SVG 图标,不用 emoji;prompt 只在气泡出现一次。沿用中性灰+蓝 token。

## Risks / Trade-offs

- **edits 兼容性参差** → gpt-image 支持,dall-e 系不支持。缓解:失败按接口错误如实提示,文档说明改图需模型支持 edits。
- **multipart 与现有 JSON 封装分叉** → http 层需同时支持 JSON 与 FormData。缓解:callApi 增加 body 类型判断,FormData 时不设 Content-Type(浏览器自动带 boundary)。
- **多张参考图** → edits 端点通常只接受一张。缓解:images/edits 取第一张,UI 在 images 协议下提示"仅使用第一张参考图"。

## Open Questions

- 是否需要"收藏"独立视图 vs 素材库内筛选?v1 先做筛选,独立视图待定。
