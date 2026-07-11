# storage-management Specification

## Purpose

管理本地存储:展示用量、删除素材释放空间,并支持整库 zip 导入导出,以及剥离凭据的接口预设与生成配方分享。

## Requirements

### Requirement: 存储用量展示
系统 SHALL 向用户展示本地存储用量,包含浏览器配额/已用估算,以及素材库按图累加的业务用量。

#### Scenario: 展示用量
- **WHEN** 用户打开存储管理
- **THEN** 系统展示浏览器估算用量/配额与素材库累计占用

### Requirement: 素材删除
系统 SHALL 允许用户删除素材以释放空间。

#### Scenario: 删除素材
- **WHEN** 用户删除一张或多张素材
- **THEN** 系统从 IndexedDB 移除对应 Blob 并更新用量展示

### Requirement: 整库 zip 导出
系统 SHALL 支持将素材与生成记录导出为单个 zip 文件。

#### Scenario: 导出为 zip
- **WHEN** 用户点击导出
- **THEN** 系统生成包含元数据清单(manifest)与全部图片文件的 zip 供下载

### Requirement: 整库 zip 导入
系统 SHALL 支持从本工作台导出的 zip 恢复素材与生成记录。

#### Scenario: 导入 zip
- **WHEN** 用户导入一个本工作台导出的 zip
- **THEN** 系统按清单回填素材与生成记录到 IndexedDB

#### Scenario: 无效 zip
- **WHEN** 导入的文件不含预期清单或格式不符
- **THEN** 系统拒绝导入并提示原因,不破坏现有数据

### Requirement: 接口预设分享导出与导入
系统 SHALL 支持将一个或多个接口预设导出为可分享文件,并支持导入他人分享的预设文件。导出 MUST 强制剥离 API Key,任何情况下都不得将 Key 写入分享文件。

#### Scenario: 导出预设强制剥离 Key
- **WHEN** 用户导出接口预设
- **THEN** 系统生成不含任何 API Key 的预设文件(仅含 baseURL、model、protocol 等非凭据字段)

#### Scenario: 导入他人预设需自填 Key
- **WHEN** 用户导入一个分享的预设文件
- **THEN** 系统创建对应预设,并将其标记为缺少 Key、提示用户填写后方可使用

### Requirement: 单次生成配方分享导出与导入
系统 SHALL 支持将单次生成事件导出为可复现的"配方",包含 prompt、参数、协议以及所需参考图,使他人导入后可复现该次生成。导出 MUST 强制剥离 API Key。

#### Scenario: 导出配方含参考图
- **WHEN** 用户导出一次生成的配方,且该生成使用了参考图
- **THEN** 导出文件包含 prompt、参数、协议与全部参考图,且不含任何 API Key

#### Scenario: 导入配方可复现
- **WHEN** 用户导入一个生成配方
- **THEN** 系统将参考图落入素材库,并以配方中的 prompt 与参数预填生成面板,供用户以自己的接口发起复现

#### Scenario: 导入配方缺少匹配协议
- **WHEN** 导入配方所需协议(如 chat)与用户任何现有预设都不匹配
- **THEN** 系统提示需要相应协议的接口预设,而非静默失败
