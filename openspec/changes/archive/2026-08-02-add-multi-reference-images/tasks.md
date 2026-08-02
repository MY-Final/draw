# Tasks

## 1. 适配层:发送全部参考图
- [x] 1.1 `src/lib/adapters.js` `generateViaImagesEdit`:删除只取 `refImages[0]` 的逻辑;1 张时 `image` 字段、2+ 张时每张 `image[]` 字段全部 append,文件名按序编号(`image-1.png`…)
- [x] 1.2 注释同步:说明多图以重复 `image[]` 字段携带(官方 edits 支持最多 16 张源图)
- [x] 1.3 `src/lib/referenceUploads.js`:注释改为"批量上传保持顺序,全部参考图随请求发送"

## 2. UI:去掉「仅第一张」心智 + 16 张上限
- [x] 2.1 `src/components/Composer.vue`:移除 `multiRefOnImages`、`secondary` 降级样式与「用/未用」徽章;缩略图徽章改为按添加顺序显示数字 `1..n`
- [x] 2.2 缩略图 `:title` 与 `ref-tip` 文案更新(有图:「N 张参考图」;无图:「可多张」),不再出现"其余未用"
- [x] 2.3 新增 `MAX_REFERENCES = 16`;`addReference` 超限时提示并忽略;`applyPrefill` 回填收敛到前 16 张

## 3. 测试与验证
- [x] 3.1 `src/lib/__tests__/adapters.test.js`:多图用例改为断言全部参考图被 append(单图仍走 `image`,多图全走 `image[]`),更新用例名
- [x] 3.2 `npx vitest run` 全绿(70)
- [x] 3.3 `npx vite build` 通过
- [ ] 3.4 手动实测(newapi/gpt-image 系):多张参考图 + prompt 改图成功,服务端按图序理解各图 —— **需用户在真实中转站验证**
