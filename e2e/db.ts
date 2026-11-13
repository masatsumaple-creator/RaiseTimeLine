import { Client } from 'pg'

export const E2E_DB_URL = process.env.E2E_PG_URL ?? 'postgresql://raisetimeline:raisetimeline@localhost:5434/raisetimeline_e2e'

/** E2E 用に作ったユーザー(ハンドルが e2e_ で始まる)を全て消す。外部キーが CASCADE なので、投稿・コメント等も消える。 */
export async function cleanupE2eData() {
  const client = new Client({ connectionString: E2E_DB_URL })
  try {
    await client.connect()
    await client.query("DELETE FROM users WHERE handle LIKE 'e2e\\_%'")
  } catch (e) {
    console.warn('E2E データの掃除に失敗しました:', (e as Error).message)
  } finally {
    await client.end().catch(() => undefined)
  }
}
