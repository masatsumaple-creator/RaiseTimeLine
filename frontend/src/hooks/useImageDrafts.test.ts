import { act, renderHook } from '@testing-library/react'
import type { ChangeEvent } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IMAGE_MESSAGES } from '../validation/image'
import { useImageDrafts } from './useImageDrafts'

const TOO_MANY = '画像は 4 枚までです'

function file(name: string, size = 1000, type = 'image/png'): File {
  return new File([new Uint8Array(size)], name, { type })
}

let counter = 0
let revoked: string[] = []

beforeEach(() => {
  counter = 0
  revoked = []
  URL.createObjectURL = vi.fn(() => `blob:draft-${++counter}`)
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url)
  })
})

function multi() {
  return renderHook(() => useImageDrafts({ max: 4, tooManyMessage: TOO_MANY }))
}

function single() {
  return renderHook(() => useImageDrafts({ max: 1, tooManyMessage: '', replace: true }))
}

describe('足していく(投稿用)', () => {
  it('有効な画像を足し、それぞれにプレビュー用の URL と、重ならない id を付ける', () => {
    const { result } = multi()

    act(() => result.current.addFiles([file('a.png'), file('b.png')]))

    expect(result.current.drafts.map((d) => d.previewUrl)).toEqual(['blob:draft-1', 'blob:draft-2'])
    expect(new Set(result.current.drafts.map((d) => d.id)).size).toBe(2)
    expect(result.current.pickError).toBeNull()
  })

  it('続けて選ぶと、あとに足される', () => {
    const { result } = multi()

    act(() => result.current.addFiles([file('a.png')]))
    act(() => result.current.addFiles([file('b.png')]))

    expect(result.current.drafts.map((d) => d.file.name)).toEqual(['a.png', 'b.png'])
  })

  it('max を超える分は、メッセージを出して足さない(プレビューも作らない)', () => {
    const { result } = multi()

    act(() => result.current.addFiles([1, 2, 3, 4, 5].map((n) => file(`${n}.png`))))

    expect(result.current.drafts).toHaveLength(4)
    expect(result.current.pickError).toBe(TOO_MANY)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(4)
  })

  it('いっぱいのときに足そうとすると、メッセージを出し、何も足さない', () => {
    const { result } = multi()
    act(() => result.current.addFiles([1, 2, 3, 4].map((n) => file(`${n}.png`))))

    act(() => result.current.addFiles([file('5.png')]))

    expect(result.current.drafts).toHaveLength(4)
    expect(result.current.pickError).toBe(TOO_MANY)
  })

  it('形式や大きさが合わない画像は足さず、合う画像は足す。最初のエラーを出す', () => {
    const { result } = multi()

    act(() =>
      result.current.addFiles([file('a.gif', 100, 'image/gif'), file('ok.png'), file('big.png', 5 * 1024 * 1024 + 1)]),
    )

    expect(result.current.drafts.map((d) => d.file.name)).toEqual(['ok.png'])
    expect(result.current.pickError).toBe(IMAGE_MESSAGES.type)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  })

  it('次に、問題なく選べたら、エラーは消える', () => {
    const { result } = multi()
    act(() => result.current.addFiles([file('a.gif', 100, 'image/gif')]))
    expect(result.current.pickError).toBe(IMAGE_MESSAGES.type)

    act(() => result.current.addFiles([file('ok.png')]))

    expect(result.current.pickError).toBeNull()
  })
})

describe('置き換える(アイコン用)', () => {
  it('2 枚目を選ぶと、1 枚目を置き換え、1 枚目のプレビューを解放する', () => {
    const { result } = single()
    act(() => result.current.addFiles([file('a.png')]))

    act(() => result.current.addFiles([file('b.png')]))

    expect(result.current.drafts).toHaveLength(1)
    expect(result.current.drafts[0].file.name).toBe('b.png')
    expect(revoked).toEqual(['blob:draft-1'])
    expect(result.current.pickError).toBeNull()
  })

  it('合わない画像を選んでも、今の画像はそのまま(エラーだけ出す)', () => {
    const { result } = single()
    act(() => result.current.addFiles([file('a.png')]))

    act(() => result.current.addFiles([file('a.gif', 100, 'image/gif')]))

    expect(result.current.drafts.map((d) => d.file.name)).toEqual(['a.png'])
    expect(result.current.pickError).toBe(IMAGE_MESSAGES.type)
    expect(revoked).toEqual([])
  })

  it('複数を同時に選ばれても、最初の有効な 1 枚だけを使い、あとの分のプレビューは作らない', () => {
    const { result } = single()

    act(() => result.current.addFiles([file('a.png'), file('b.png')]))

    expect(result.current.drafts.map((d) => d.file.name)).toEqual(['a.png'])
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  })
})

