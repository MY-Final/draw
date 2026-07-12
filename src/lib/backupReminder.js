// 备份提醒:基于容量递增触发,30 天冷却。
// localStorage keys:
//   backup.reminder.size  — 上次触发时的总业务字节数
//   backup.reminder.time  — 上次触发时间(用于 30 天冷却)

const REMINDER_SIZE_KEY = 'backup.reminder.size'
const REMINDER_TIME_KEY = 'backup.reminder.time'
const INCREMENT = 100 * 1024 * 1024 // 每 100MB
const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000 // 30 天

/** 检查是否应弹出备份提醒。返回 null 或提醒信息。 */
export function checkReminder(currentBytes) {
  const lastSize = parseInt(localStorage.getItem(REMINDER_SIZE_KEY) || '0', 10)
  const lastTime = parseInt(localStorage.getItem(REMINDER_TIME_KEY) || '0', 10)

  // 冷却期内不提醒
  if (lastTime && Date.now() - lastTime < COOLDOWN_MS) return null

  // 首次:>= 100MB 时触发
  if (lastSize === 0) {
    if (currentBytes >= INCREMENT) return { reason: 'size' }
    return null
  }

  // 后续:每增加 100MB 触发一次
  if (currentBytes >= lastSize + INCREMENT) return { reason: 'size' }

  return null
}

/** 标记已触发提醒(记录当前容量和时间)。30 天冷却。 */
export function dismissReminder(currentBytes) {
  localStorage.setItem(REMINDER_SIZE_KEY, String(currentBytes))
  localStorage.setItem(REMINDER_TIME_KEY, String(Date.now()))
}

/** "稍后提醒":只记录容量(下次超同样阈值再弹),不记冷却。 */
export function snoozeReminder(currentBytes) {
  localStorage.setItem(REMINDER_SIZE_KEY, String(currentBytes))
  // 不更新 time key,下次 check 只看 size
}
