## MODIFIED Requirements

### Requirement: 接口预设管理
系统 SHALL 允许用户创建、编辑、删除多个「接口预设」,每个预设包含 baseURL、API Key、model 名称。预设统一走标准 OpenAI images 接口(`/v1/images/generations` 与 `/v1/images/edits`),不再要求用户选择协议。

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

### Requirement: 连通性检查
系统 SHALL 提供对选中预设的连通性检查,并对失败给出可区分的原因(网络/CORS、鉴权、接口错误、超时)。

#### Scenario: 连通性失败区分原因
- **WHEN** 连通性检查请求失败
- **THEN** 系统提示失败类别(如 CORS/网络、401 鉴权、超时、其他接口错误),而非笼统报错
