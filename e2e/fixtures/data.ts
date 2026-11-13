export const PASSWORD = 'E2eTest1234'

let seq = 0

/** 並列・繰り返し実行でも衝突しない、一意なユーザー情報。ハンドルは e2e_ で始まる(掃除の目印)。 */
export function uniqueUser(label = 'u') {
  seq += 1
  const id = `${Date.now().toString(36)}${seq}${Math.random().toString(36).slice(2, 6)}`
  return {
    email: `e2e_${label}_${id}@e2e.example.test`,
    password: PASSWORD,
    handle: `e2e_${label}_${id}`.slice(0, 30),
    displayName: `E2E ${label} ${id.slice(-5)}`,
  }
}

/** 「全体」タブはテスト同士で共有されるので、そこで探す本文には一意な印を付ける。 */
export function uniq(text: string) {
  seq += 1
  return `${text} #${Date.now().toString(36)}${seq}${Math.random().toString(36).slice(2, 5)}`
}

export type TestUser = ReturnType<typeof uniqueUser>
