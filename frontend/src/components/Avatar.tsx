import type { User } from '../api/types'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444', '#14b8a6', '#6366f1']

interface AvatarProps {
  user: Pick<User, 'id' | 'displayName'>
  size?: 'sm' | 'lg'
}

/** アイコン画像(F-17)は未実装なので、表示名の頭文字を色付きの丸に入れる。 */
export function Avatar({ user, size }: AvatarProps) {
  const initial = Array.from(user.displayName)[0] ?? '?'
  return (
    <span className={`avatar${size ? ` ${size}` : ''}`} style={{ background: COLORS[user.id % COLORS.length] }} aria-hidden="true">
      {initial}
    </span>
  )
}
