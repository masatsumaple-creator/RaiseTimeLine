// アクセストークンはメモリだけに持つ(localStorage 等に置くと XSS で盗まれる)。
// リロードで消えるが、HttpOnly Cookie のリフレッシュトークンで復元する。
let accessToken: string | null = null

export const tokenStore = {
  get: (): string | null => accessToken,
  set: (token: string): void => {
    accessToken = token
  },
  clear: (): void => {
    accessToken = null
  },
}
