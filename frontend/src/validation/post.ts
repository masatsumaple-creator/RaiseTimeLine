// 入力検証の規則と文言は docs/11_機能定義書_タイムライン・投稿.md に合わせる。サーバー側が正で、ここは入力中に早く気づかせるための検証。
import { codePointLength } from './auth'

export const POST_MAX_LENGTH = 280

export const POST_MAX_IMAGES = 4

export const POST_MESSAGES = {
  required: '本文を入力してください',
  requiredOrImage: '本文または画像を入れてください',
  tooLong: '280 文字以内で入力してください',
  tooManyImages: '画像は 4 枚までです',
} as const

/** 残り文字数。超過していれば負の値。前後の空白はサーバー側で取り除かれるため数えない。 */
export function remainingLength(value: string): number {
  return POST_MAX_LENGTH - codePointLength(value.trim())
}

/**
 * 本文の検証。空を許すのは、画像がある投稿(allowEmpty)だけ。
 * 画像のある投稿の編集では、本文を空にしてもよい(画像だけの投稿になる)。
 */
export function validatePostBody(value: string, allowEmpty = false): string | null {
  if (value.trim() === '') return allowEmpty ? null : POST_MESSAGES.required
  return remainingLength(value) < 0 ? POST_MESSAGES.tooLong : null
}

/** 新規投稿の検証。本文か画像のどちらかは必要で、本文は 280 文字まで。 */
export function validateNewPost(body: string, imageCount: number): string | null {
  if (body.trim() === '' && imageCount === 0) return POST_MESSAGES.requiredOrImage
  return validatePostBody(body, imageCount > 0)
}
