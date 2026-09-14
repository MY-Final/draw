# api-connection Specification

## Purpose

管理用户配置的图像生成接口预设(baseURL、API Key、model、协议),提供本地安全存储与连通性检查,使生成面板可选用不同接口。

## Requirements

### Requirement: 接口预设管理
系统 SHALL 允许用户创建、编辑、删除多个「接口预设」,每个预设包含 baseURL、API Key、model 名称与 `requestTimeoutMs`。预设统一走标准 OpenAI images 接口(`/v1/images/generations` 与 `/v1/images/edits`),不再要求用户选择协议。

`requestTimeoutMs` 默认 SHALL 为 `180000`,且 SHALL 限制在 30–1800 秒范围内。

#### Scenario: 创建接口预设
- **WHEN** 用户填写 baseURL、Key、model 并保存
- **THEN** 系统持久化该预设并使其可在生成面板中选用

#### Scenario: 删除接口预设
- **WHEN** 用户删除一个预设
- **THEN** 系统移除该预设;若它是当前选中预设,则回退到默认预设或空态

### Requirement: 默认协议为文生图
系统 SHALL 统一以标准 OpenAI images 接口作为所有预设的协议,用户无需选择;带参考图时自动走 `/v1/images/edits` 改图,否则走 `/v1/images/generations` 文生图。

#### Scenario: 预设协议固定为 images
- **WHEN** 用户新建预设
- **THEN** 协议为 `images`,界面不提供协议选择

### Requirement: API Key 本地存储与告知
系统 SHALL 仅在浏览器本机(localStorage)保存 API Key,不向任何第三方(除目标接口外)发送,并 SHALL 向用户明示 Key 存储位置与风险。

#### Scenario: Key 仅存本机
- **WHEN** 用户保存含 Key 的预设
- **THEN** Key 写入 localStorage,且界面提示"仅存本机,勿在公共设备使用"

#### Scenario: 一键清除
- **WHEN** 用户点击清除凭据
- **THEN** 系统从 localStorage 移除所有 Key

### Requirement: 连通性检查
系统 SHALL 提供对选中预设的连通性检查,并对失败给出可区分的原因(网络/CORS、鉴权、接口错误、超时)。

#### Scenario: 连通性失败区分原因
- **WHEN** 连通性检查请求失败
- **THEN** 系统提示失败类别(如 CORS/网络、401 鉴权、超时、其他接口错误),而非笼统报错

### Requirement: 生成请求超时
系统 SHALL 使用预设的 `requestTimeoutMs` 中止超时的生成请求;用户主动取消与接口超时 SHALL 保持不同的失败语义。
