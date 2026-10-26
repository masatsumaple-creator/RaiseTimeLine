import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { fetchMe } from '../api/auth'
import { ApiError } from '../api/client'
import { uploadImage } from '../api/images'
import type { User } from '../api/types'
import { updateProfile } from '../api/users'
import { useAuth } from '../auth/AuthContext'
import { Avatar } from '../components/Avatar'
import { TextField } from '../components/TextField'
import { useToast } from '../components/toast'
import { validateDisplayName } from '../validation/auth'
import { IMAGE_ACCEPT, validateImageFile } from '../validation/image'
import { remainingBioLength, validateBio } from '../validation/profile'
import { NETWORK_ERROR_MESSAGE, toFormErrors, type FormErrors } from './formErrors'

const FIELDS = ['displayName', 'bio'] as const

type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; user: User }

/** プロフィール編集(S-06)。開いたときに、現在の値をサーバーから取得してフォームに入れる。 */
export function ProfileEditPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  const load = useCallback(() => {
    let cancelled = false
    fetchMe()
      .then((user) => !cancelled && setState({ status: 'ready', user }))
      .catch(() => !cancelled && setState({ status: 'error' }))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => load(), [load])

  if (state.status === 'loading') return <p className="muted center">読み込み中…</p>

  if (state.status === 'error') {
    return (
      <div className="panel center">
        <p className="error">{NETWORK_ERROR_MESSAGE}</p>
        <button
          type="button"
          className="btn small"
          onClick={() => {
            setState({ status: 'loading' })
            load()
          }}
        >
          再読み込み
        </button>
      </div>
    )
  }

  return <ProfileForm user={state.user} />
}

/** 選んだ画像。uploadedKey は、S3 へアップロード済みなら、そのキー(保存に失敗して再試行するとき、もう一度アップロードしない)。 */
interface PickedImage {
  file: File
  previewUrl: string
  uploadedKey?: string
}

function ProfileForm({ user }: { user: User }) {
  const { updateUser } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState(user.displayName)
  const [bio, setBio] = useState(user.bio ?? '')
  const [picked, setPicked] = useState<PickedImage | null>(null)
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [errors, setErrors] = useState<FormErrors>({ fields: {} })
  const [submitting, setSubmitting] = useState(false)

  // プレビュー用の URL は、使い終わったら(別の画像を選ぶ・削除する・画面を離れる)解放する
  const previewRef = useRef<string | null>(null)
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    },
    [],
  )

  const remaining = remainingBioLength(bio)
  const invalid = validateDisplayName(displayName) !== null || validateBio(bio) !== null

  function replacePreview(next: PickedImage | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = next?.previewUrl ?? null
    setPicked(next)
  }

  function handlePick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // 同じ画像を続けて選び直しても change が起きるよう、選択は毎回空にする
    event.target.value = ''
    if (!file) return
    const problem = validateImageFile(file)
    if (problem) {
      setAvatarError(problem)
      return
    }
    setAvatarError(null)
    setRemoveAvatar(false)
    replacePreview({ file, previewUrl: URL.createObjectURL(file) })
  }

  function handleRemove() {
    setAvatarError(null)
    replacePreview(null)
    // 今のアイコンがあるときだけ、保存で削除する(選んだ画像を取り消しただけなら、今のアイコンのまま)
    setRemoveAvatar(picked === null && Boolean(user.avatarUrl))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return

    const fields: Record<string, string> = {}
    const displayNameError = validateDisplayName(displayName)
    const bioError = validateBio(bio)
    if (displayNameError) fields.displayName = displayNameError
    if (bioError) fields.bio = bioError
    setErrors({ fields })
    if (Object.keys(fields).length > 0) return

    setSubmitting(true)
    try {
      let avatarKey = picked?.uploadedKey
      if (picked && !avatarKey) {
        try {
          avatarKey = await uploadImage('avatar', picked.file)
        } catch (error) {
          // 署名付き URL の発行のエラー(未設定など)も、S3 への送信の失敗も、メッセージをそのまま出す
          setErrors({ fields: {}, form: error instanceof Error ? error.message : NETWORK_ERROR_MESSAGE })
          setSubmitting(false)
          return
        }
        // 保存に失敗して再試行するときは、アップロード済みの画像を使い回す
        setPicked({ ...picked, uploadedKey: avatarKey })
      }
      const updated = await updateProfile({
        displayName: displayName.trim(),
        bio: bio.trim(),
        ...(avatarKey ? { avatarKey } : {}),
        ...(removeAvatar && !avatarKey ? { removeAvatar: true } : {}),
      })
      updateUser(updated)
      toast('プロフィールを保存しました')
      navigate(`/users/${updated.handle}`)
    } catch (error) {
      if (error instanceof ApiError && error.status === 400 && !error.fieldErrors) {
        // 画像の確認に失敗した(形式・大きさ・アップロードの確認など)。選び直せるようにする
        setAvatarError(error.message)
        replacePreview(null)
        setErrors({ fields: {} })
      } else {
        setErrors(toFormErrors(error, FIELDS))
      }
      setSubmitting(false)
    }
  }

  // 表示するアイコン: 選んだ画像のプレビュー > 今のアイコン(削除予定なら表示しない)
  const shownAvatarUrl = picked?.previewUrl ?? (removeAvatar ? undefined : user.avatarUrl)
  const hasImage = Boolean(shownAvatarUrl)

  return (
    <form className="panel profile-edit" noValidate onSubmit={handleSubmit}>
      <h1>プロフィールを編集</h1>

      <div className="field">
        <span className="lbl">アイコン</span>
        <div className="avatar-edit">
          <Avatar user={{ id: user.id, displayName, avatarUrl: shownAvatarUrl }} size="lg" />
          <div className="avatar-actions">
            <label className="btn small file-btn">
              画像を選ぶ
              <input type="file" accept={IMAGE_ACCEPT} onChange={handlePick} disabled={submitting} />
            </label>
            {hasImage && (
              <button type="button" className="btn small danger" onClick={handleRemove} disabled={submitting}>
                画像を削除
              </button>
            )}
          </div>
        </div>
        <span className="hint">JPEG・PNG・WebP、5MB まで</span>
        <p className="error" role="alert">
          {avatarError}
        </p>
      </div>

      <TextField
        id="displayName"
        label="表示名"
        type="text"
        maxLength={60}
        hint="1〜50 文字"
        autoFocus
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        error={errors.fields.displayName}
      />
      <div className="field">
        <label className="lbl" htmlFor="bio">
          自己紹介
        </label>
        <textarea
          id="bio"
          className="post-textarea"
          rows={4}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          aria-invalid={errors.fields.bio || remaining < 0 ? true : undefined}
          aria-describedby="bio-counter bio-error"
        />
        <span id="bio-counter" className={`counter${remaining < 0 ? ' over' : ''}`}>
          残り {remaining} 文字
        </span>
        <p id="bio-error" className="error" role="alert">
          {errors.fields.bio}
        </p>
      </div>
      <p className="error" role="alert">
        {errors.form}
      </p>
      <div className="profile-edit-actions">
        <Link className="btn" to={`/users/${user.handle}`}>
          キャンセル
        </Link>
        <button className="btn primary" type="submit" disabled={submitting || invalid}>
          {submitting ? '保存中…' : '保存'}
        </button>
      </div>
    </form>
  )
}
