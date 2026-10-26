import { useState } from 'react'
import type { User } from '../api/types'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444', '#14b8a6', '#6366f1']

interface AvatarProps {
  user: Pick<User, 'id' | 'displayName' | 'avatarUrl'>
  size?: 'sm' | 'lg'
}

/** アイコン画像(avatarUrl)があれば画像を、無い・読み込めないときは、表示名の頭文字を色付きの丸に入れて表示する。 */
export function Avatar({ user, size }: AvatarProps) {
  // 署名付き URL の期限切れなどで読み込めなかった URL は、頭文字に戻す(画像が割れた表示にしない)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const url = user.avatarUrl && user.avatarUrl !== failedUrl ? user.avatarUrl : null
  const initial = Array.from(user.displayName)[0] ?? '?'
  return (
    <span className={`avatar${size ? ` ${size}` : ''}`} style={{ background: COLORS[user.id % COLORS.length] }} aria-hidden="true">
      {url ? <img src={url} alt="" draggable={false} onError={() => setFailedUrl(url)} /> : initial}
    </span>
  )
}
