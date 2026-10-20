import { describe, expect, it } from 'vitest'
import {
  codePointLength,
  MESSAGES,
  normalizeHandle,
  validateDisplayName,
  validateEmail,
  validateHandle,
  validateLoginPassword,
  validateNewPassword,
} from './auth'

describe('validateEmail', () => {
  it.each(['a@example.com', ' a@example.com ', 'first.last+tag@sub.example.co.jp'])('%s は有効', (value) => {
    expect(validateEmail(value)).toBeNull()
  })

  it.each(['', 'not-an-email', 'a@b', 'a b@example.com', '@example.com', 'a@@example.com'])('"%s" は無効', (value) => {
    expect(validateEmail(value)).toBe(MESSAGES.email)
  })

  it('255 文字までは有効、256 文字は無効', () => {
    const local = (length: number) => 'a'.repeat(length - '@example.com'.length) + '@example.com'
    expect(validateEmail(local(255))).toBeNull()
    expect(validateEmail(local(256))).toBe(MESSAGES.email)
  })
})

describe('validateLoginPassword', () => {
  it('空は無効、1 文字以上なら有効(強度は登録時だけ検証する)', () => {
    expect(validateLoginPassword('')).toBe(MESSAGES.loginPasswordRequired)
    expect(validateLoginPassword('a')).toBeNull()
  })
})

describe('validateNewPassword', () => {
  it('8〜64 文字で英字と数字を含めば有効', () => {
    expect(validateNewPassword('abcdefg1')).toBeNull()
    expect(validateNewPassword('a'.repeat(63) + '1')).toBeNull()
  })

  it.each([
    ['7 文字', 'abcdef1'],
    ['65 文字', 'a'.repeat(64) + '1'],
    ['英字のみ', 'abcdefgh'],
    ['数字のみ', '12345678'],
    ['空', ''],
  ])('%s は無効', (_name, value) => {
    expect(validateNewPassword(value)).toBe(MESSAGES.password)
  })

  it('前後の空白は取り除かずそのまま数える', () => {
    expect(validateNewPassword('       1')).toBe(MESSAGES.password)
    expect(validateNewPassword(' abcdef1 ')).toBeNull()
  })
})

describe('validateDisplayName', () => {
  it('前後の空白を除いて 1〜50 文字なら有効', () => {
    expect(validateDisplayName('田村')).toBeNull()
    expect(validateDisplayName('  田村  ')).toBeNull()
    expect(validateDisplayName('あ'.repeat(50))).toBeNull()
  })

  it.each([
    ['空', ''],
    ['空白のみ', '   '],
    ['51 文字', 'あ'.repeat(51)],
  ])('%s は無効', (_name, value) => {
    expect(validateDisplayName(value)).toBe(MESSAGES.displayName)
  })

  it('絵文字は 1 文字と数える', () => {
    expect(codePointLength('😀')).toBe(1)
    expect(validateDisplayName('😀'.repeat(50))).toBeNull()
    expect(validateDisplayName('😀'.repeat(51))).toBe(MESSAGES.displayName)
  })
})

describe('validateHandle / normalizeHandle', () => {
  it.each(['abc', 'Tamura_01', 'a'.repeat(30), '@alice', ' @alice '])('"%s" は有効', (value) => {
    expect(validateHandle(value)).toBeNull()
  })

  it.each([
    ['2 文字', 'ab'],
    ['31 文字', 'a'.repeat(31)],
    ['記号を含む', 'bad-name'],
    ['日本語', 'たむら'],
    ['空', ''],
    ['@ だけ', '@'],
    ['@ が 2 つ', '@@alice'],
  ])('%s は無効', (_name, value) => {
    expect(validateHandle(value)).toBe(MESSAGES.handle)
  })

  it('先頭の @ を 1 つだけ取り除く', () => {
    expect(normalizeHandle(' @alice ')).toBe('alice')
    expect(normalizeHandle('@@alice')).toBe('@alice')
  })
})
