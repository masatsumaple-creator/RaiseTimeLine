import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { fetchTimeline } from '../api/posts'
import type { TimelineTab } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { NewPostsBar } from '../components/NewPostsBar'
import { PostCard } from '../components/PostCard'
import { PostForm } from '../components/PostForm'
import { useToast } from '../components/toast'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import { useNewPostsPolling } from '../hooks/useNewPostsPolling'
import { useTimeline } from '../hooks/useTimeline'
import { NETWORK_ERROR_MESSAGE } from './formErrors'

const TABS: { id: TimelineTab; label: string }[] = [
  { id: 'following', label: 'フォロー中' },
  { id: 'all', label: '全体' },
]

const EMPTY_MESSAGES: Record<TimelineTab, string> = {
  following: 'まだ投稿がありません。投稿するか、気になるユーザーをフォローしましょう。',
  all: 'まだ投稿がありません。',
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

/** ログイン後のホーム(S-03)。投稿フォームとタイムライン。 */
export function TimelinePage() {
  const { user } = useAuth()
  const toast = useToast()
  const [tab, setTab] = useState<TimelineTab>('following')
  const timeline = useTimeline(tab, (cursor) => fetchTimeline(tab, cursor))
  const known = useMemo(() => new Set(timeline.items.map((p) => p.id)), [timeline.items])
  const newPosts = useNewPostsPolling(tab, timeline.baseId, known, timeline.status === 'ready')

  // 一覧の末尾が見えたら、続きを自動で読み込む(無限スクロール)
  const sentinel = useInfiniteScroll(timeline.hasNext && timeline.more === 'idle', timeline.loadMore)

  function handleTabClick(next: TimelineTab) {
    if (next !== tab) {
      setTab(next)
      return
    }
    // 表示中のタブをもう一度押したら、最新の状態に更新する
    scrollToTop()
    void timeline.refresh().then((ok) => {
      if (!ok) toast(NETWORK_ERROR_MESSAGE)
    })
  }

  async function showNewPosts() {
    if (newPosts.hasMore) {
      // 新着が多く、手元の一覧との間に欠落ができるので取り直す
      if (!(await timeline.refresh())) {
        toast(NETWORK_ERROR_MESSAGE)
        return
      }
    } else {
      timeline.prepend(newPosts.items)
    }
    newPosts.clear()
    scrollToTop()
  }

  return (
    <>
      <h1 className="sr-only">タイムライン</h1>
      <PostForm onCreated={timeline.prependOwn} />

      <div className="tabs" role="tablist" aria-label="タイムラインの種類">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            className={`tab${tab === id ? ' active' : ''}`}
            onClick={() => handleTabClick(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {newPosts.count > 0 && <NewPostsBar count={newPosts.count} hasMore={newPosts.hasMore} onClick={showNewPosts} />}

      <div role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {timeline.status === 'loading' && <p className="muted center">読み込み中…</p>}

        {timeline.status === 'error' && (
          <div className="panel center">
            <p className="error">{NETWORK_ERROR_MESSAGE}</p>
            <button type="button" className="btn small" onClick={timeline.retry}>
              再読み込み
            </button>
          </div>
        )}

        {timeline.status === 'ready' && timeline.items.length === 0 && (
          <div className="panel muted center">
            <p>{EMPTY_MESSAGES[tab]}</p>
            {tab === 'following' && (
              // フォローする人を探す入口: ユーザー検索(S-07)と、「全体」タブ
              <div className="empty-actions">
                <Link className="btn small primary" to="/search">
                  ユーザーを検索
                </Link>
                <button type="button" className="btn small" onClick={() => setTab('all')}>
                  「全体」で探す
                </button>
              </div>
            )}
          </div>
        )}

        {timeline.items.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            mine={post.author.id === user?.id}
            onUpdated={timeline.replace}
            onDeleted={timeline.remove}
          />
        ))}

        {timeline.status === 'ready' && timeline.hasNext && (
          <div ref={sentinel} className="center muted">
            {timeline.more === 'error' ? (
              <button type="button" className="btn small" onClick={timeline.loadMore}>
                読み込みに失敗しました。再試行
              </button>
            ) : (
              '読み込み中…'
            )}
          </div>
        )}
      </div>
    </>
  )
}
