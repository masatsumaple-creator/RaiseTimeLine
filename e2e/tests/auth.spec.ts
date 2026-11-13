import { uniqueUser } from '../fixtures/data'
import { Api, expect, loginViaUi, test } from '../fixtures'

test.describe('認証: 新規登録・ログイン・ログアウト', () => {
  test('新規登録するとログイン状態でタイムラインが開く', async ({ page }) => {
    const u = uniqueUser('signup')
    await page.goto('/signup')
    await page.getByLabel('メールアドレス').fill(u.email)
    await page.getByLabel('パスワード').fill(u.password)
    await page.getByLabel('表示名').fill(u.displayName)
    await page.getByLabel('ユーザーハンドル').fill(u.handle)
    await page.getByRole('button', { name: '登録する' }).click()

    await expect(page.getByRole('heading', { name: 'タイムライン' })).toBeAttached()
    await expect(page.getByRole('link', { name: u.displayName })).toBeVisible()
  })

  test('登録済みのメールアドレスとパスワードでログインできる', async ({ page }) => {
    const api = await Api.signup('login')
    await loginViaUi(page, api.user.email)
    await expect(page.getByRole('link', { name: api.user.displayName })).toBeVisible()
    await api.dispose()
  })

  test('パスワードが違うとログインできず、エラーが表示される', async ({ page }) => {
    const api = await Api.signup('badpw')
    await page.goto('/login')
    await page.getByLabel('メールアドレス').fill(api.user.email)
    await page.getByLabel('パスワード').fill('WrongPass999')
    await page.getByRole('button', { name: 'ログイン', exact: true }).click()

    await expect(page.getByRole('alert').filter({ hasText: 'メールアドレスまたはパスワードが正しくありません' })).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
    await api.dispose()
  })

  test('ログイン画面の入力チェック(形式・未入力)', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('メールアドレス').fill('not-an-email')
    await page.getByRole('button', { name: 'ログイン', exact: true }).click()
    await expect(page.getByText('メールアドレスの形式が正しくありません')).toBeVisible()
    await expect(page.getByText('パスワードを入力してください')).toBeVisible()
  })

  test('新規登録の入力チェック(パスワード・ハンドル・表示名)', async ({ page }) => {
    await page.goto('/signup')
    await page.getByLabel('メールアドレス').fill('a@example.com')
    await page.getByLabel('パスワード').fill('onlyletters')
    await page.getByLabel('表示名').fill('   ')
    await page.getByLabel('ユーザーハンドル').fill('a!')
    await page.getByRole('button', { name: '登録する' }).click()

    await expect(page.getByText('パスワードは 8〜64 文字で、英字と数字を含めてください')).toBeVisible()
    await expect(page.getByText('表示名は 1〜50 文字で入力してください')).toBeVisible()
    await expect(page.getByText('ユーザーハンドルは半角英数字と _ の 3〜30 文字で入力してください')).toBeVisible()
    await expect(page).toHaveURL(/\/signup$/)
  })

  test('登録済みのメールアドレス・ハンドルで登録するとエラーになる', async ({ page }) => {
    const existing = await Api.signup('dup')
    const u = uniqueUser('dup2')

    await page.goto('/signup')
    await page.getByLabel('メールアドレス').fill(existing.user.email)
    await page.getByLabel('パスワード').fill(u.password)
    await page.getByLabel('表示名').fill(u.displayName)
    await page.getByLabel('ユーザーハンドル').fill(u.handle)
    await page.getByRole('button', { name: '登録する' }).click()
    await expect(page.locator('#email-error')).not.toBeEmpty()

    await page.getByLabel('メールアドレス').fill(u.email)
    await page.getByLabel('ユーザーハンドル').fill(existing.user.handle.toUpperCase()) // 大文字小文字は区別しない
    await page.getByRole('button', { name: '登録する' }).click()
    await expect(page.locator('#handle-error')).not.toBeEmpty()
    await expect(page).toHaveURL(/\/signup$/)
    await existing.dispose()
  })

  test('ログアウトすると保護された画面に入れなくなる', async ({ page, timeline }) => {
    await page.getByRole('button', { name: 'ログアウト' }).click()
    await expect(page).toHaveURL(/\/login$/)

    await page.goto('/')
    await expect(page).toHaveURL(/\/login$/)
    await page.goto('/search')
    await expect(page).toHaveURL(/\/login$/)
    void timeline
  })

  test('未ログインで保護ページを開くとログインへ移動し、ログイン後に元のページへ戻る', async ({ page }) => {
    const api = await Api.signup('back')
    await page.goto('/search')
    await expect(page).toHaveURL(/\/login$/)

    await page.getByLabel('メールアドレス').fill(api.user.email)
    await page.getByLabel('パスワード').fill(api.user.password)
    await page.getByRole('button', { name: 'ログイン', exact: true }).click()
    await expect(page).toHaveURL(/\/search/)
    await api.dispose()
  })

  test('ログイン済みでログイン画面を開くとタイムラインへ移動する', async ({ page, timeline }) => {
    await page.goto('/login')
    await expect(page).toHaveURL(/\/$/)
    void timeline
  })

  test('存在しないURLでは「ページが見つかりません」を表示する', async ({ page, timeline }) => {
    await page.goto('/no-such-page')
    await expect(page.getByRole('heading', { name: 'ページが見つかりません' })).toBeVisible()
    void timeline
  })
})
