import { useRef, useState } from 'react'
import type { PostImage } from '../api/types'
import { Lightbox } from './Lightbox'

interface PostImagesProps {
  images: PostImage[]
}

/** 投稿の画像。サムネイルを並べ(1 枚は大きく、2〜4 枚は 2 列)、押すと拡大表示を開く。 */
export function PostImages({ images }: PostImagesProps) {
  const [opened, setOpened] = useState<number | null>(null)
  // 読み込めなかった画像(署名付き URL の期限切れなど)は、壊れた表示にせず、代わりの表示にする
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set())
  // 拡大表示を閉じたら、開いたサムネイルにフォーカスを戻す
  const thumbs = useRef<(HTMLButtonElement | null)[]>([])

  if (images.length === 0) return null
  const sorted = [...images].sort((a, b) => a.sortOrder - b.sortOrder)

  function close() {
    const index = opened
    setOpened(null)
    if (index !== null) requestAnimationFrame(() => thumbs.current[index]?.focus())
  }

  return (
    <>
      <div className={`post-images n${sorted.length}`}>
        {sorted.map((image, i) =>
          failed.has(image.url) ? (
            <div key={image.url} className="post-image-missing muted">
              画像を表示できません
            </div>
          ) : (
            <button
              key={image.url}
              ref={(el) => {
                thumbs.current[i] = el
              }}
              type="button"
              className="post-image"
              aria-label={`画像 ${i + 1} を拡大`}
              onClick={() => setOpened(i)}
            >
              <img
                src={image.url}
                alt={`投稿の画像 ${i + 1}`}
                loading="lazy"
                onError={() => setFailed((prev) => new Set(prev).add(image.url))}
              />
            </button>
          ),
        )}
      </div>
      {opened !== null && <Lightbox images={sorted} index={opened} onChange={setOpened} onClose={close} />}
    </>
  )
}
