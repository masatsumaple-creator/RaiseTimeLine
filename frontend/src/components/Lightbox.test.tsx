import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PostImage } from '../api/types'
import { Lightbox } from './Lightbox'

const images: PostImage[] = [
  { url: 'https://s3.test/1.png', sortOrder: 0 },
  { url: 'https://s3.test/2.png', sortOrder: 1 },
  { url: 'https://s3.test/3.png', sortOrder: 2 },
]

function setup(index = 0, list: PostImage[] = images) {
  const onChange = vi.fn()
  const onClose = vi.fn()
  render(<Lightbox images={list} index={index} onChange={onChange} onClose={onClose} />)
  return { onChange, onClose }
}

describe('表示', () => {
  it('現在の画像をダイアログで表示する', () => {
    setup(1)

    expect(screen.getByRole('dialog', { name: '画像の拡大表示' })).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByAltText('投稿の画像 2')).toHaveAttribute('src', 'https://s3.test/2.png')
  })

  it('画面全体を覆うよう、body 直下に描画する', () => {
    setup()

    expect(screen.getByRole('dialog').parentElement).toBe(document.body)
  })

  it('開いたら閉じるボタンにフォーカスする', () => {
    setup()

    expect(screen.getByRole('button', { name: '閉じる' })).toHaveFocus()
  })

  it('複数枚のときは前後のボタンと「n / 全体」を出す', () => {
    setup(1)

    expect(screen.getByRole('button', { name: '前の画像' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '次の画像' })).toBeEnabled()
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
  })

  it('1 枚だけのときは前後のボタンを出さない', () => {
    setup(0, [images[0]])

    expect(screen.queryByRole('button', { name: '前の画像' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '次の画像' })).not.toBeInTheDocument()
    expect(screen.queryByText(/\//)).not.toBeInTheDocument()
  })

  it('最初の画像では「前」、最後の画像では「次」を無効にする', () => {
    const { unmount } = render(<Lightbox images={images} index={0} onChange={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: '前の画像' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '次の画像' })).toBeEnabled()
    unmount()

    render(<Lightbox images={images} index={2} onChange={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: '次の画像' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '前の画像' })).toBeEnabled()
  })

  it('画像が無い・位置が範囲外なら何も描画しない', () => {
    setup(0, [])
    setup(5)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('閉じる', () => {
  it('閉じるボタンで閉じる', async () => {
    const { onClose } = setup()

    await userEvent.click(screen.getByRole('button', { name: '閉じる' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Esc キーで閉じる', async () => {
    const { onClose } = setup()

    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('背景を押すと閉じる', async () => {
    const { onClose } = setup()

    await userEvent.click(screen.getByRole('dialog'))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('画像そのものを押しても閉じない', async () => {
    const { onClose } = setup()

    await userEvent.click(screen.getByAltText('投稿の画像 1'))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('アンマウント後は、キー操作に反応しない', async () => {
    const onClose = vi.fn()
    const { unmount } = render(<Lightbox images={images} index={0} onChange={vi.fn()} onClose={onClose} />)

    unmount()
    await userEvent.keyboard('{Escape}')

    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('切り替え', () => {
  it('次・前のボタンで隣の画像の位置を onChange に渡す', async () => {
    const { onChange } = setup(1)

    await userEvent.click(screen.getByRole('button', { name: '次の画像' }))
    await userEvent.click(screen.getByRole('button', { name: '前の画像' }))

    expect(onChange).toHaveBeenNthCalledWith(1, 2)
    expect(onChange).toHaveBeenNthCalledWith(2, 0)
  })

  it('← → キーで切り替える', async () => {
    const { onChange } = setup(1)

    await userEvent.keyboard('{ArrowRight}')
    await userEvent.keyboard('{ArrowLeft}')

    expect(onChange).toHaveBeenNthCalledWith(1, 2)
    expect(onChange).toHaveBeenNthCalledWith(2, 0)
  })

  it('端では、それより先へは進まない', async () => {
    const first = setup(0)
    await userEvent.keyboard('{ArrowLeft}')
    expect(first.onChange).not.toHaveBeenCalled()
  })

  it('最後の画像で → を押しても進まない', async () => {
    const { onChange } = setup(2)

    await userEvent.keyboard('{ArrowRight}')

    expect(onChange).not.toHaveBeenCalled()
  })
})
