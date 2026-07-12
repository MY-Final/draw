## Why

当前生成参数(宽高比 / 分辨率 / 数量)藏在输入框下方一个折叠弹层里:要"点配置 → 选 → 再收起"三步,交互割裂;宽高比标签用"横屏/竖屏"且重名,看不出实际比例;且没有"Auto"选项,系统总会算出一个具体尺寸透传给接口,反而限制了服务端的自适应能力。

## What Changes

- 将宽高比 / 画质 / 数量参数从折叠弹层提到**输入框上方常驻显示**,做成一排可直接点选的 tag(一点即选,当前项高亮)。删除 `showParams` 弹层及其"点外部收起"逻辑(不再需要)。
- 宽高比标签改为**直接显示比例数字**(`1:1 / 16:9 / 9:16 / 4:3 / 3:4`),不再用"横屏/竖屏"这类会重名、看不懂的措辞。
- 新增 **`Auto`** 宽高比选项,并设为默认。语义为**不向接口发送 `size` 字段**,交由服务端/模型自适应。
- 比例集合扩充为:`Auto / 1:1 / 16:9 / 9:16 / 4:3 / 3:4 / 3:2 / 2:3`。
- 适配层去掉 `size` 的 `|| '1024x1024'` 兜底默认,改为**有值才发**;`Auto` 时 `computeSize` 返回 `null`,请求体不含 `size`。
- **BREAKING**(仅默认行为):新生成默认不再固定 1024x1024,而是走 Auto(不指定尺寸)。历史记录回填(prefill)向后兼容:旧格式仍解析出具体 ratio+resolution。

## Capabilities

### New Capabilities
<!-- 无新增能力 -->

### Modified Capabilities
- `image-generation`: "发起文生图生成"的尺寸参数语义变更 —— 支持 Auto(不发送 size),尺寸由 `ratio × resolution` 组合决定,Auto 时省略 size 字段。

## Impact

- `src/components/Composer.vue`:布局重构(参数移至输入框上方常驻 tag)、`RATIOS` 集合与标签、`computeSize` 支持 auto 返回 null、`applyPrefill` 兼容 auto、删除 `showParams` 相关状态与弹层。
- `src/lib/adapters.js`:`generateViaImages` 与 `generateViaImagesEdit` 两处 `size` 改为条件化(有值才发,去掉兜底默认)。
- UI 改动走 `ui-ux-pro-max` 技能(design D9),tag 平铺的间距/换行/高亮态套用既定设计系统 token。
- 无数据迁移:`ResultsView` 不读取 size/ratio,存储 `ratio:'auto'` / `size:null` 不影响任何展示与历史。
