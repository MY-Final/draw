# Tasks

## T1 — 存储概览

- [x] `BackupTools.vue` 重写布局:标题"数据保护",单列展示已用量、浏览器剩余、健康色球
- [x] 健康状态色标: < 500MB 绿色 · 500MB ~ 2GB 黄色 · > 2GB 红色
- [x] 补充 `formatBytes()` 到 UI 展示的各个位置
- [x] 底部导航"存储与备份"改为"数据保护"

## T2 — 导出备份增强

- [x] `share.js` 的 `exportLibraryZip()` 补充 workspace 列表和 promptLibrary(按工作区) 到 manifest
- [x] 导出文件名改为 `DrawBackup_YYYY-MM-DD.zip`
- [x] `BackupTools.vue` 按钮为"导出备份"

## T3 — 导入恢复增强

- [x] `share.js` 的 `importLibraryZip()` 补充 workspace 和 promptLibrary 的恢复逻辑
- [x] schema version bump 到 2,兼容 v1 schema 的导入
- [x] 恢复完成后 toast 显示统计:图片、记录、Prompt 数量
- [x] `BackupTools.vue` 按钮为"导入备份"

## T4 — 备份提醒

- [x] 新建 `src/lib/backupReminder.js`:check 函数(容量 + 冷却检测),show 函数(弹窗)
- [x] 弹窗组件:标题、正文、三个按钮(立即备份/稍后提醒/30天不提醒)
- [x] 在 `store.init()` 和每次生成完成后调用 check
- [x] "立即备份"关闭弹窗,"稍后提醒"不记录冷却,"30天不提醒"记录时间
- [x] 容量触发阈值:每 100MB 一次,记录 `backup.reminder.size` 和 `backup.reminder.time`

## T5 — 持久化存储

- [x] 在"数据保护"面板中检测 `navigator.storage.persisted()` 并显示状态
- [x] "立即启用"按钮调用 `navigator.storage.persist()`
- [x] 失败时静默忽略,保持状态为"未启用"
