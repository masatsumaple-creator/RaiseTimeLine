import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { PostImage } from '../api/types'

interface LightboxProps {
  images: PostImage[]
  /** 表示している画像の位置(0 から) */
  index: number
  onChange: (index: number) => void
  onClose: () => void
}

/** 画像の拡大表示。Esc・背景のクリック・閉じるボタンで閉じ、複数枚のときは ← → か前後のボタンで切り替える。 */
export function Lightbox({ images, index, onChange, onClose }: LightboxProps) {
  const closeButton = useRef<HTMLButtonElement>(null)
  const count = images.length
  const current = images[index]

  // 開いたら、閉じるボタンにフォーカスを移す(キーボードで操作でき、Esc も効く)
  useEffect(() => {
    closeButton.current?.focus()
  }, [])

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      } else if (event.key === 'ArrowLeft' && index > 0) {
        onChange(index - 1)
      } else if (event.key === 'ArrowRight' && index < count - 1) {
        onChange(index + 1)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [index, count, onChange, onClose])

  if (!current) return null

  return createPortal(
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="画像の拡大表示"
      onClick={(e) => {
        // 画像やボタンの外(背景)を押したときだけ閉じる
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <button ref={closeButton} type="button" className="lightbox-close" aria-label="閉じる" onClick={onClose}>
        ×
      </button>
      <img className="lightbox-image" src={current.url} alt={`投稿の画像 ${index + 1}`} />
      {count > 1 && (
        <>
          <button
            type="button"
            className="lightbox-nav prev"
            aria-label="前の画像"
            disabled={index === 0}
            onClick={() => onChange(index - 1)}
          >
            ‹
          </button>
          <button
            type="button"
            className="lightbox-nav next"
            aria-label="次の画像"
            disabled={index === count - 1}
            onClick={() => onChange(index + 1)}
          >
            ›
          </button>
          <p className="lightbox-count" aria-live="polite">
            {index + 1} / {count}
          </p>
        </>
      )}
    </div>,
    document.body,
  )
}
