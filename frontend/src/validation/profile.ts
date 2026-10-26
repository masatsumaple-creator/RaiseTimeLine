import { codePointLength } from './auth'

// 入力検証の規則と文言は docs/17_機能定義書_プロフィール.md に合わせる。サーバー側が正で、ここは入力中に早く気づかせるための検証。

/** 自己紹介の長さの上限(コードポイント数)。 */
export const BIO_MAX_LENGTH = 160

export const BIO_MESSAGE = '自己紹介は 160 文字以内で入力してください'

/** 自己紹介は任意。空でもよい。 */
export function validateBio(value: string): string | null {
  return codePointLength(value.trim()) <= BIO_MAX_LENGTH ? null : BIO_MESSAGE
}

/** 自己紹介の残り文字数(超えていれば負の数)。 */
export function remainingBioLength(value: string): number {
  return BIO_MAX_LENGTH - codePointLength(value.trim())
}
