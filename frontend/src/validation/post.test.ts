import { describe, expect, it } from 'vitest'
import { POST_MAX_IMAGES, POST_MESSAGES, remainingLength, validateNewPost, validatePostBody } from './post'

describe('validatePostBody', () => {
  it('空・空白のみは本文なしとして弾く', () => {
    expect(validatePostBody('')).toBe(POST_MESSAGES.required)
    expect(validatePostBody(' \n  ')).toBe(POST_MESSAGES.required)
  })

  it('280 文字ちょうどは通り、281 文字は弾く', () => {
    expect(validatePostBody('あ'.repeat(280))).toBeNull()
    expect(validatePostBody('あ'.repeat(281))).toBe(POST_MESSAGES.tooLong)
  })

  it('絵文字は 1 文字と数える', () => {
    expect(validatePostBody('😀'.repeat(280))).toBeNull()
    expect(remainingLength('😀😀')).toBe(278)
  })

  it('前後の空白は文字数に含めない', () => {
    expect(validatePostBody(`  ${'a'.repeat(280)}  `)).toBeNull()
  })
})

describe('validatePostBody(画像のある投稿の編集)', () => {
  it('allowEmpty のときは、空の本文を通す(画像だけの投稿になる)', () => {
    expect(validatePostBody('', true)).toBeNull()
    expect(validatePostBody(' \n  ', true)).toBeNull()
  })

  it('allowEmpty でも、281 文字は弾く', () => {
    expect(validatePostBody('あ'.repeat(281), true)).toBe(POST_MESSAGES.tooLong)
  })
})

describe('validateNewPost', () => {
  it('本文も画像も無いと弾く', () => {
    expect(validateNewPost('', 0)).toBe(POST_MESSAGES.requiredOrImage)
    expect(validateNewPost('  \n ', 0)).toBe(POST_MESSAGES.requiredOrImage)
  })

  it('本文だけ、画像だけ、両方のどれでも通す', () => {
    expect(validateNewPost('こんにちは', 0)).toBeNull()
    expect(validateNewPost('', 1)).toBeNull()
    expect(validateNewPost('こんにちは', 3)).toBeNull()
  })

  it('画像があっても、本文が 281 文字なら弾く', () => {
    expect(validateNewPost('あ'.repeat(280), 1)).toBeNull()
    expect(validateNewPost('あ'.repeat(281), 1)).toBe(POST_MESSAGES.tooLong)
  })

  it('画像は最大 4 枚', () => {
    expect(POST_MAX_IMAGES).toBe(4)
  })
})
