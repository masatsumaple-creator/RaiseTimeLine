import { describe, expect, it } from 'vitest'
import { BIO_MAX_LENGTH, BIO_MESSAGE, remainingBioLength, validateBio } from './profile'

describe('validateBio', () => {
  it('空でもよい(任意項目)', () => {
    expect(validateBio('')).toBeNull()
    expect(validateBio('   ')).toBeNull()
  })

  it('160 文字ちょうどは可、161 文字は不可', () => {
    expect(validateBio('あ'.repeat(BIO_MAX_LENGTH))).toBeNull()
    expect(validateBio('あ'.repeat(BIO_MAX_LENGTH + 1))).toBe(BIO_MESSAGE)
  })

  it('前後の空白は数えない', () => {
    expect(validateBio(`  ${'あ'.repeat(BIO_MAX_LENGTH)}  `)).toBeNull()
  })

  it('絵文字などは 1 文字として数える。改行は 1 文字', () => {
    expect(validateBio('😀'.repeat(BIO_MAX_LENGTH))).toBeNull()
    expect(validateBio('😀'.repeat(BIO_MAX_LENGTH + 1))).toBe(BIO_MESSAGE)
    expect(remainingBioLength('a\nb')).toBe(BIO_MAX_LENGTH - 3)
  })
})

describe('remainingBioLength', () => {
  it('残り文字数を返す。超えると負の数', () => {
    expect(remainingBioLength('')).toBe(160)
    expect(remainingBioLength('abc')).toBe(157)
    expect(remainingBioLength('a'.repeat(165))).toBe(-5)
  })
})
