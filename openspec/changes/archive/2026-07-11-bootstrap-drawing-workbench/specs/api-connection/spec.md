## ADDED Requirements

### Requirement: 接口预设管理
系统 SHALL 允许用户创建、编辑、删除多个「接口预设」,每个预设包含 baseURL、API Key、model 名称,以及协议类型(`images` 或 `chat`)。

#### Scenario: 创建接口预设
- **WHEN** 用户填写 baseURL、Key、model 并选择协议后保存
- **THEN** 系统持久化该预设并使其可在生成面板中选用

#### Scenario: 删除接口预设
- **WHEN** 用户删除一个预设
- **THEN** 系统移除该预设;若它是当前选中预设,则回退到默认预设或空态

### Requirement: 默认协议为文生图
系统 SHALL 以 `images/generations` 协议作为新建预设的默认协议。

#### Scenario: 新建预设默认协议
- **WHEN** 用户新建预设且未显式更改协议
- **THEN** 协议默认为 `images`

### Requirement: API Key 本地存储与告知
系统 SHALL 仅在浏览器本机(localStorage)保存 API Key,不向任何第三方(除目标接口外)发送,并 SHALL 向用户明示 Key 存储位置与风险。

#### Scenario: Key 仅存本机
- **WHEN** 用户保存含 Key 的预设
- **THEN** Key 写入 localStorage,且界面提示"仅存本机,勿在公共设备使用"

#### Scenario: 一键清除
- **WHEN** 用户点击清除凭据
- **THEN** 系统从 localStorage 移除所有 Key

### Requirement: 连通性检查
系统 SHALL 提供对选中预设的连通性检查,并对失败给出可区分的原因(网络/CORS、鉴权、接口错误)。

#### Scenario: 连通性失败区分原因
- **WHEN** 连通性检查请求失败
- **THEN** 系统提示失败类别(如 CORS/网络、401 鉴权、其他接口错误),而非笼统报错
