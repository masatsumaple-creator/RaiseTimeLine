import { test as base, expect, type Browser, type Page } from '@playwright/test'
import { TimelinePage } from '../pages/TimelinePage'
import { Api } from './api'
import { PASSWORD } from './data'

export { expect, Api, PASSWORD }

/** UI からログインして、タイムラインが開くところまで進める。 */
export async function loginViaUi(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login')
  await page.getByLabel('メールアドレス').fill(email)
  await page.getByLabel('パスワード').fill(password)
  await page.getByRole('button', { name: 'ログイン', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'タイムライン' })).toBeAttached()
}

/** 別ユーザーとして UI ログイン済みの、独立したブラウザコンテキスト(Cookie・メモリを共有しない)を作る。 */
export async function openAs(browser: Browser, user: Api) {
  const context = await browser.newContext({ locale: 'ja-JP' })
  const page = await context.newPage()
  await loginViaUi(page, user.user.email)
  return { context, page }
}

interface Fixtures {
  /** API で作った、このテスト専用のユーザー */
  me: Api
  /** me として UI ログイン済みのタイムライン画面 */
  timeline: TimelinePage
}

export const test = base.extend<Fixtures>({
  me: async ({}, use) => {
    const api = await Api.signup('me')
    await use(api)
    await api.dispose()
  },
  timeline: async ({ page, me }, use) => {
    await loginViaUi(page, me.user.email)
    await use(new TimelinePage(page))
  },
})
