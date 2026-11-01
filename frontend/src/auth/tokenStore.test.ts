import { beforeEach, describe, expect, it } from 'vitest'
import { tokenStore } from './tokenStore'

beforeEach(() => {
  tokenStore.clear()
})

describe('tokenStore', () => {
  it('最初は null', () => {
    expect(tokenStore.get()).toBeNull()
  })

  it('set したトークンを get で返す', () => {
    tokenStore.set('access-1')

    expect(tokenStore.get()).toBe('access-1')
  })

  it('set し直すと上書きする', () => {
    tokenStore.set('access-1')
    tokenStore.set('access-2')

    expect(tokenStore.get()).toBe('access-2')
  })

  it('clear で null に戻る', () => {
    tokenStore.set('access-1')

    tokenStore.clear()

    expect(tokenStore.get()).toBeNull()
  })

  it('localStorage / sessionStorage には保存しない(XSS で盗まれないよう、メモリだけに持つ)', () => {
    tokenStore.set('secret-token')

    expect(JSON.stringify({ ...localStorage })).not.toContain('secret-token')
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('secret-token')
  })
})
