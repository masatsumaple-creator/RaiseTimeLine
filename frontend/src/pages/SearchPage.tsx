import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { searchUsers } from '../api/users'
import type { UserSummary } from '../api/types'
import { UserList } from '../components/UserList'
import { usePagedList } from '../hooks/usePagedList'
import { normalizeSearchTerm, validateSearchTerm } from '../validation/search'

/** 入力を止めてから検索を始めるまでの待ち時間(ミリ秒)。Enter を押したときは待たない。 */
export const SEARCH_DEBOUNCE_MS = 300

/** 入力欄の文字から、URL に持つ検索語(?q=)を作る。空なら何も持たない。 */
function queryParams(raw: string): Record<string, string> {
  const q = raw.trim()
  return q === '' ? {} : { q }
}

/** ユーザー検索(S-07)。検索語は URL の ?q= に持つので、リロードや戻るで復元できる。 */
export function SearchPage() {
  const [params, setParams] = useSearchParams()
  const urlQuery = params.get('q') ?? ''
  const [input, setInput] = useState(urlQuery)

  // 検索語を確定する(URL に持つ)。履歴は積まず置き換えるので、「戻る」で検索前の画面に戻れる
  const commit = useCallback(
    (raw: string) => {
      if (raw.trim() !== urlQuery) setParams(queryParams(raw), { replace: true })
    },
    [urlQuery, setParams],
  )

  // 入力を止めて一定時間たったら、検索語を確定する
  useEffect(() => {
    const timer = setTimeout(() => commit(input), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [input, commit])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    commit(input)
  }

  const term = normalizeSearchTerm(urlQuery)
  const inputError = validateSearchTerm(normalizeSearchTerm(input))

  return (
    <>
      <h1 className="sr-only">ユーザー検索</h1>
      <form className="panel search-form" role="search" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="search-input">
          ユーザーを検索
        </label>
        <input
          id="search-input"
          className="search-input"
          type="search"
          autoFocus
          autoComplete="off"
          placeholder="@ハンドルまたは表示名で探す"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-invalid={inputError ? true : undefined}
        />
        <p className="error" role="alert">
          {inputError}
        </p>
      </form>

      {term === '' && <p className="muted center">ハンドルか表示名の一部を入力して、ユーザーを探しましょう。</p>}
      {term !== '' && validateSearchTerm(term) === null && <SearchResults key={term} term={term} />}
    </>
  )
}

/**
 * 1 つの検索語の結果。検索語ごとに作り直す(key)ので、前の検索語の結果は引き継がない。
 * 遅れて届いた古い検索語の結果は、作り直しで捨てられ、最後の検索語の結果だけが表示される。
 */
function SearchResults({ term }: { term: string }) {
  const list = usePagedList<UserSummary>(`search:${term}`, (cursor) => searchUsers(term, cursor))
  return <UserList list={list} emptyMessage="見つかりませんでした" />
}
