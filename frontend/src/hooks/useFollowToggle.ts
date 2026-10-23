import { useRef } from 'react'
import { ApiError } from '../api/client'
import type { FollowResult } from '../api/types'
import { followUser, unfollowUser } from '../api/users'
import { useToast } from '../components/toast'

interface FollowState {
  followedByMe: boolean
  /** 画面が相手のフォロワー数を持っているときだけ渡す(プロフィール)。一覧の行は渡さない */
  followerCount?: number
}

/**
 * フォロー / 解除の操作。押した直後に画面を先に更新し、サーバーの結果で上書きする。
 * 失敗したら元に戻してメッセージを出す。連打されたときは、最後に押した操作の結果だけを反映する。
 * 画面の更新は apply に任せる(followerCount は、渡された current に含まれるときだけ変える)。
 */
export function useFollowToggle(handle: string, apply: (patch: Partial<FollowResult>) => void) {
  const toast = useToast()
  const seq = useRef(0)

  return async function toggle(current: FollowState) {
    const follow = !current.followedByMe
    const mine = ++seq.current
    apply(
      current.followerCount === undefined
        ? { followedByMe: follow }
        : { followedByMe: follow, followerCount: Math.max(0, current.followerCount + (follow ? 1 : -1)) },
    )
    try {
      const result = await (follow ? followUser : unfollowUser)(handle)
      if (mine === seq.current) apply(current.followerCount === undefined ? { followedByMe: result.followedByMe } : result)
    } catch (e) {
      if (mine !== seq.current) return
      apply(
        current.followerCount === undefined
          ? { followedByMe: current.followedByMe }
          : { followedByMe: current.followedByMe, followerCount: current.followerCount },
      )
      toast(e instanceof ApiError && e.status === 404 ? 'ユーザーが見つかりません' : 'フォローの操作に失敗しました')
    }
  }
}
