// 入力検証の規則と文言は docs/11_機能定義書_タイムライン・投稿.md に合わせる。サーバー側が正で、ここは入力中に早く気づかせるための検証。
import { codePointLength } from './auth'

export const POST_MAX_LENGTH = 280

export const POST_MESSAGES = {
  required: '本文を入力してください',
  tooLong: '280 文字以内で入力してください',
} as const

/** 残り文字数。超過していれば負の値。前後の空白はサーバー側で取り除かれるため数えない。 */
export function remainingLength(value: string): number {
  return POST_MAX_LENGTH - codePointLength(value.trim())
}

export function validatePostBody(value: string): string | null {
  if (value.trim() === '') return POST_MESSAGES.required
  return remainingLength(value) < 0 ? POST_MESSAGES.tooLong : null
}
