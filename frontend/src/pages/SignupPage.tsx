import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { TextField } from '../components/TextField'
import { useToast } from '../components/toast'
import {
  normalizeHandle,
  validateDisplayName,
  validateEmail,
  validateHandle,
  validateNewPassword,
} from '../validation/auth'
import { toFormErrors, type FormErrors } from './formErrors'

const FIELDS = ['email', 'password', 'displayName', 'handle'] as const

export function SignupPage() {
  const { signup } = useAuth()
  const showToast = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [handle, setHandle] = useState('')
  const [errors, setErrors] = useState<FormErrors>({ fields: {} })
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()

    const checks: Record<(typeof FIELDS)[number], string | null> = {
      email: validateEmail(email),
      password: validateNewPassword(password),
      displayName: validateDisplayName(displayName),
      handle: validateHandle(handle),
    }
    const fields: Record<string, string> = {}
    for (const [name, message] of Object.entries(checks)) {
      if (message) fields[name] = message
    }
    setErrors({ fields })
    if (Object.keys(fields).length > 0) return

    setSubmitting(true)
    try {
      await signup({
        email: email.trim(),
        password,
        displayName: displayName.trim(),
        handle: normalizeHandle(handle),
      })
      // 登録と同時にログイン状態になり、GuestOnly が元の画面(なければ S-03)へ移動させる
      showToast('登録しました')
    } catch (error) {
      setErrors(toFormErrors(error, FIELDS))
      setSubmitting(false)
    }
  }

  return (
    <form className="panel auth" noValidate onSubmit={handleSubmit}>
      <h1>新規登録</h1>
      <TextField
        id="email"
        label="メールアドレス"
        type="email"
        autoComplete="email"
        maxLength={255}
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.fields.email}
      />
      <TextField
        id="password"
        label="パスワード"
        type="password"
        autoComplete="new-password"
        maxLength={70}
        hint="8〜64 文字、英字と数字を含める"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.fields.password}
      />
      <TextField
        id="displayName"
        label="表示名"
        type="text"
        maxLength={60}
        hint="1〜50 文字"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        error={errors.fields.displayName}
      />
      <TextField
        id="handle"
        label="ユーザーハンドル"
        type="text"
        autoCapitalize="none"
        maxLength={40}
        hint="@ なしで入力。半角英数字と _ の 3〜30 文字"
        value={handle}
        onChange={(e) => setHandle(e.target.value)}
        error={errors.fields.handle}
      />
      <p className="error" role="alert">
        {errors.form}
      </p>
      <button className="btn primary block" type="submit" disabled={submitting}>
        {submitting ? '送信中…' : '登録する'}
      </button>
      <p className="muted center">
        アカウントをお持ちの方は <Link to="/login">ログイン</Link>
      </p>
    </form>
  )
}
