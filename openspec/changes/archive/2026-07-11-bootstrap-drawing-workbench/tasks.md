# Tasks

> 约束:所有 UI/UX 实现须通过 `ui-ux-pro-max` 技能进行(见 design D9);已用其生成设计系统:AI-Native UI 风格 / 主色 #7C3AED / Inter / dense。

## 1. 项目脚手架

- [x] 1.1 用 Vite 初始化 Vue 3 项目,配置基础目录结构(components / stores / lib / views)
- [x] 1.2 引入依赖:状态管理(Pinia)、`idb`、`jszip`;配置纯静态构建
- [x] 1.3 搭建三栏工作台布局骨架(左:输入区 / 中:结果 / 右:素材库与历史)

## 2. 存储层(IndexedDB)

- [x] 2.1 定义 `assets` 与 `generations` 两个 object store 及 schema(见 design D2)
- [x] 2.2 封装 asset 仓库:存 Blob、取 Blob、按 id 引用、删除
- [x] 2.3 封装 generation 仓库:创建/更新状态/查询列表
- [x] 2.4 图片显示统一走 `URL.createObjectURL` 并管理释放

## 3. 接口预设与连接(api-connection)

- [x] 3.1 预设数据模型与 localStorage 持久化(baseURL/key/model/protocol)
- [x] 3.2 预设的增删改 UI;新建默认协议为 `images`
- [x] 3.3 Key 存储告知与"一键清除凭据"
- [x] 3.4 连通性检查,失败原因区分(CORS/网络、鉴权、其他)

## 4. 协议适配层(image-generation)

- [x] 4.1 定义统一适配接口 `generate({prompt, refImages, params}) -> {images[]}`
- [x] 4.2 实现 `ImagesAdapter`:请求 `images/generations`,解析 `b64_json`/`url`
- [x] 4.3 实现 `ChatAdapter`:请求 `chat/completions`,参考图作为 image_url 内容块
- [x] 4.4 实现 chat 响应抠图提取器(多形式兜底:image_url / markdown / dataURI / images[] / 裸URL)
- [x] 4.5 提取器单元测试用例集(覆盖各承载形式与"无法提取")
- [x] 4.6 拿到外链 url 立即下载为 Blob 落库,不长期依赖外链

## 5. 生成流程(image-generation)

- [x] 5.1 生成面板:prompt 输入、参数(model/尺寸/数量)、预设下拉切换
- [x] 5.2 参考图输入区:chat 协议启用、images 协议禁用并提示
- [x] 5.3 发起生成 → 写 generation(pending)→ 适配调用 → 落库输出 → 更新状态
- [x] 5.4 失败处理:标记失败、保存错误信息、不产生残缺素材
- [x] 5.5 "用输出图当参考图"入口(拖拽/选择),验证无会话状态

## 6. 素材库(asset-library)

- [x] 6.1 素材缩略预览网格
- [x] 6.2 从素材库选图作为参考图(chat 协议)
- [x] 6.3 素材详情/大图预览

## 7. 存储管理(storage-management)

- [x] 7.1 用量展示:`navigator.storage.estimate()` + 素材库累计业务用量
- [x] 7.2 素材删除(单选/多选)并刷新用量
- [x] 7.3 zip 导出:manifest.json + assets/<id>.<ext>
- [x] 7.4 zip 导入:按 manifest 回填,校验无效 zip 并拒绝且不破坏现有数据
- [x] 7.5 接口预设(A)导出/导入:导出强制剥离 Key;导入标记"缺 Key"待填
- [x] 7.6 单次生成配方(B)导出/导入:含参考图、强制剥离 Key;导入落图 + 预填面板
- [x] 7.7 分享文件加 `schemaVersion` 字段;导入时校验版本与协议匹配并给出提示

## 8. 收尾

- [x] 8.1 端到端手测:images 文生图、chat 带参考图、导出后重装浏览器导入还原
- [x] 8.2 CORS/错误提示文案打磨与"仅存本机"风险说明
- [x] 8.3 静态构建产物验证与部署说明(README)
