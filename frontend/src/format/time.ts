const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** 「3分前」のような相対表示。1 週間以上前は日付にする。 */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const created = new Date(iso)
  const elapsed = now - created.getTime()
  if (elapsed < MINUTE) return 'たった今'
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}分前`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}時間前`
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)}日前`
  return created.toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' })
}
