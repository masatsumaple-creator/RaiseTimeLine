import { useState } from 'react'
import type { FormEvent } from 'react'
import { createPost } from '../api/posts'
import type { Post } from '../api/types'
import { toFormErrors } from '../pages/formErrors'
import { remainingLength, validatePostBody } from '../validation/post'

interface PostFormProps {
  onCreated: (post: Post) => void
}

const FIELDS = ['body'] as const

/** 投稿フォーム。投稿できたら onCreated に新しい投稿を渡し、入力欄を空にする。 */
export function PostForm({ onCreated }: PostFormProps) {
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const remaining = remainingLength(body)
  const invalid = validatePostBody(body) !== null

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (invalid || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const post = await createPost(body.trim())
      setBody('')
      onCreated(post)
    } catch (e) {
      const errors = toFormErrors(e, FIELDS)
      setError(errors.fields.body ?? errors.form ?? null)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="panel post-form" onSubmit={handleSubmit} noValidate>
      <label className="sr-only" htmlFor="post-body">
        いまどうしてる?
      </label>
      <textarea
        id="post-body"
        className="post-textarea"
        rows={3}
        placeholder="いまどうしてる?"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-invalid={remaining < 0 ? true : undefined}
      />
      <p className="error" role="alert">
        {error}
      </p>
      <div className="post-form-foot">
        <span className={`counter${remaining < 0 ? ' over' : ''}`} aria-live="polite">
          残り {remaining} 文字
        </span>
        <button type="submit" className="btn primary" disabled={invalid || submitting}>
          {submitting ? '投稿中…' : '投稿する'}
        </button>
      </div>
    </form>
  )
}
