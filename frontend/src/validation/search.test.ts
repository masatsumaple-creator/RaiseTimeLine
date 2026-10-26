import { describe, expect, it } from 'vitest'
import { MAX_SEARCH_LENGTH, normalizeSearchTerm, validateSearchTerm } from './search'

describe('normalizeSearchTerm', () => {
  it('前後の空白を取り除く', () => {
    expect(normalizeSearchTerm('  taro  ')).toBe('taro')
  })

  it('先頭の @ を取り除く(@taro と taro は同じ)', () => {
    expect(normalizeSearchTerm('@taro')).toBe('taro')
    expect(normalizeSearchTerm(' @ taro ')).toBe('taro')
  })

  it('@ だけ・空白だけは空になる', () => {
    expect(normalizeSearchTerm('@')).toBe('')
    expect(normalizeSearchTerm('   ')).toBe('')
    expect(normalizeSearchTerm(' @  ')).toBe('')
  })

  it('途中の @ や空白は残す', () => {
    expect(normalizeSearchTerm('ta@ro san')).toBe('ta@ro san')
  })
})

describe('validateSearchTerm', () => {
  it('50 文字ちょうどは可、51 文字は不可', () => {
    expect(validateSearchTerm('a'.repeat(MAX_SEARCH_LENGTH))).toBeNull()
    expect(validateSearchTerm('a'.repeat(MAX_SEARCH_LENGTH + 1))).toBe('50 文字以内で入力してください')
  })

  it('絵文字などは 1 文字として数える', () => {
    expect(validateSearchTerm('😀'.repeat(MAX_SEARCH_LENGTH))).toBeNull()
    expect(validateSearchTerm('😀'.repeat(MAX_SEARCH_LENGTH + 1))).not.toBeNull()
  })

  it('空の検索語はエラーにしない(検索をしないだけ)', () => {
    expect(validateSearchTerm('')).toBeNull()
  })
})
