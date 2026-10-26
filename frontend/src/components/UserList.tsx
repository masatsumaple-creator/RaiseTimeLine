import type { UserSummary } from '../api/types'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import type { PagedList } from '../hooks/usePagedList'
import { NETWORK_ERROR_MESSAGE } from '../pages/formErrors'
import { UserRow } from './UserRow'

interface UserListProps {
  list: PagedList<UserSummary>
  /** 0 件のときの文言 */
  emptyMessage: string
}

/** ユーザーの一覧(フォロー中 / フォロワー / 検索結果)の表示。読み込み中・失敗・空・続きの自動読み込みまで持つ。 */
export function UserList({ list, emptyMessage }: UserListProps) {
  const sentinel = useInfiniteScroll(list.hasNext && list.more === 'idle', list.loadMore)

  return (
    <>
      {list.status === 'loading' && <p className="muted center">読み込み中…</p>}

      {list.status === 'error' && (
        <div className="panel center">
          <p className="error">{NETWORK_ERROR_MESSAGE}</p>
          <button type="button" className="btn small" onClick={list.retry}>
            再読み込み
          </button>
        </div>
      )}

      {list.status === 'ready' && list.items.length === 0 && <p className="panel muted center">{emptyMessage}</p>}

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
