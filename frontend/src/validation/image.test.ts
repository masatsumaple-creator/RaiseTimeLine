import { describe, expect, it } from 'vitest'
import { IMAGE_ACCEPT, IMAGE_MESSAGES, MAX_IMAGE_BYTES, validateImageFile } from './image'

describe('validateImageFile', () => {
  it('JPEG・PNG・WebP は可', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(validateImageFile({ type, size: 1000 })).toBeNull()
    }
  })

  it('GIF・SVG・その他の形式は不可', () => {
    for (const type of ['image/gif', 'image/svg+xml', 'text/plain', 'application/pdf', '']) {
      expect(validateImageFile({ type, size: 1000 })).toBe(IMAGE_MESSAGES.type)
    }
  })

  it('5MB ちょうどは可、1 バイトでも超えると不可', () => {
    expect(validateImageFile({ type: 'image/png', size: MAX_IMAGE_BYTES })).toBeNull()
    expect(validateImageFile({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 })).toBe(IMAGE_MESSAGES.size)
  })

  it('空のファイルは不可', () => {
    expect(validateImageFile({ type: 'image/png', size: 0 })).toBe(IMAGE_MESSAGES.empty)
  })

  it('形式の確認を、大きさより先にする(形式が違えば、形式のエラーを出す)', () => {
    expect(validateImageFile({ type: 'image/gif', size: MAX_IMAGE_BYTES + 1 })).toBe(IMAGE_MESSAGES.type)
  })

  it('accept には、使える形式だけを並べる', () => {
    expect(IMAGE_ACCEPT).toBe('image/jpeg,image/png,image/webp')
  })
})
