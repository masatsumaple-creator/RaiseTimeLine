import { useEffect, useState } from 'react'
import { fetchMe } from '../api/auth'
import type { User } from '../api/types'
import { NETWORK_ERROR_MESSAGE } from './formErrors'

/** ログイン後の仮画面(S-03 の代わり)。ログイン中のユーザー情報を /api/auth/me から取得して表示する。 */
export function HomePage() {
  const [me, setMe] = useState<User | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchMe()
      .then((user) => {
        if (!cancelled) setMe(user)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="panel">
      <h1>ログインしました</h1>
      {me ? (
        <>
          <p>{me.displayName} さん、ようこそ。</p>
          <dl className="profile">
            <dt>表示名</dt>
            <dd>{me.displayName}</dd>
            <dt>ユーザーハンドル</dt>
            <dd>@{me.handle}</dd>
            <dt>ユーザーID</dt>
            <dd>{me.id}</dd>
          </dl>
        </>
      ) : failed ? (
        <p className="error">{NETWORK_ERROR_MESSAGE}</p>
      ) : (
        <p className="muted">読み込み中…</p>
      )}
      <p className="muted">タイムラインはまだ実装されていません。</p>
    </section>
  )
}
