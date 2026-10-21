interface NewPostsBarProps {
  count: number
  /** 件数が上限を超えている */
  hasMore: boolean
  onClick: () => void
}

/** 一覧の上部に出る「N件の新しい投稿を表示」。押すと新着を一覧に反映する。 */
export function NewPostsBar({ count, hasMore, onClick }: NewPostsBarProps) {
  return (
    <button type="button" className="new-posts-bar" onClick={onClick}>
      {hasMore ? `${count}件以上` : `${count}件`}の新しい投稿を表示
    </button>
  )
}
