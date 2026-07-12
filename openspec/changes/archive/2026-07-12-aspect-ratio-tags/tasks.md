# Tasks

## 1. 适配层:size 条件化
- [x] 1.1 `src/lib/adapters.js` `generateViaImages`:`size` 改为 `if (params.size) body.size = params.size`,去掉 `|| '1024x1024'` 兜底
- [x] 1.2 `src/lib/adapters.js` `generateViaImagesEdit`:`size` 改为 `if (params.size) form.append('size', params.size)`,去掉兜底

## 2. Composer:数据与逻辑
- [x] 2.1 `RATIOS` 改为 `Auto / 1:1 / 16:9 / 9:16 / 4:3 / 3:4 / 3:2 / 2:3`,label 显示比例字面
- [x] 2.2 `ratio` 默认值从 `'1:1'` 改为 `'auto'`
- [x] 2.3 `computeSize`:`ratio === 'auto'` 返回 `null`,其余分支不变
- [x] 2.4 `submit()`:确认 `params.size` 为 `null` 时不误发(依赖任务 1)
- [x] 2.5 `applyPrefill`:`prefill.params.ratio === 'auto'` 时直接置 `ratio='auto'`;旧格式解析保持兼容
- [x] 2.6 删除 `showParams` 状态、`params-pop` 弹层、`⚙` chip;确认 `onDocClick` 仅剩 `showPromptLib` 分支

## 3. Composer:布局(走 ui-ux-pro-max / design D9)
- [x] 3.1 在参考图 chips 与 textarea 之间新增常驻参数区:第一行「比例」平铺 8 tag,第二行「画质」3 tag + 「数量」输入
- [x] 3.2 当前项高亮复用 `.btn-group-item.active` 语义;间距/换行/分组标签用设计系统 token
- [x] 3.3 `composer-bar` 精简为:协议提示 + 收藏(♡)+ 生成按钮
- [x] 3.4 窄屏(≤760px)验证换行不错乱

## 4. 验证
- [x] 4.1 Auto 生成:抓请求确认 body/form **不含 size**
- [x] 4.2 具体比例(16:9 × 2K)生成:确认 size 计算正确并发送
- [x] 4.3 点击外部:参数区常驻不受影响;prompt 收藏弹层仍能点外收起
- [x] 4.4 回填历史(旧格式具体尺寸 + 新格式 auto)均正确还原
- [x] 4.5 `openspec validate aspect-ratio-tags --strict` 通过
