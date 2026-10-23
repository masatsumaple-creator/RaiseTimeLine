import type { Comment } from '../api/types'
import { formatRelativeTime } from '../format/time'
import { Avatar } from './Avatar'

interface CommentItemProps {
  comment: Comment
  busy: boolean
  onDelete: (comment: Comment) => void
}

export function CommentItem({ comment, busy, onDelete }: CommentItemProps) {
  return (
    <article className="comment">
      <Avatar user={comment.author} />
      <div className="post-main">
        <header className="post-head">
          <span className="post-name">{comment.author.displayName}</span>
          <span className="muted">@{comment.author.handle}</span>
          <span className="muted">·</span>
          <time className="muted" dateTime={comment.createdAt}>
            {formatRelativeTime(comment.createdAt)}
          </time>
        </header>
        <p className="post-body">{comment.body}</p>
        {comment.mine && (
          <div className="post-actions">
            <button type="button" className="btn small danger" onClick={() => onDelete(comment)} disabled={busy}>
              削除
            </button>
          </div>
        )}
      </div>
    </article>
  )
}
