import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { fetchMe } from '../api/auth'
import type { User } from '../api/types'
import { updateProfile } from '../api/users'
import { useAuth } from '../auth/AuthContext'
import { TextField } from '../components/TextField'
import { useToast } from '../components/toast'
import { validateDisplayName } from '../validation/auth'
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

function ProfileForm({ user }: { user: User }) {
  const { updateUser } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState(user.displayName)
  const [bio, setBio] = useState(user.bio ?? '')
  const [errors, setErrors] = useState<FormErrors>({ fields: {} })
  const [submitting, setSubmitting] = useState(false)

  const remaining = remainingBioLength(bio)
  const invalid = validateDisplayName(displayName) !== null || validateBio(bio) !== null

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
      const updated = await updateProfile({ displayName: displayName.trim(), bio: bio.trim() })
      updateUser(updated)
      toast('プロフィールを保存しました')
      navigate(`/users/${updated.handle}`)
    } catch (error) {
      setErrors(toFormErrors(error, FIELDS))
      setSubmitting(false)
    }
  }

  return (
    <form className="panel profile-edit" noValidate onSubmit={handleSubmit}>
      <h1>プロフィールを編集</h1>
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
