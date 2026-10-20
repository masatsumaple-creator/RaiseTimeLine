export interface User {
  id: number
  handle: string
  displayName: string
  bio?: string
  avatarKey?: string
}

export interface AuthResponse {
  accessToken: string
  tokenType: 'Bearer'
  /** アクセストークンの有効期間(秒) */
  expiresIn: number
  user: User
}

export interface ApiErrorBody {
  code: string
  message: string
  /** 入力検証エラー(400)のときの、項目名 → メッセージ */
  fieldErrors?: Record<string, string>
}

export interface SignupInput {
  email: string
  password: string
  handle: string
  displayName: string
}
