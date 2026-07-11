## ADDED Requirements

### Requirement: 发起文生图生成
系统 SHALL 允许用户输入文字 prompt 与生成参数(如 model、尺寸、数量),使用当前选中的接口预设发起生成,并将结果图片存入素材库。

#### Scenario: 纯文生图成功
- **WHEN** 用户输入 prompt 并点击生成,接口返回图片
- **THEN** 系统将返回的每张图片作为 Blob 存入素材库,并创建一条关联该输出的生成记录

#### Scenario: 生成失败
- **WHEN** 接口返回错误或请求失败
- **THEN** 系统将该次生成记录标记为失败并保存错误信息,不产生残缺素材

### Requirement: 协议适配
系统 SHALL 通过统一适配层支持 `images/generations` 与 `chat/completions` 两种协议,使上层以相同的输入(文字 + 参考图)与输出(图片列表)进行交互。

#### Scenario: images 协议
- **WHEN** 当前预设协议为 `images`
- **THEN** 系统请求 `images/generations` 并从 `data[].b64_json` 或 `data[].url` 解析图片

#### Scenario: chat 协议
- **WHEN** 当前预设协议为 `chat`
- **THEN** 系统请求 `chat/completions`,将参考图作为图像内容块发送,并从响应中提取图片

### Requirement: 参考图仅在 chat 协议可用
系统 SHALL 仅在 `chat` 协议下允许附带参考图;在 `images` 协议下 SHALL 禁用参考图输入并说明原因。

#### Scenario: images 协议下禁用参考图
- **WHEN** 当前预设协议为 `images`
- **THEN** 参考图输入区被禁用,并提示"当前接口不支持参考图"

#### Scenario: chat 协议下附带参考图
- **WHEN** 当前预设协议为 `chat` 且用户选择了若干参考图
- **THEN** 系统将这些图片随 prompt 一并发送

### Requirement: chat 响应图片提取
系统 SHALL 从 `chat/completions` 响应中稳健地提取图片,覆盖多种承载形式,并在无法提取时保留可诊断信息。

#### Scenario: 多形式提取兜底
- **WHEN** 响应以 `image_url` 内容块、markdown 图片语法、data URI、私有 `images[]` 数组或裸 URL 之一承载图片
- **THEN** 系统能识别并将其规整为图片并落库

#### Scenario: 无法提取
- **WHEN** 响应中未能识别到任何图片
- **THEN** 系统将该生成标记为无输出并保留原始响应片段供诊断

### Requirement: 多轮改图为参考图特例
系统 SHALL 允许用户将任一素材(包括以往生成的输出图)作为参考图发起新的生成,而不维护任何会话状态。

#### Scenario: 用输出图当参考图
- **WHEN** 用户选择素材库中一张图作为参考图并配以新 prompt 发起生成(chat 协议)
- **THEN** 系统按普通带参考图的生成处理,不携带此前对话上下文
