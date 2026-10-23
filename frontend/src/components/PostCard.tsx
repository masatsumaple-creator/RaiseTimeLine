import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ApiError } from '../api/client'
import { deletePost, likePost, unlikePost, updatePost } from '../api/posts'
import type { Post } from '../api/types'
import { formatRelativeTime } from '../format/time'
import { toFormErrors } from '../pages/formErrors'
import { remainingLength, validatePostBody } from '../validation/post'
import { Avatar } from './Avatar'
import { useToast } from './toast'

interface PostCardProps {
  post: Post
  /** ログイン中のユーザー自身の投稿か(編集・削除ボタンを出す) */
  mine: boolean
  onUpdated: (post: Post) => void
  onDeleted: (id: number) => void
  /** 詳細画面(S-04)での表示。カード全体を詳細へのリンクにせず、コメント数は押せない表示にする */
  detail?: boolean
}

const FIELDS = ['body'] as const
const NOT_FOUND_MESSAGE = '投稿が見つかりません'

/** カード内でクリックされても詳細へ移動しない要素(ボタン・リンク・入力欄など)。 */
const INTERACTIVE = 'a,button,textarea,input,form'

export function PostCard({ post, mine, onUpdated, onDeleted, detail = false }: PostCardProps) {
  const toast = useToast()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(post.body)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // いいねは連打されうるので、最後に押した操作の結果だけを反映する
  const likeSeq = useRef(0)
  const latest = useRef(post)
  useEffect(() => {
    latest.current = post
  }, [post])

  function startEdit() {
    setDraft(post.body)
    setError(null)
    setEditing(true)
  }

  /** 編集・削除の最中に投稿が消えていた場合は、一覧からも取り除く。 */
  function handleMissing(e: unknown): boolean {
    if (e instanceof ApiError && e.status === 404) {
      toast(NOT_FOUND_MESSAGE)
      onDeleted(post.id)
      return true
    }
    return false
  }

  async function toggleLike() {
    const before = latest.current
    const liked = !before.likedByMe
    const seq = ++likeSeq.current
    onUpdated({ ...before, likedByMe: liked, likeCount: Math.max(0, before.likeCount + (liked ? 1 : -1)) })
    try {
      const result = await (liked ? likePost : unlikePost)(post.id)
      if (seq === likeSeq.current) onUpdated({ ...latest.current, ...result })
    } catch (e) {
      if (seq !== likeSeq.current) return
      if (!handleMissing(e)) {
        onUpdated({ ...latest.current, likedByMe: before.likedByMe, likeCount: before.likeCount })
        toast('いいねに失敗しました')
      }
    }
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    if (validatePostBody(draft) !== null || busy) return
    setBusy(true)
    setError(null)
    try {
      const updated = await updatePost(post.id, draft.trim())
      onUpdated(updated)
      setEditing(false)
    } catch (e) {
      if (!handleMissing(e)) {
        const errors = toFormErrors(e, FIELDS)
        setError(errors.fields.body ?? errors.form ?? null)
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (busy || !window.confirm('この投稿を削除しますか?')) return
    setBusy(true)
    try {
      await deletePost(post.id)
      toast('投稿を削除しました')
      onDeleted(post.id)
    } catch (e) {
      if (!handleMissing(e)) toast(toFormErrors(e, FIELDS).form ?? '削除に失敗しました')
      setBusy(false)
    }
  }

  const remaining = remainingLength(draft)

  return (
    <article
      className={`panel post${detail ? '' : ' clickable'}`}
      onClick={(e) => {
        if (detail || (e.target as Element).closest(INTERACTIVE)) return
        // 文字を選択している最中のクリックでは移動しない
        if (window.getSelection()?.toString()) return
        navigate(`/posts/${post.id}`)
      }}
    >
      <Link to={`/users/${post.author.handle}`} className="post-avatar" aria-label={`${post.author.displayName}のプロフィール`}>
        <Avatar user={post.author} />
      </Link>
      <div className="post-main">
        <header className="post-head">
          <Link className="post-name" to={`/users/${post.author.handle}`}>
            {post.author.displayName}
          </Link>
          <span className="muted">@{post.author.handle}</span>
          <span className="muted">·</span>
          <time className="muted" dateTime={post.createdAt}>
            {formatRelativeTime(post.createdAt)}
          </time>
          {post.editedAt && <span className="muted">(編集済み)</span>}
        </header>

        {editing ? (
          <form onSubmit={handleSave} noValidate>
            <label className="sr-only" htmlFor={`edit-${post.id}`}>
              投稿を編集
            </label>
            <textarea
              id={`edit-${post.id}`}
              className="post-textarea"
              rows={3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-invalid={remaining < 0 ? true : undefined}
            />
            <p className="error" role="alert">
              {error}
            </p>
            <div className="post-form-foot">
              <span className={`counter${remaining < 0 ? ' over' : ''}`}>残り {remaining} 文字</span>
              <span className="post-actions">
                <button type="button" className="btn small" onClick={() => setEditing(false)} disabled={busy}>
                  キャンセル
                </button>
                <button type="submit" className="btn small primary" disabled={busy || validatePostBody(draft) !== null}>
                  {busy ? '保存中…' : '保存'}
                </button>
              </span>
            </div>
          </form>
        ) : (
          <p className="post-body">{post.body}</p>
        )}

        {!editing && (
          <div className="post-footer">
            {detail ? (
              <span className="act" aria-label={`コメント ${post.commentCount} 件`}>
                💬 {post.commentCount}
              </span>
            ) : (
              <Link
                className="act"
                to={`/posts/${post.id}?focus=1`}
                aria-label={`コメント ${post.commentCount} 件。コメントする`}
              >
                💬 {post.commentCount}
              </Link>
            )}
            <button
              type="button"
              className={`act like${post.likedByMe ? ' on' : ''}`}
              aria-pressed={post.likedByMe}
              aria-label={`いいね ${post.likeCount} 件`}
              onClick={toggleLike}
            >
              {post.likedByMe ? '♥' : '♡'} {post.likeCount}
            </button>
          </div>
        )}

        {mine && !editing && (
          <div className="post-actions">
            <button type="button" className="btn small" onClick={startEdit} disabled={busy}>
              編集
            </button>
            <button type="button" className="btn small danger" onClick={handleDelete} disabled={busy}>
              削除
            </button>
          </div>
        )}
      </div>
    </article>
  )
}
