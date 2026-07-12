# Data Protection

## Backup Reminder

**Trigger**: Total business bytes (`totalAssetBytes()`) increases by each 100MB increment.
- Track threshold via `localStorage` key `backup.reminder.size`
- Cooldown: 30 days via `backup.reminder.time`

**Dialog**:
- Title: "建议备份你的创作数据"
- Body: "你的所有图片、Prompt、接口配置均保存在当前浏览器。如果清除浏览器数据、更换浏览器或更换电脑,数据可能无法恢复。建议定期导出备份。"
- Buttons: "立即备份", "稍后提醒", "30天不提醒"

**Behaviors**:
- "立即备份": closes dialog, navigates to storage panel
- "稍后提醒": closes dialog, re-triggers on next condition check
- "30天不提醒": sets `backup.reminder.time = Date.now()`

**Check timing**: on app init (`store.init()`), after each generation completes.

## Export Backup

**Trigger**: User clicks "导出备份" button.

**Output file**: `DrawBackup_YYYY-MM-DD.zip`

**Content**:
- `manifest.json` — schema v2, includes workspaces, presets (stripped keys), generations, assets metadata, promptLibrary entries per workspace
- `assets/*.png` — original image blobs

**Export function**: enhance `exportLibraryZip()` in `share.js`.

## Import Backup

**Trigger**: User clicks "导入备份" button, picks a `.zip` file.

**Import function**: enhance `importLibraryZip()` in `share.js`:
- Restore workspaces, generations, assets, presets, promptLibrary
- Handle schema version mismatch
- Handle workspace id conflicts (overwrite by id)

**Completion toast**: "恢复完成: 图片 N 张 · 记录 N 条 · Prompt N 条"

## Storage Overview

**Displayed in panel**:
- Business bytes (`totalAssetBytes()`) as "已使用"
- Browser quota remaining as "浏览器剩余"
- Health indicator: green (<500MB), yellow (500MB–2GB), red (>2GB)
- Persisted status: "已启用" / "未启用"

## Persistent Storage

**Detection**: `navigator.storage.persisted()` on panel mount.

**Prompt**: Shown only in the storage panel, not as a global dialog.
- Status text: "持久化存储: 已启用" or "持久化存储: 未启用"
- Button "立即启用" calls `navigator.storage.persist()`
- Failure: silent ignore, keep status as "未启用"
