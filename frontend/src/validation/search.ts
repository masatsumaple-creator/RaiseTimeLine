/** 検索語の長さの上限(サーバーと同じ。コードポイント数で数える)。 */
export const MAX_SEARCH_LENGTH = 50

/** 前後の空白と先頭の @ を取り除く(@taro と taro は同じ結果になる)。 */
export function normalizeSearchTerm(raw: string): string {
  const trimmed = raw.trim()
  return trimmed.startsWith('@') ? trimmed.slice(1).trim() : trimmed
}

/** 整えた検索語の検証。問題が無ければ null、あればエラー文言。空の検索語は、エラーではなく「検索しない」として扱う。 */
export function validateSearchTerm(term: string): string | null {
  return Array.from(term).length > MAX_SEARCH_LENGTH ? `${MAX_SEARCH_LENGTH} 文字以内で入力してください` : null
}
