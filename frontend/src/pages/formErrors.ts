import { ApiError } from '../api/client'

export const NETWORK_ERROR_MESSAGE = '通信に失敗しました。しばらくしてからやり直してください'

export interface FormErrors {
  /** 入力項目ごとのエラー(キーは入力項目名) */
  fields: Record<string, string>
  /** フォーム全体のエラー */
  form?: string
}

/**
 * サーバーのエラーを画面のエラー表示に振り分ける。
 * 400 の fieldErrors と 409 の重複は該当項目へ、それ以外はフォーム全体のエラーにする。
 */
export function toFormErrors(error: unknown, fieldNames: readonly string[]): FormErrors {
  if (!(error instanceof ApiError)) {
    return { fields: {}, form: NETWORK_ERROR_MESSAGE }
  }

  const fields: Record<string, string> = {}
  for (const [name, message] of Object.entries(error.fieldErrors ?? {})) {
    if (fieldNames.includes(name)) fields[name] = message
  }
  if (error.code === 'EMAIL_ALREADY_EXISTS') fields.email = error.message
  if (error.code === 'HANDLE_ALREADY_EXISTS') fields.handle = error.message

  return Object.keys(fields).length > 0 ? { fields } : { fields, form: error.message }
}