describe('取り除く・解放する', () => {
  it('1 枚を取り除くと、その画像のプレビューだけを解放し、エラーを消す', () => {
    const { result } = multi()
    act(() => result.current.addFiles([file('a.gif', 100, 'image/gif'), file('a.png'), file('b.png')]))
    const [first] = result.current.drafts

    act(() => result.current.remove(first.id))

    expect(result.current.drafts.map((d) => d.file.name)).toEqual(['b.png'])
    expect(revoked).toEqual(['blob:draft-1'])
    expect(result.current.pickError).toBeNull()
  })

  it('clear は、すべてのプレビューを解放して、空にする', () => {
    const { result } = multi()
    act(() => result.current.addFiles([file('a.png'), file('b.png'), file('c.png')]))

    act(() => result.current.clear())

    expect(result.current.drafts).toEqual([])
    expect(revoked.sort()).toEqual(['blob:draft-1', 'blob:draft-2', 'blob:draft-3'])
  })

  it('取り除いたあとは、また足せる', () => {
    const { result } = multi()
    act(() => result.current.addFiles([1, 2, 3, 4].map((n) => file(`${n}.png`))))
    act(() => result.current.remove(result.current.drafts[0].id))

    act(() => result.current.addFiles([file('new.png')]))

    expect(result.current.drafts).toHaveLength(4)
    expect(result.current.pickError).toBeNull()
  })

  it('画面を離れる(アンマウント)ときに、残っているプレビューを解放する', () => {
    const { result, unmount } = multi()
    act(() => result.current.addFiles([file('a.png'), file('b.png')]))

    unmount()

    expect(revoked.sort()).toEqual(['blob:draft-1', 'blob:draft-2'])
  })

  it('一度解放したプレビューを、アンマウントのときに、もう一度解放しない', () => {
    const { result, unmount } = multi()
    act(() => result.current.addFiles([file('a.png'), file('b.png')]))
    act(() => result.current.clear())

    unmount()

    expect(revoked).toHaveLength(2)
  })
})

describe('書き換え(update)', () => {
  it('アップロードできたキーや失敗の印を書いても、プレビューは解放しない', () => {
    const { result } = multi()
    act(() => result.current.addFiles([file('a.png')]))
    const [draft] = result.current.drafts

    act(() => result.current.update((current) => current.map((d) => ({ ...d, uploadedKey: 'posts/1/k.png' }))))

    expect(result.current.drafts[0]).toMatchObject({ id: draft.id, uploadedKey: 'posts/1/k.png' })
    expect(revoked).toEqual([])
  })

  it('書き換えの直後に取り除いても、最新の内容に対して動く', () => {
    const { result } = multi()
    act(() => result.current.addFiles([file('a.png'), file('b.png')]))
    const ids = result.current.drafts.map((d) => d.id)

    act(() => {
      result.current.update((current) => current.map((d) => ({ ...d, error: 'x' })))
      result.current.remove(ids[0])
    })

    expect(result.current.drafts).toHaveLength(1)
    expect(result.current.drafts[0]).toMatchObject({ id: ids[1], error: 'x' })
  })
})

describe('handlePick(file の input の onChange)', () => {
  function changeEvent(files: File[]) {
    const input = { files, value: 'C:\\fakepath\\a.png' }
    return { event: { target: input } as unknown as ChangeEvent<HTMLInputElement>, input }
  }

  it('選んだ画像を足し、同じ画像を選び直せるよう、input の値を空にする', () => {
    const { result } = multi()
    const { event, input } = changeEvent([file('a.png')])

    act(() => result.current.handlePick(event))

    expect(result.current.drafts).toHaveLength(1)
    expect(input.value).toBe('')
  })

  it('何も選ばれなかったとき(キャンセル)は、何も変えない', () => {
    const { result } = multi()
    act(() => result.current.addFiles([file('a.png')]))
    const { event } = changeEvent([])

    act(() => result.current.handlePick(event))

    expect(result.current.drafts).toHaveLength(1)
    expect(result.current.pickError).toBeNull()
  })
})
