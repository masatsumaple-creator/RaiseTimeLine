import { describe, expect, it } from 'vitest'
import { POST_MESSAGES, remainingLength, validatePostBody } from './post'

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
