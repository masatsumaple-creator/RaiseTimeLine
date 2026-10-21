import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from './time'

const NOW = Date.parse('2026-10-21T12:00:00Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()

describe('formatRelativeTime', () => {
  it('1 分未満はたった今', () => {
    expect(formatRelativeTime(ago(30_000), NOW)).toBe('たった今')
  })

  it('分・時間・日で切り替える', () => {
    expect(formatRelativeTime(ago(3 * 60_000), NOW)).toBe('3分前')
    expect(formatRelativeTime(ago(5 * 3_600_000), NOW)).toBe('5時間前')
    expect(formatRelativeTime(ago(2 * 86_400_000), NOW)).toBe('2日前')
  })

  it('1 週間以上前は日付', () => {
    expect(formatRelativeTime('2026-09-01T00:00:00Z', NOW)).toBe('2026/9/1')
  })
})
