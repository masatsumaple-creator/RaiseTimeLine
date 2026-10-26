import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ApiError } from '../api/client'
import { fetchProfile, fetchUserPosts } from '../api/users'
import type { UserProfile } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { Avatar } from '../components/Avatar'
import { PostCard } from '../components/PostCard'
import { useFollowToggle } from '../hooks/useFollowToggle'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import { useTimeline } from '../hooks/useTimeline'
import { NETWORK_ERROR_MESSAGE } from './formErrors'

type ProfileState = { status: 'loading' } | { status: 'error' } | { status: 'missing' } | { status: 'ready'; profile: UserProfile }

/** ユーザーのプロフィールと投稿一覧(S-05)。 */
export function ProfilePage() {
  const handle = useParams().handle ?? ''
  return <Profile key={handle.toLowerCase()} handle={handle} />
}

function Profile({ handle }: { handle: string }) {
  const { user } = useAuth()
  const [state, setState] = useState<ProfileState>({ status: 'loading' })
  const posts = useTimeline(`user:${handle}`, (cursor) => fetchUserPosts(handle, cursor))
  const sentinel = useInfiniteScroll(posts.hasNext && posts.more === 'idle', posts.loadMore)

  function patchProfile(patch: Partial<UserProfile>) {
    setState((s) => (s.status === 'ready' ? { status: 'ready', profile: { ...s.profile, ...patch } } : s))
  }

  const toggleFollow = useFollowToggle(handle, patchProfile)

  // handle ごとに作り直される(key)ので、初期状態の loading から始まる
  const loadProfile = useCallback(() => {
    let cancelled = false
    fetchProfile(handle)
      .then((profile) => !cancelled && setState({ status: 'ready', profile }))
      .catch((e) => !cancelled && setState({ status: e instanceof ApiError && e.status === 404 ? 'missing' : 'error' }))
    return () => {
      cancelled = true
    }
  }, [handle])

  useEffect(() => loadProfile(), [loadProfile])

  if (state.status === 'loading') return <p className="muted center">読み込み中…</p>

  if (state.status === 'missing') {
    return (
      <div className="panel center">
        <p>ユーザーが見つかりません</p>
        <Link to="/">タイムラインへ戻る</Link>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="panel center">
        <p className="error">{NETWORK_ERROR_MESSAGE}</p>
        <button
          type="button"
          className="btn small"
          onClick={() => {
            setState({ status: 'loading' })
            loadProfile()
          }}
        >
          再読み込み
        </button>
      </div>
    )
  }

  const { profile } = state
  return (
    <>
      <section className="panel profile" aria-labelledby="profile-name">
        <Avatar user={profile} size="lg" />
        <div className="profile-main">
          <h1 id="profile-name" className="profile-name">
            {profile.displayName}
          </h1>
          <p className="muted profile-handle">@{profile.handle}</p>
          {profile.bio && <p className="profile-bio">{profile.bio}</p>}
          <p className="profile-counts">
            <Link to={`/users/${profile.handle}/following`}>
              <strong>{profile.followingCount}</strong> フォロー中
            </Link>
            <Link to={`/users/${profile.handle}/followers`}>
              <strong>{profile.followerCount}</strong> フォロワー
            </Link>
          </p>
        </div>
        {profile.isMe ? (
          <Link className="btn small profile-follow" to="/settings/profile">
            プロフィールを編集
          </Link>
        ) : (
          <button
            type="button"
            className={`btn small profile-follow${profile.followedByMe ? '' : ' primary'}`}
            aria-pressed={profile.followedByMe}
            onClick={() => toggleFollow(profile)}
          >
            {profile.followedByMe ? 'フォロー中' : 'フォロー'}
          </button>
        )}
      </section>

      {posts.status === 'loading' && <p className="muted center">読み込み中…</p>}

      {posts.status === 'error' && (
        <div className="panel center">
          <p className="error">{NETWORK_ERROR_MESSAGE}</p>
          <button type="button" className="btn small" onClick={posts.retry}>
            再読み込み
          </button>
        </div>
      )}

      {posts.status === 'ready' && posts.items.length === 0 && <p className="panel muted center">まだ投稿がありません</p>}

      {posts.items.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          mine={post.author.id === user?.id}
          onUpdated={posts.replace}
          onDeleted={posts.remove}
        />
      ))}

      {posts.status === 'ready' && posts.hasNext && (
        <div ref={sentinel} className="center muted">
          {posts.more === 'error' ? (
            <button type="button" className="btn small" onClick={posts.loadMore}>
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
