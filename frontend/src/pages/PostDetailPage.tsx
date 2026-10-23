import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ApiError } from '../api/client'
import { createComment, deleteComment } from '../api/comments'
import { fetchPost } from '../api/posts'
import type { Comment, Post } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { CommentItem } from '../components/CommentItem'
import { PostCard } from '../components/PostCard'
import { useToast } from '../components/toast'
import { useComments } from '../hooks/useComments'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import { remainingLength, validatePostBody } from '../validation/post'
import { NETWORK_ERROR_MESSAGE, toFormErrors } from './formErrors'

type PostState = { status: 'loading' } | { status: 'error' } | { status: 'missing' } | { status: 'ready'; post: Post }

const FIELDS = ['body'] as const
const POST_MISSING_MESSAGE = '投稿が見つかりません'

/** 投稿の詳細とコメント(S-04)。 */
export function PostDetailPage() {
  const id = Number(useParams().id)
  if (!Number.isInteger(id) || id <= 0) return <PostMissing />
  return <PostDetail key={id} id={id} />
}

function PostMissing() {
  return (
    <div className="panel center">
      <p>{POST_MISSING_MESSAGE}</p>
      <Link to="/">タイムラインへ戻る</Link>
    </div>
  )
}

function PostDetail({ id }: { id: number }) {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [state, setState] = useState<PostState>({ status: 'loading' })
  const comments = useComments(id)
  const sentinel = useInfiniteScroll(comments.hasNext && comments.more === 'idle', comments.loadMore)

  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const focusRequested = params.get('focus') === '1'

  // id ごとに作り直される(key)ので、初期状態の loading から始まる
  const loadPost = useCallback(() => {
    let cancelled = false
    fetchPost(id)
      .then((post) => !cancelled && setState({ status: 'ready', post }))
      .catch(
        (e) => !cancelled && setState({ status: e instanceof ApiError && e.status === 404 ? 'missing' : 'error' }),
      )
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => loadPost(), [loadPost])

  function retryPost() {
    setState({ status: 'loading' })
    loadPost()
  }

  // 💬 から来たときは、すぐ書き始められるように入力欄へフォーカスする
  const ready = state.status === 'ready'
  useEffect(() => {
    if (ready && focusRequested) input.current?.focus()
  }, [ready, focusRequested])

  const setPost = useCallback((post: Post) => setState({ status: 'ready', post }), [])
  const setCommentCount = useCallback(
    (commentCount: number) =>
      setState((s) => (s.status === 'ready' ? { status: 'ready', post: { ...s.post, commentCount } } : s)),
    [],
  )

  /** 操作の最中に投稿が消えていたら、メッセージを出してタイムラインへ戻す。 */
  function handleMissing(e: unknown): boolean {
    if (e instanceof ApiError && e.status === 404) {
      toast(POST_MISSING_MESSAGE)
      navigate('/')
      return true
    }
    return false
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (validatePostBody(draft) !== null || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const created = await createComment(id, draft.trim())
      setDraft('')
      comments.append(created.comment)
      setCommentCount(created.commentCount)
      // 続きが未取得だと一覧に足せないので、投稿できたことと表示場所を知らせる
      if (comments.hasNext) toast('コメントしました。一覧の末尾に表示されます')
    } catch (e) {
      if (!handleMissing(e)) {
        const errors = toFormErrors(e, FIELDS)
        setError(errors.fields.body ?? errors.form ?? null)
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(comment: Comment) {
    if (deletingId !== null || !window.confirm('このコメントを削除しますか?')) return
    setDeletingId(comment.id)
    try {
      const result = await deleteComment(comment.id)
      comments.remove(comment.id)
      setCommentCount(result.commentCount)
      toast('コメントを削除しました')
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        // 既に消えているコメント。一覧からも取り除く
        comments.remove(comment.id)
        toast('コメントが見つかりません')
      } else {
        toast(toFormErrors(e, FIELDS).form ?? '削除に失敗しました')
      }
    } finally {
      setDeletingId(null)
    }
  }

  if (state.status === 'loading') return <p className="muted center">読み込み中…</p>
  if (state.status === 'missing') return <PostMissing />
  if (state.status === 'error') {
    return (
      <div className="panel center">
        <p className="error">{NETWORK_ERROR_MESSAGE}</p>
        <button type="button" className="btn small" onClick={retryPost}>
          再読み込み
        </button>
      </div>
    )
  }

  const remaining = remainingLength(draft)
  return (
    <>
      <p>
        <Link to="/">← タイムラインへ戻る</Link>
      </p>
      <h1 className="sr-only">投稿の詳細</h1>
      <PostCard
        post={state.post}
        mine={state.post.author.id === user?.id}
        onUpdated={setPost}
        onDeleted={() => {
          navigate('/')
        }}
        detail
      />

      <form className="panel post-form" onSubmit={handleSubmit} noValidate>
        <label className="sr-only" htmlFor="comment-input">
          コメントを書く
        </label>
        <textarea
          id="comment-input"
          ref={input}
          className="post-textarea"
          rows={3}
          placeholder="コメントを書く"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-invalid={remaining < 0 ? true : undefined}
        />
        <p className="error" role="alert">
          {error}
        </p>
        <div className="post-form-foot">
          <span className={`counter${remaining < 0 ? ' over' : ''}`} aria-live="polite">
            残り {remaining} 文字
          </span>
          <button type="submit" className="btn primary" disabled={validatePostBody(draft) !== null || submitting}>
            {submitting ? '送信中…' : 'コメントする'}
          </button>
        </div>
      </form>

      <section aria-label="コメント">
        {comments.status === 'loading' && <p className="muted center">読み込み中…</p>}

        {comments.status === 'error' && (
          <div className="panel center">
            <p className="error">{NETWORK_ERROR_MESSAGE}</p>
            <button type="button" className="btn small" onClick={comments.retry}>
              再読み込み
            </button>
          </div>
        )}

        {comments.status === 'ready' && comments.items.length === 0 && (
          <p className="panel muted center">まだコメントがありません</p>
        )}

        {comments.items.length > 0 && (
          <div className="panel comments">
            {comments.items.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                busy={deletingId === comment.id}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {comments.status === 'ready' && comments.hasNext && (
          <div ref={sentinel} className="center muted">
            {comments.more === 'error' ? (
              <button type="button" className="btn small" onClick={comments.loadMore}>
                読み込みに失敗しました。再試行
              </button>
            ) : (
              '読み込み中…'
            )}
          </div>
        )}
      </section>
    </>
  )
}
