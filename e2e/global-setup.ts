import { cleanupE2eData } from './db'

// 前回の異常終了で残ったデータがあれば消してから始める。
// (webServer より先に走るため、DB が起動していなくても失敗にはしない)
export default async function globalSetup() {
  await cleanupE2eData()
}
