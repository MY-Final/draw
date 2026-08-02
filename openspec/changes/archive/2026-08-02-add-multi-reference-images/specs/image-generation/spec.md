## MODIFIED Requirements

### Requirement: 参考图改图
系统 SHALL 允许用户附带一张或多张参考图发起改图,经 `/v1/images/edits` 端点以「参考图 + prompt」发起,并将结果图存入素材库。单次最多 SHALL 携带 16 张参考图。

#### Scenario: 附带参考图走 edits
- **WHEN** 用户选择了参考图并发起生成
- **THEN** 系统以 multipart 请求 `/v1/images/edits`,将参考图与 prompt 一并发送

#### Scenario: 多张参考图全部发送
- **WHEN** 用户选择了多张参考图(2–16 张)
- **THEN** 系统将全部参考图一并发送:单张参考图使用 `image` 字段,多张时每张以 `image[]` 字段重复携带,按用户选择顺序编号

#### Scenario: 参考图超过 16 张
- **WHEN** 用户尝试添加第 17 张参考图
- **THEN** 系统不将其加入本次生成,并给出最多 16 张的明确提示

#### Scenario: 模型不支持改图
- **WHEN** 目标模型不支持带参考图改图(如 dall-e-3)
- **THEN** 系统将该次生成标记为失败并如实展示接口返回的错误,不静默吞掉
