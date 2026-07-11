# image-generation Specification

## Purpose

通过统一适配层支持 `images/generations` 与 `chat/completions` 两种协议发起图像生成,处理参考图、稳健的响应提取,并将结果落入素材库。

## Requirements

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
系统 SHALL 允许在 `chat` 与 `images` 两种协议下附带参考图;`images` 协议附带参考图时经 `images/edits` 端点改图。参考图输入 SHALL NOT 再按协议禁用;仅当目标接口/模型实际不支持时,由请求失败如实提示。

#### Scenario: images 协议附带参考图走 edits
- **WHEN** 当前预设协议为 `images` 且用户选择了参考图
- **THEN** 系统请求 `images/edits`(multipart),将参考图与 prompt 一并发送

#### Scenario: chat 协议下附带参考图
- **WHEN** 当前预设协议为 `chat` 且用户选择了若干参考图
- **THEN** 系统将这些图片作为图像内容块随 prompt 一并发送

#### Scenario: 模型不支持改图
- **WHEN** 目标模型不支持带参考图改图(如 dall-e-3)
- **THEN** 系统将该次生成标记为失败并如实展示接口返回的错误,不静默吞掉

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

### Requirement: images/edits 改图
系统 SHALL 在 `images` 协议且存在参考图时,通过 `images/edits` 端点以"参考图 + prompt"发起改图,并将结果图存入素材库。

#### Scenario: 基于原图改图
- **WHEN** 用户在 images 协议下选择一张参考图并输入改图 prompt 后生成
- **THEN** 系统以 multipart 请求 `images/edits`,解析返回图片并落库

#### Scenario: 多张参考图仅取其一
- **WHEN** images 协议下用户选择了多张参考图
- **THEN** 系统仅使用第一张发起 edits,并提示该限制

### Requirement: 重新生成
系统 SHALL 允许用户对任一生成事件以相同 prompt、参数与参考图重新生成一次,作为当前画布中的新事件,不改动原事件。

#### Scenario: 一键重新生成
- **WHEN** 用户在某条生成上点击"重新生成"
- **THEN** 系统以相同 prompt/参数/参考图发起一次新的生成,原记录保持不变

### Requirement: 生成后清空输入
系统 SHALL 在成功发起一次生成后清空输入框的 prompt 与已选参考图,以便直接开始下一次输入。

#### Scenario: 发起后清空
- **WHEN** 用户点击生成且请求已成功发起
- **THEN** 输入框的 prompt 与参考图被清空

### Requirement: 对话式历史呈现
系统 SHALL 将生成历史呈现为对话式:每条生成显示为"用户请求"与"AI 回复"两部分,使请求与产出一目了然。

#### Scenario: 请求与回复分块
- **WHEN** 一条生成完成
- **THEN** 界面以用户请求(prompt)与 AI 回复(模型名、状态、结果图、参考图缩略、操作区)两块分别呈现

#### Scenario: 生成中回复占位
- **WHEN** 一条生成正在进行
- **THEN** AI 回复块显示"正在生成"状态与骨架占位,请求块正常显示

### Requirement: 删除单条生成
系统 SHALL 允许用户从对话流删除任一条生成记录(尤其失败/空结果),并提供可撤销的删除:删除后先从视图移除并给出撤销机会,撤销窗口结束后才真正落库删除。产出图的连带删除遵循素材库的引用感知规则。

#### Scenario: 删除并可撤销
- **WHEN** 用户在某条生成的回复卡上点击删除
- **THEN** 系统立即将该条从对话流移除并显示可撤销提示,在撤销窗口内尚未落库删除

#### Scenario: 撤销恢复
- **WHEN** 用户在撤销窗口内点击撤销
- **THEN** 系统恢复该条生成,不发生任何删除

#### Scenario: 窗口结束后落库
- **WHEN** 撤销窗口结束且用户未撤销
- **THEN** 系统真正删除该生成记录,并按引用感知规则连带删除其产出图

### Requirement: 清空全部生成记录
系统 SHALL 在"清空全部"操作中删除所有生成记录(与素材库的清空全部协同),保留接口预设与 Key。

#### Scenario: 清空后无历史
- **WHEN** 用户确认清空全部
- **THEN** 系统删除所有生成记录,左侧会话导航与对话流均回到空状态
