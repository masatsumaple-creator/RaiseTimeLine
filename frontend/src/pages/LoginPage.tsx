import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { TextField } from '../components/TextField'
import { validateEmail, validateLoginPassword } from '../validation/auth'
import { toFormErrors, type FormErrors } from './formErrors'

const FIELDS = ['email', 'password'] as const

export function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<FormErrors>({ fields: {} })
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()

    const fields: Record<string, string> = {}
    const emailError = validateEmail(email)
    const passwordError = validateLoginPassword(password)
    if (emailError) fields.email = emailError
    if (passwordError) fields.password = passwordError
    setErrors({ fields })
    if (emailError || passwordError) return

    setSubmitting(true)
    try {
      // 成功するとログイン状態が変わり、GuestOnly が元の画面(なければ S-03)へ移動させる
      await login(email.trim(), password)
    } catch (error) {
      setErrors(toFormErrors(error, FIELDS))
      setSubmitting(false)
    }
  }

  return (
    <form className="panel auth" noValidate onSubmit={handleSubmit}>
      <h1>ログイン</h1>
      <TextField
        id="email"
        label="メールアドレス"
        type="email"
        autoComplete="username"
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
        autoComplete="current-password"
        maxLength={64}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.fields.password}
      />
      <p className="error" role="alert">
        {errors.form}
      </p>
      <button className="btn primary block" type="submit" disabled={submitting}>
        {submitting ? '送信中…' : 'ログイン'}
      </button>
      <p className="muted center">
        アカウントをお持ちでない方は <Link to="/signup">新規登録</Link>
      </p>
    </form>
  )
}
