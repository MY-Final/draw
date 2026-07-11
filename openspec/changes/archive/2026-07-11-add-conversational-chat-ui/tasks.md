# Tasks

> 约束:UI/UX 实现走 `ui-ux-pro-max` 技能(design D5),沿用现有中性灰+蓝 token,不用 emoji 图标。

## 1. 适配层:images/edits 改图

- [x] 1.1 `http.js`:callApi 支持 FormData body(FormData 时不手动设 Content-Type)
- [x] 1.2 `adapters.js`:按"协议 × 是否带参考图"四象限分派;新增 ImagesEditAdapter 走 multipart
- [x] 1.3 edits 响应复用现有 b64_json/url 解析;多张参考图仅取第一张
- [x] 1.4 适配层单元测试:四象限分派选对端点(mock fetch)

## 2. 生成流程:重新生成 + 协议放开 + 清空输入

- [x] 2.1 Composer:images 协议不再禁用参考图;多图时提示"仅用第一张"
- [x] 2.2 store/service:regenerate(genId) —— 复制 prompt/params/refImageIds 起新事件
- [x] 2.3 失败按接口错误如实提示(模型不支持 edits 的场景)
- [x] 2.4 生成成功发起后清空输入框 prompt 与参考图(修 bug)

## 3. 会话与导航(conversation-history)

- [x] 3.1 会话模型:canvasId → conversationId;会话标题派生自首个 prompt
- [x] 3.2 store:会话列表(从 generations 派生)、切换会话、当前会话高亮
- [x] 3.3 按日期分组:今天 / 昨天 / 本月更早(按天)/ 更早(按月)
- [x] 3.4 左侧导航:会话列表 UI(分组标题 + 会话项 + 选中态)

## 4. 收藏(asset-library)

- [x] 4.1 assetRepo:asset 加 favorite 字段;toggleFavorite(id)
- [x] 4.2 store:收藏状态与筛选;素材库"仅看收藏"开关
- [x] 4.3 收藏随整库 zip 导出/导入保留(校验)

## 5. 对话式历史卡片(UI,ui-ux-pro-max)

- [x] 5.1 ResultsView 重构:用户请求气泡(右)+ AI 回复卡(左),加大左右分离度
- [x] 5.2 回复卡:模型名 + 状态徽标 + 结果图 + 参考图缩略 + 操作区(SVG 图标)
- [x] 5.3 操作区:收藏 / 继续创作(设为参考)/ 重新生成 / 下载 / 分享配方
- [x] 5.4 生成中:回复卡显示"正在生成"+ 骨架;请求气泡正常
- [x] 5.5 prompt 只在请求气泡出现一次(不在卡片重复)

## 6. 验证

- [x] 6.1 单测全绿;新增 edits 分派 / regenerate / favorite / 会话分组 用例
- [x] 6.2 真实浏览器验证:对话式布局分离度、清空输入、会话切换找回、收藏筛选、images 改图
