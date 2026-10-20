// 入力検証の規則と文言は docs/10_機能定義書_認証.md に合わせる。サーバー側が正で、ここは入力中に早く気づかせるための検証。

export const MESSAGES = {
  email: 'メールアドレスの形式が正しくありません',
  loginPasswordRequired: 'パスワードを入力してください',
  password: 'パスワードは 8〜64 文字で、英字と数字を含めてください',
  displayName: '表示名は 1〜50 文字で入力してください',
  handle: 'ユーザーハンドルは半角英数字と _ の 3〜30 文字で入力してください',
} as const

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const HANDLE_RE = /^[A-Za-z0-9_]{3,30}$/

/** 絵文字などのサロゲートペアを 1 文字と数える。 */
export function codePointLength(value: string): number {
  return Array.from(value).length
}

export function validateEmail(value: string): string | null {
  const email = value.trim()
  return EMAIL_RE.test(email) && email.length <= 255 ? null : MESSAGES.email
}

export function validateLoginPassword(value: string): string | null {
  return value === '' ? MESSAGES.loginPasswordRequired : null
}

export function validateNewPassword(value: string): string | null {
  const validLength = value.length >= 8 && value.length <= 64
  return validLength && /[A-Za-z]/.test(value) && /[0-9]/.test(value) ? null : MESSAGES.password
}

export function validateDisplayName(value: string): string | null {
  const length = codePointLength(value.trim())
  return length >= 1 && length <= 50 ? null : MESSAGES.displayName
}

/** 先頭の @ は入力不要なので取り除く。 */
export function normalizeHandle(value: string): string {
  return value.trim().replace(/^@/, '')
}

export function validateHandle(value: string): string | null {
  return HANDLE_RE.test(normalizeHandle(value)) ? null : MESSAGES.handle
}
