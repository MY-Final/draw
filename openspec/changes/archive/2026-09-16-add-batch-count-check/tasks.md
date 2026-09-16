# Tasks

## 1. 服务层(generationService.js)
- [x] 1.1 计算 `requested`(= n,下限 1)并在 `images.length < requested && requested > 1` 时置 `partial`
- [x] 1.2 partial 时写入 `partialNote`(请求 N 张 / 实际 M 张)与 `rawResponseSnippet`
- [x] 1.3 非 partial 不写上述字段

## 2. UI(ResultsView.vue)
- [x] 2.1 回复卡展示 partial 告警文案与原始响应片段

## 3. 验证
- [x] 3.1 请求 4 张返回 2 张:标记成功 + `partialNote` + 片段
- [x] 3.2 请求 N 张返回 N 张:无 `partialNote`
- [x] 3.3 `npm run lint` / `npm test` / `npm run build` 通过
