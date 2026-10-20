import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <section className="panel">
      <h1>ページが見つかりません</h1>
      <p>
        <Link to="/">ホームへ</Link>
      </p>
    </section>
  )
}
