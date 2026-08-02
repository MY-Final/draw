## Why

用户反馈:按参考图生成时一次只能生效一张,不能使用多张参考图。当前产品虽然在输入区可以堆叠多张参考图缩略图,但适配层在 `images/edits` 请求里只发送第一张,其余全部标为「未用」,用户选多张后看到的是"选了但没用上"的割裂体验。

官方 `/v1/images/edits` 端点(GPT Image 系模型,如 `gpt-image-1.5` / `gpt-image-1`)已支持一张或多张源图,单次最多 16 张,multipart 通过重复的 `image[]` 字段携带。因此这是纯客户端链路放开的改造,不需要服务端配合。

## What Changes

- **适配层发送全部参考图**:`generateViaImagesEdit` 由「只 append 第一张 `image`」改为「全部发送」——单图沿用 `image` 字段(兼容 DALL·E 2 与旧中转站,零回归),多图每张以 `image[]` 字段重复携带(对齐官方多图写法)。
- **UI 去掉"仅第一张"心智**:移除第 2 张及以后的灰色降级与「未用」徽章,改为按添加顺序显示数字徽章(多图改图时顺序即「图 1 / 图 2」,提示语同步更新);提示文案不再出现"其余未用"。
- **16 张上限**:参考图最多 16 张,超出时给出明确提示并忽略新图(与官方上限一致),避免把必然失败的请求发出去。
- **行为说明同步**:主 spec 与 README 的多参考图说明更新;历史生成记录/分享配方照常(配方回填时同样收敛到 16 张)。

## Capabilities

### New Capabilities
<!-- 无新增能力 -->

### Modified Capabilities
- `image-generation`: 参考图改图支持多张源图(最多 16 张),全部随 edits 请求发送;删除"多张仅取第一张"的限制。

## Impact

- `src/lib/adapters.js`:edits multipart 组装逻辑(单图 `image` / 多图 `image[]` 全部发送)。
- `src/components/Composer.vue`:参考图 chips 的徽章/提示语义、16 张上限与超限提示、配方回填收敛。
- `src/lib/referenceUploads.js`:注释同步(批量上传的图全部会发送)。
- `src/lib/__tests__/adapters.test.js`:多图用例改为断言全部字段被发送。
- `openspec/specs/image-generation/spec.md` 与 README(中/英):行为说明同步。
- 无数据迁移;历史记录不受影响。
