import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PostImage } from '../api/types'
import { PostImages } from './PostImages'

function images(count: number): PostImage[] {
  return Array.from({ length: count }, (_, i) => ({ url: `https://s3.test/get/${i}.png`, sortOrder: i }))
}

beforeEach(() => {
  // 拡大表示を閉じたあとのフォーカス戻しを、同期的に実行する
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 0
  })
})

describe('PostImages(サムネイル)', () => {
  it('画像が無いときは、何も出さない', () => {
    const { container } = render(<PostImages images={[]} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('画像の枚数に応じたレイアウトのクラスで、全部の画像を出す', () => {
    for (const count of [1, 2, 3, 4]) {
      const { container, unmount } = render(<PostImages images={images(count)} />)

      expect(container.querySelector(`.post-images.n${count}`)).not.toBeNull()
      expect(screen.getAllByRole('button', { name: /を拡大/ })).toHaveLength(count)
      unmount()
    }
  })

  it('表示順(sortOrder)の順に並べる', () => {
    const shuffled: PostImage[] = [
      { url: 'https://s3.test/get/c.png', sortOrder: 2 },
      { url: 'https://s3.test/get/a.png', sortOrder: 0 },
      { url: 'https://s3.test/get/b.png', sortOrder: 1 },
    ]

    render(<PostImages images={shuffled} />)

    const srcs = screen.getAllByRole('img').map((img) => img.getAttribute('src'))
    expect(srcs).toEqual(['https://s3.test/get/a.png', 'https://s3.test/get/b.png', 'https://s3.test/get/c.png'])
  })

  it('読み込めなかった画像は、壊れた表示にせず、代わりの表示にする', () => {
    render(<PostImages images={images(2)} />)

    fireEvent.error(screen.getAllByRole('img')[0])

    expect(screen.getByText('画像を表示できません')).toBeInTheDocument()
    expect(screen.getAllByRole('img')).toHaveLength(1)
  })
})

describe('拡大表示', () => {
  it('サムネイルを押すと、その画像を拡大して開く', async () => {
    render(<PostImages images={images(3)} />)

    await userEvent.click(screen.getByRole('button', { name: '画像 2 を拡大' }))

    const dialog = screen.getByRole('dialog', { name: '画像の拡大表示' })
    expect(within(dialog).getByRole('img')).toHaveAttribute('src', 'https://s3.test/get/1.png')
    expect(within(dialog).getByText('2 / 3')).toBeInTheDocument()
  })

  it('開いたら、閉じるボタンにフォーカスが移る', async () => {
    render(<PostImages images={images(2)} />)

    await userEvent.click(screen.getByRole('button', { name: '画像 1 を拡大' }))

    expect(screen.getByRole('button', { name: '閉じる' })).toHaveFocus()
  })

  it('前後のボタンと ← → キーで、画像を切り替える。端では押せない', async () => {
    render(<PostImages images={images(3)} />)
    await userEvent.click(screen.getByRole('button', { name: '画像 1 を拡大' }))
    const dialog = screen.getByRole('dialog')

    expect(screen.getByRole('button', { name: '前の画像' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '次の画像' }))
    expect(within(dialog).getByText('2 / 3')).toBeInTheDocument()

    await userEvent.keyboard('{ArrowRight}')
    expect(within(dialog).getByText('3 / 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '次の画像' })).toBeDisabled()
    // 端では、さらに進まない
    await userEvent.keyboard('{ArrowRight}')
    expect(within(dialog).getByText('3 / 3')).toBeInTheDocument()

    await userEvent.keyboard('{ArrowLeft}')
    expect(within(dialog).getByText('2 / 3')).toBeInTheDocument()
  })

  it('1 枚だけのときは、前後のボタンと枚数を出さない', async () => {
    render(<PostImages images={images(1)} />)

    await userEvent.click(screen.getByRole('button', { name: '画像 1 を拡大' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '次の画像' })).not.toBeInTheDocument()
    expect(screen.queryByText(/\/ 1/)).not.toBeInTheDocument()
  })

  it('Esc で閉じ、開いたサムネイルにフォーカスが戻る', async () => {
    render(<PostImages images={images(3)} />)
    const thumb = screen.getByRole('button', { name: '画像 2 を拡大' })
    await userEvent.click(thumb)

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(thumb).toHaveFocus()
  })

  it('閉じるボタンで閉じる', async () => {
    render(<PostImages images={images(2)} />)
    await userEvent.click(screen.getByRole('button', { name: '画像 1 を拡大' }))

    await userEvent.click(screen.getByRole('button', { name: '閉じる' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('背景を押すと閉じるが、画像を押しても閉じない', async () => {
    render(<PostImages images={images(2)} />)
    await userEvent.click(screen.getByRole('button', { name: '画像 1 を拡大' }))

    await userEvent.click(within(screen.getByRole('dialog')).getByRole('img'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('dialog'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
