import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Avatar } from './Avatar'

const user = { id: 1, displayName: '田村' }

describe('Avatar', () => {
  it('アイコンが無いときは、表示名の頭文字を出す', () => {
    const { container } = render(<Avatar user={user} />)

    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toBe('田')
  })

  it('アイコンがあるときは、画像を出す(頭文字は出さない)', () => {
    const { container } = render(<Avatar user={{ ...user, avatarUrl: 'https://s3.test/a.png' }} />)

    expect(container.querySelector('img')).toHaveAttribute('src', 'https://s3.test/a.png')
    expect(container.textContent).toBe('')
  })

  it('画像を読み込めなかったら、頭文字に戻す(画像が割れた表示にしない)', () => {
    const { container } = render(<Avatar user={{ ...user, avatarUrl: 'https://s3.test/broken.png' }} />)

    fireEvent.error(container.querySelector('img')!)

    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toBe('田')
  })

  it('読み込めなかった URL のあとに、新しい URL になったら、もう一度画像を出す', () => {
    const { container, rerender } = render(<Avatar user={{ ...user, avatarUrl: 'https://s3.test/old.png' }} />)
    fireEvent.error(container.querySelector('img')!)

    rerender(<Avatar user={{ ...user, avatarUrl: 'https://s3.test/new.png' }} />)

    expect(container.querySelector('img')).toHaveAttribute('src', 'https://s3.test/new.png')
  })

  it('絵文字の表示名は、1 文字として頭文字にする', () => {
    const { container } = render(<Avatar user={{ id: 2, displayName: '😀あ' }} />)

    expect(container.textContent).toBe('😀')
  })

  it('大きさの指定を、クラスに反映する', () => {
    const { container } = render(<Avatar user={user} size="lg" />)

    expect(container.querySelector('.avatar')).toHaveClass('lg')
  })
})
