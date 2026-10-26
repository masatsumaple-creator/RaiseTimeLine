import { request } from './client'

export type ImagePurpose = 'avatar' | 'post'

interface UploadUrl {
  uploadUrl: string
  imageKey: string
  expiresIn: number
}

/** S3 へのアップロード(PUT)に失敗した。サーバーのエラーではなく、画面に出す文言をそのまま持つ。 */
export class UploadError extends Error {
  constructor() {
    super('画像のアップロードに失敗しました。通信を確認して、もう一度お試しください')
    this.name = 'UploadError'
  }
}

function requestUploadUrl(purpose: ImagePurpose, file: File): Promise<UploadUrl> {
  return request<UploadUrl>('/api/images/upload-url', {
    method: 'POST',
    body: { purpose, contentType: file.type, size: file.size },
    auth: true,
  })
}

/**
 * 画像を S3 へアップロードして、その画像のキーを返す。
 * 画像のバイト列はバックエンドを通さず、署名付き URL でブラウザから S3 へ直接送る。
 * 署名の期限切れ(403)のときだけ、URL を取り直して 1 回だけやり直す。
 * 署名付き URL の発行のエラー(形式・大きさ・未設定など)は、サーバーのメッセージを持つ ApiError のまま投げる。
 */
export async function uploadImage(purpose: ImagePurpose, file: File): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { uploadUrl, imageKey } = await requestUploadUrl(purpose, file)
    let response: Response
    try {
      // 認証ヘッダーは付けない(S3 の署名付き URL は、URL だけで認証する)。Content-Type は、署名した値と同じにする
      response = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
    } catch {
      throw new UploadError()
    }
    if (response.ok) return imageKey
    if (response.status !== 403 || attempt === 1) throw new UploadError()
  }
  throw new UploadError()
}
