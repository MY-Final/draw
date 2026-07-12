# Design

## D1 — 备份提醒触发策略

**条件**:总业务容量(`totalAssetBytes`)每增加 100MB 触发一次。
- 首次 >= 100MB 时触发
- 之后每增加 100MB(即 200MB、300MB…)再次触发
- 借助 `lastBackupReminderSize` 记录上次触发时的容量,避免重复弹窗

**冷却**:每次触发后记录 `lastBackupReminderTime`,30 天内不再提醒。
- "稍后提醒"按钮:关闭弹窗,不记录冷却,下次触发条件仍满足时继续弹
- "不再提醒(30天)"按钮:记录 `lastBackupReminderTime`,30 天冷却
- "立即备份"按钮:关闭弹窗 + 跳转到"存储与备份"面板

**存储**:localStorage,key = `backup.reminder.size` 和 `backup.reminder.time`。

## D2 — 持久化存储

```
if (!navigator.storage.persisted()) →
  显示横幅"启用浏览器持久化存储"
  按钮"立即启用" → navigator.storage.persist()
  失败 → 静默忽略
```

只在"存储与备份"面板内显示状态和引导,不做全局弹窗。

## D3 — 存储概览

```
已使用：138 MB          ← totalAssetBytes()
浏览器剩余：9.4 GB       ← navigator.storage.estimate()

图片：127 MB            ← totalAssetBytes()(就是业务总量)
┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
健康状态                 ← 按容量着色
🟢 < 500MB             正常
🟡 500MB ~ 2GB         较多(建议备份)
🔴 > 2GB               很大(建议立即备份)
```

健康色标用文字 + 色点表示,不使用 emoji(遵循 no-emoji-icons 规则),改用 CSS 色球。

## D4 — 导出备份格式

复用现有 `share.js` 的 `exportLibraryZip()`,在 manifest 中补充:
- `workspaces` — 工作区列表
- `promptLibrary` — 各工作区的 prompt 模板(localStorage 导出)

zip 结构不变:
```
manifest.json
assets/*.png
```

文件名改为 `DrawBackup_2026-07-12.zip`。

## D5 — 导入恢复

复用 `importLibraryZip()`,在恢复后补充:
- workspaces 写入 IndexedDB
- promptLibrary 写回 localStorage

完成时 toast 显示:
```
恢复完成: 图片 328 张 · 记录 412 条 · Prompt 521 条
```

## D6 — UI 布局

`BackupTools.vue` 重写,以"数据保护"为标题,单列布局:

```
┌──────────────────────────┐
│  数据保护                 │
├──────────────────────────┤
│  已使用 138 MB            │
│  浏览器剩余 9.4 GB        │
│  ● 正常                  │  ← 健康色球 + 状态文字
│  ──────────────────────  │
│  图片 127 MB              │
│  ──────────────────────  │
│  导出备份                 │
│  导入备份                 │
│  ──────────────────────  │
│  持久化存储: ● 已启用     │  ← 状态指示
│  最近备份: 2026-07-12     │
└──────────────────────────┘
```

底部导航栏的"存储与备份"按钮文案改为"数据保护"。
