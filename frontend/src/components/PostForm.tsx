import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { ApiError } from '../api/client'
import { uploadImage } from '../api/images'
import { createPost } from '../api/posts'
import type { Post } from '../api/types'
import { NETWORK_ERROR_MESSAGE, toFormErrors } from '../pages/formErrors'
import { IMAGE_ACCEPT, validateImageFile } from '../validation/image'
import { POST_MAX_IMAGES, POST_MESSAGES, remainingLength, validateNewPost } from '../validation/post'

interface PostFormProps {
  onCreated: (post: Post) => void
}

const FIELDS = ['body', 'imageKeys'] as const

/** 選んだ画像 1 枚。uploadedKey は、S3 へアップロード済みならそのキー(投稿に失敗して再試行するとき、やり直さない)。 */
interface DraftImage {
  id: number
  file: File
  previewUrl: string
  uploadedKey?: string
  /** アップロードに失敗したときの文言 */
  error?: string
}

/**
 * 投稿フォーム。本文と、最大 4 枚の画像で投稿できる(本文か画像のどちらかは必要)。
 * 画像は、選んだ時点ではどこにも送らず、投稿を押したときに S3 へ直接アップロードしてから、キーを添えて投稿する。
 * 投稿できたら onCreated に新しい投稿を渡し、入力欄を空にする。
 */
export function PostForm({ onCreated }: PostFormProps) {
  const [body, setBody] = useState('')
  const [drafts, setDrafts] = useState<DraftImage[]>([])
  const [pickError, setPickError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const nextId = useRef(1)

  // プレビュー用の URL は、使い終わったら(取り除く・投稿できた・画面を離れる)解放する
  const draftsRef = useRef<DraftImage[]>([])
  useEffect(() => {
    draftsRef.current = drafts
  })
  useEffect(
    () => () => {
      draftsRef.current.forEach((d) => URL.revokeObjectURL(d.previewUrl))
    },
    [],
  )

  const remaining = remainingLength(body)
  const invalid = validateNewPost(body, drafts.length) !== null
  const full = drafts.length >= POST_MAX_IMAGES

  function handlePick(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    // 同じ画像を続けて選び直しても change が起きるよう、選択は毎回空にする
    event.target.value = ''
    if (files.length === 0) return

    const added: DraftImage[] = []
    let problem: string | null = null
    for (const file of files) {
      if (drafts.length + added.length >= POST_MAX_IMAGES) {
        problem = POST_MESSAGES.tooManyImages
        break
      }
      const fileProblem = validateImageFile(file)
      if (fileProblem) {
        problem ??= fileProblem
        continue
      }
      added.push({ id: nextId.current++, file, previewUrl: URL.createObjectURL(file) })
    }
    setPickError(problem)
    if (added.length > 0) setDrafts((current) => [...current, ...added])
  }

  function handleRemove(id: number) {
    const removed = drafts.find((d) => d.id === id)
    if (removed) URL.revokeObjectURL(removed.previewUrl)
    setDrafts((current) => current.filter((d) => d.id !== id))
    setPickError(null)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (invalid || submitting) return
    setSubmitting(true)
    setError(null)
    setPickError(null)

    // 1. まだ S3 に無い画像を、まとめてアップロードする(アップロード済みの画像は、使い回す)
    const pending = drafts.filter((d) => !d.uploadedKey)
    const results = await Promise.allSettled(pending.map((d) => uploadImage('post', d.file)))
    const uploaded = new Map<number, string>()
    const failures = new Map<number, string>()
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        uploaded.set(pending[i].id, result.value)
      } else {
        failures.set(pending[i].id, result.reason instanceof Error ? result.reason.message : NETWORK_ERROR_MESSAGE)
      }
    })
    const current = drafts.map((d) => {
      const key = uploaded.get(d.id)
      if (key) return { ...d, uploadedKey: key, error: undefined }
      const failure = failures.get(d.id)
      return failure ? { ...d, error: failure } : d
    })
    setDrafts(current)
    if (failures.size > 0) {
      setError('アップロードできなかった画像があります。もう一度「投稿する」を押すと、やり直します')
      setSubmitting(false)
      return
    }

    // 2. 画像のキーを添えて投稿する
    try {
      const post = await createPost(
        body.trim(),
        current.map((d) => d.uploadedKey as string),
      )
      current.forEach((d) => URL.revokeObjectURL(d.previewUrl))
      setBody('')
      setDrafts([])
      onCreated(post)
    } catch (e) {
      const errors = toFormErrors(e, FIELDS)
      setError(errors.fields.body ?? errors.fields.imageKeys ?? errors.form ?? null)
      if (e instanceof ApiError && e.status === 400 && !errors.fields.body) {
        // 画像をサーバーが受け付けなかった(消されたものがある)かもしれないので、次はアップロードからやり直す
        setDrafts((now) => now.map((d) => ({ ...d, uploadedKey: undefined })))
      }
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

      {drafts.length > 0 && (
        <ul className="draft-images" aria-label="添付する画像">
          {drafts.map((draft, i) => (
            <li key={draft.id} className={`draft-image${draft.error ? ' failed' : ''}`}>
              <img src={draft.previewUrl} alt={`選んだ画像 ${i + 1}`} />
              <button
                type="button"
                className="draft-remove"
                aria-label={`画像 ${i + 1} を取り除く`}
                disabled={submitting}
                onClick={() => handleRemove(draft.id)}
              >
                ×
              </button>
              {draft.error && (
                <span className="draft-error" role="status">
                  送信に失敗
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="error" role="alert">
        {pickError ?? error}
      </p>
      <div className="post-form-foot">
        <span className="post-form-tools">
          <label className={`btn small file-btn${full ? ' disabled' : ''}`}>
            画像を追加
            <input type="file" accept={IMAGE_ACCEPT} multiple disabled={submitting || full} onChange={handlePick} />
          </label>
          <span className={`counter${remaining < 0 ? ' over' : ''}`} aria-live="polite">
            残り {remaining} 文字
          </span>
        </span>
        <button type="submit" className="btn primary" disabled={invalid || submitting}>
          {submitting ? '投稿中…' : '投稿する'}
        </button>
      </div>
    </form>
  )
}
