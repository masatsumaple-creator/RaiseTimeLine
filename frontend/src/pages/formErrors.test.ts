import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { NETWORK_ERROR_MESSAGE, toFormErrors } from './formErrors'

const FIELDS = ['email', 'password', 'handle'] as const

describe('toFormErrors', () => {
  it('ApiError 以外(通信の失敗など)は、フォーム全体の通信エラーにする', () => {
    expect(toFormErrors(new Error('boom'), FIELDS)).toEqual({ fields: {}, form: NETWORK_ERROR_MESSAGE })
    expect(toFormErrors('文字列', FIELDS)).toEqual({ fields: {}, form: NETWORK_ERROR_MESSAGE })
    expect(toFormErrors(undefined, FIELDS)).toEqual({ fields: {}, form: NETWORK_ERROR_MESSAGE })
  })

  it('fieldErrors のうち、画面にある項目だけを該当の項目に振り分ける', () => {
    const error = new ApiError(400, {
      code: 'VALIDATION_ERROR',
      message: '入力が正しくありません',
      fieldErrors: { email: 'メールNG', password: 'パスワードNG' },
    })

    expect(toFormErrors(error, FIELDS)).toEqual({ fields: { email: 'メールNG', password: 'パスワードNG' } })
  })

  it('画面にない項目のエラーは捨て、振り分け先が無ければフォーム全体のエラーにする', () => {
    const error = new ApiError(400, {
      code: 'VALIDATION_ERROR',
      message: '入力が正しくありません',
      fieldErrors: { unknown: 'どこにもない' },
    })

    expect(toFormErrors(error, FIELDS)).toEqual({ fields: {}, form: '入力が正しくありません' })
  })

  it('メールの重複(EMAIL_ALREADY_EXISTS)は email 項目に出す', () => {
    const error = new ApiError(409, { code: 'EMAIL_ALREADY_EXISTS', message: '登録済みです' })

    expect(toFormErrors(error, FIELDS)).toEqual({ fields: { email: '登録済みです' } })
  })

  it('ハンドルの重複(HANDLE_ALREADY_EXISTS)は handle 項目に出す', () => {
    const error = new ApiError(409, { code: 'HANDLE_ALREADY_EXISTS', message: '使われています' })

    expect(toFormErrors(error, FIELDS)).toEqual({ fields: { handle: '使われています' } })
  })

  it('それ以外のサーバーエラー(401 など)は、サーバーのメッセージをフォーム全体に出す', () => {
    const error = new ApiError(401, { code: 'LOGIN_FAILED', message: 'メールアドレスまたはパスワードが正しくありません' })

    expect(toFormErrors(error, FIELDS)).toEqual({
      fields: {},
      form: 'メールアドレスまたはパスワードが正しくありません',
    })
  })

  it('メッセージの無いエラーは、既定の文言をフォーム全体に出す', () => {
    const error = new ApiError(500, {})

    expect(toFormErrors(error, FIELDS)).toEqual({ fields: {}, form: 'エラーが発生しました' })
  })
})
