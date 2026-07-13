## MODIFIED Requirements

### Requirement: 发起文生图生成
系统 SHALL 允许用户输入文字 prompt 与生成参数(model、宽高比、分辨率、画质、数量),使用当前选中的接口预设发起生成,并将结果图片存入素材库。画质 SHALL 作为真实参数 `quality`(`high`/`medium`/`low`)发送给接口,系统 SHALL NOT 通过向用户 prompt 追加文字的方式伪造画质。宽高比为具体比例时 SHALL 由「比例 × 分辨率」计算 `size` 发送,为 `Auto` 时不发送 `size`;`quality` 与 `size` 相互独立。

#### Scenario: 纯文生图成功
- **WHEN** 用户输入 prompt 并点击生成,接口返回图片
- **THEN** 系统将返回的每张图片作为 Blob 存入素材库,并创建一条关联该输出的生成记录

#### Scenario: 画质作为真实参数发送
- **WHEN** 用户选择画质(高/中/低)并发起生成
- **THEN** 系统在图像端点请求中发送 `quality` 字段(high/medium/low),且发送给接口的 prompt 与用户输入原文一致,不含系统追加的画质形容词

#### Scenario: 生成失败
- **WHEN** 接口返回错误或请求失败
- **THEN** 系统将该次生成记录标记为失败并保存错误信息,不产生残缺素材

### Requirement: 协议适配
系统 SHALL 通过统一适配层支持 `images/generations` 与 `chat/completions` 两种协议,使上层以相同的输入(文字 + 参考图)与输出(图片列表)进行交互。图像端点(`images/generations` 与 `images/edits`)SHALL 默认请求 `response_format: 'b64_json'` 以直接获取图片数据落库;当接口未返回 base64 而仅返回图片外链时,系统 SHALL 回退到下载该外链。协议与改图端点的选择 SHALL 由系统按「协议类型 + 是否带参考图」自动决定,不要求用户在生成时手动切换。

#### Scenario: images 协议
- **WHEN** 当前预设协议为 `images` 且无参考图
- **THEN** 系统请求 `images/generations`,默认带 `response_format: 'b64_json'`,并从 `data[].b64_json`(优先)或 `data[].url` 解析图片

#### Scenario: chat 协议
- **WHEN** 当前预设协议为 `chat`
- **THEN** 系统请求 `chat/completions`,将参考图作为图像内容块发送,并从响应中提取图片

#### Scenario: 改图端点自动选择
- **WHEN** 当前预设协议为 `images` 且用户附带了参考图
- **THEN** 系统自动请求 `images/edits`(无需用户切换到改图模式),默认带 `response_format: 'b64_json'`

## ADDED Requirements

### Requirement: 请求超时与无残留 pending
系统 SHALL 为接口调用与图片下载设置超时,超时按明确类别(如 timeout)记为失败,不使生成记录永久停留在 pending。系统 SHALL 在应用初始化时将超时仍未完成的历史 pending 记录调和为失败态,并 SHALL 允许用户删除 pending 记录。

#### Scenario: 请求超时记为失败
- **WHEN** 接口调用或图片外链下载超过超时阈值仍未返回
- **THEN** 系统中止该请求,将该次生成标记为失败并给出超时类错误,不停留在"生成中"

#### Scenario: 启动时调和遗留 pending
- **WHEN** 应用初始化载入了一条超过阈值仍为 pending 的历史生成记录
- **THEN** 系统将其标记为失败(注明中断原因),不再无限计时

#### Scenario: 可删除 pending 记录
- **WHEN** 用户对一条处于 pending 的生成记录执行删除
- **THEN** 系统允许删除该记录

### Requirement: 从剪贴板粘贴参考图
系统 SHALL 允许用户通过粘贴(Ctrl/Cmd+V)添加参考图,覆盖从文件、截图工具、网页"复制图片"等来源的剪贴板图片。

#### Scenario: 粘贴图片文件
- **WHEN** 剪贴板含图片,用户在工作台执行粘贴
- **THEN** 系统识别该图片(经 clipboard 的 files 或 items 任一路径)并将其加入参考图,不拦截纯文本粘贴

#### Scenario: 焦点不在输入框时粘贴
- **WHEN** 用户未聚焦输入框但剪贴板含图片并执行粘贴
- **THEN** 系统仍能捕获并加入该参考图
