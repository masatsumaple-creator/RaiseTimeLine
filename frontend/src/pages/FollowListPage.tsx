import { Link, useParams } from 'react-router'
import { fetchFollowList, type FollowListKind } from '../api/users'
import { UserList } from '../components/UserList'
import { usePagedList } from '../hooks/usePagedList'

const TABS: { kind: FollowListKind; label: string }[] = [
  { kind: 'following', label: 'フォロー中' },
  { kind: 'followers', label: 'フォロワー' },
]

const EMPTY_MESSAGES: Record<FollowListKind, string> = {
  following: 'まだフォローしていません',
  followers: 'まだフォロワーがいません',
}

/** フォロー中 / フォロワー一覧(S-08)。 */
export function FollowListPage({ kind }: { kind: FollowListKind }) {
  const handle = useParams().handle ?? ''
  return <FollowList key={`${kind}:${handle.toLowerCase()}`} kind={kind} handle={handle} />
}

function FollowList({ kind, handle }: { kind: FollowListKind; handle: string }) {
  const list = usePagedList(`${kind}:${handle}`, (cursor) => fetchFollowList(kind, handle, cursor))

  if (list.status === 'missing') {
    return (
      <div className="panel center">
        <p>ユーザーが見つかりません</p>
        <Link to="/">タイムラインへ戻る</Link>
      </div>
    )
  }

  return (
    <>
      <h1 className="follow-list-title">
        <Link to={`/users/${handle}`}>@{handle}</Link>
      </h1>

      <nav className="tabs" aria-label="フォロー中とフォロワー">
        {TABS.map((tab) => (
          <Link
            key={tab.kind}
            to={`/users/${handle}/${tab.kind}`}
            className={`tab${tab.kind === kind ? ' active' : ''}`}
            aria-current={tab.kind === kind ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <UserList list={list} emptyMessage={EMPTY_MESSAGES[kind]} />
    </>
  )
}
