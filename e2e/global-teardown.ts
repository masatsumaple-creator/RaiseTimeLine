import { cleanupE2eData } from './db'

export default async function globalTeardown() {
  if (process.env.E2E_KEEP_DATA) return
  await cleanupE2eData()
}
