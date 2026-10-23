import { Link } from 'react-router'
import type { UserSummary } from '../api/types'
import { useFollowToggle } from '../hooks/useFollowToggle'
import { Avatar } from './Avatar'

interface UserRowProps {
  user: UserSummary
  onChange: (id: number, patch: Partial<UserSummary>) => void
}

/** 自己紹介の 1 行目だけ(一覧では折りたたんで見せる)。 */
function firstLine(text: string): string {
  return text.split('\n')[0]
}

/** フォロー中 / フォロワー一覧の 1 行。その場でフォロー・解除できる(自分の行にはボタンを出さない)。 */
export function UserRow({ user, onChange }: UserRowProps) {
  const toggleFollow = useFollowToggle(user.handle, (patch) => onChange(user.id, { followedByMe: patch.followedByMe }))

  return (
    <li className="panel user-row">
      <Link to={`/users/${user.handle}`} className="user-row-avatar" aria-label={`${user.displayName}のプロフィール`}>
        <Avatar user={user} />
      </Link>
      <div className="user-row-main">
        <Link to={`/users/${user.handle}`} className="post-name">
          {user.displayName}
        </Link>
        <p className="muted user-row-handle">@{user.handle}</p>
        {user.bio && <p className="user-row-bio">{firstLine(user.bio)}</p>}
      </div>
      {!user.isMe && (
        <button
          type="button"
          className={`btn small user-row-follow${user.followedByMe ? '' : ' primary'}`}
          aria-pressed={user.followedByMe}
          aria-label={`${user.displayName}を${user.followedByMe ? 'フォロー解除' : 'フォロー'}`}
          onClick={() => toggleFollow({ followedByMe: user.followedByMe })}
        >
          {user.followedByMe ? 'フォロー中' : 'フォロー'}
        </button>
      )}
    </li>
  )
}
