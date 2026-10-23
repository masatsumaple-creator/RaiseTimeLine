import { Link, useParams } from 'react-router'
import { fetchFollowList, type FollowListKind } from '../api/users'
import { UserRow } from '../components/UserRow'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import { usePagedList } from '../hooks/usePagedList'
import { NETWORK_ERROR_MESSAGE } from './formErrors'

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
  const sentinel = useInfiniteScroll(list.hasNext && list.more === 'idle', list.loadMore)

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

      {list.status === 'loading' && <p className="muted center">読み込み中…</p>}

      {list.status === 'error' && (
        <div className="panel center">
          <p className="error">{NETWORK_ERROR_MESSAGE}</p>
          <button type="button" className="btn small" onClick={list.retry}>
            再読み込み
          </button>
        </div>
      )}

      {list.status === 'ready' && list.items.length === 0 && <p className="panel muted center">{EMPTY_MESSAGES[kind]}</p>}

      <ul className="user-list">
        {list.items.map((user) => (
          <UserRow key={user.id} user={user} onChange={list.patch} />
        ))}
      </ul>

      {list.status === 'ready' && list.hasNext && (
        <div ref={sentinel} className="center muted">
          {list.more === 'error' ? (
            <button type="button" className="btn small" onClick={list.loadMore}>
              読み込みに失敗しました。再試行
            </button>
          ) : (
            '読み込み中…'
          )}
        </div>
      )}
    </>
  )
}
