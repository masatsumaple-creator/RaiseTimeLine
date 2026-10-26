// 画像の規則と文言は docs/14_機能定義書_画像投稿.md に合わせる。サーバー(と S3 の署名)が正で、ここは選んだ時点で早く気づかせるための検証。

/** 使える画像の形式。 */
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

/** 画像 1 枚の上限(バイト)。 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export const IMAGE_MESSAGES = {
  type: 'JPEG、PNG、WebP の画像を選んでください',
  size: '画像は 1 枚 5MB 以下にしてください',
  empty: '空の画像は使えません',
} as const

/** file の input の accept に渡す値。 */
export const IMAGE_ACCEPT = ALLOWED_IMAGE_TYPES.join(',')

/** 選んだ画像の検証。問題が無ければ null、あればエラー文言。 */
export function validateImageFile(file: Pick<File, 'type' | 'size'>): string | null {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) return IMAGE_MESSAGES.type
  if (file.size <= 0) return IMAGE_MESSAGES.empty
  if (file.size > MAX_IMAGE_BYTES) return IMAGE_MESSAGES.size
  return null
}
