import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TextField } from './TextField'

describe('TextField', () => {
  it('ラベルと入力欄を関連づける(ラベルで入力欄を探せる)', () => {
    render(<TextField id="email" label="メールアドレス" />)

    expect(screen.getByLabelText('メールアドレス')).toHaveAttribute('id', 'email')
  })

  it('input の属性(type・value・maxLength など)をそのまま渡す', () => {
    render(<TextField id="pw" label="パスワード" type="password" maxLength={64} defaultValue="abc" autoComplete="new-password" />)

    const input = screen.getByLabelText('パスワード')
    expect(input).toHaveAttribute('type', 'password')
    expect(input).toHaveAttribute('maxlength', '64')
    expect(input).toHaveValue('abc')
    expect(input).toHaveAttribute('autocomplete', 'new-password')
  })

  it('入力すると onChange が呼ばれる', async () => {
    const onChange = vi.fn()
    render(<TextField id="name" label="名前" onChange={onChange} />)

    await userEvent.type(screen.getByLabelText('名前'), 'ab')

    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('ヒントもエラーも無いときは、aria-describedby も aria-invalid も付けない', () => {
    render(<TextField id="name" label="名前" />)

    const input = screen.getByLabelText('名前')
    expect(input).not.toHaveAttribute('aria-describedby')
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('ヒントがあれば表示し、入力欄から参照する', () => {
    render(<TextField id="handle" label="ハンドル" hint="3〜30 文字" />)

    expect(screen.getByText('3〜30 文字')).toHaveAttribute('id', 'handle-hint')
    expect(screen.getByLabelText('ハンドル')).toHaveAttribute('aria-describedby', 'handle-hint')
  })

  it('エラーがあれば alert として表示し、入力欄を不正(aria-invalid)にする', () => {
    render(<TextField id="email" label="メール" error="形式が正しくありません" />)

    expect(screen.getByRole('alert')).toHaveTextContent('形式が正しくありません')
    expect(screen.getByLabelText('メール')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('メール')).toHaveAttribute('aria-describedby', 'email-error')
  })

  it('ヒントとエラーの両方があれば、両方を参照する', () => {
    render(<TextField id="pw" label="パスワード" hint="8 文字以上" error="短すぎます" />)

    expect(screen.getByLabelText('パスワード')).toHaveAttribute('aria-describedby', 'pw-hint pw-error')
  })

  it('エラーが無いとき、alert の領域は空のまま(スクリーンリーダーに読まれない)', () => {
    render(<TextField id="email" label="メール" />)

    expect(screen.getByRole('alert')).toBeEmptyDOMElement()
  })
})
