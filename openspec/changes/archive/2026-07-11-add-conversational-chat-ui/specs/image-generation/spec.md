## MODIFIED Requirements

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

## ADDED Requirements

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
