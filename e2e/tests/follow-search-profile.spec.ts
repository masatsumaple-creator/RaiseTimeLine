import { Api, expect, test } from '../fixtures'

test.describe('検索・フォロー・プロフィール', () => {
  test('ハンドルで検索してその場でフォロー・解除できる', async ({ page, timeline, me }) => {
    const target = await Api.signup('findme')
    await page.goto('/search')
    await page.getByPlaceholder('@ハンドルまたは表示名で探す').fill(target.user.handle)

    const follow = page.getByRole('button', { name: `${target.user.displayName}をフォロー`, exact: true })
    await expect(follow).toBeVisible()
    await follow.click()

    const unfollow = page.getByRole('button', { name: `${target.user.displayName}をフォロー解除` })
    await expect(unfollow).toHaveAttribute('aria-pressed', 'true')
    await unfollow.click()
    await expect(follow).toHaveAttribute('aria-pressed', 'false')
    void timeline
    void me
    await target.dispose()
  })

  test('表示名の一部でも検索でき、該当なしでは案内を表示する', async ({ page, timeline }) => {
    const token = `ZX${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}` // 繰り返し実行でも一意
    const name = `ユニーク太郎${token}`
    const target = await Api.signup('partial', { displayName: name })
    await page.goto('/search')
    const input = page.getByPlaceholder('@ハンドルまたは表示名で探す')

    await input.fill(`ニーク太郎${token}`)
    await expect(page.getByRole('link', { name: name, exact: true })).toBeVisible()
    await expect(page).toHaveURL(/q=/) // 検索語はURLに残る

    await input.fill('zzzz_no_such_user_zzzz')
    await expect(page.getByText('見つかりませんでした')).toBeVisible()
    void timeline
    await target.dispose()
  })

  test('検索語はリロードしても復元される', async ({ page, timeline }) => {
    const target = await Api.signup('reload')
    await page.goto(`/search?q=${encodeURIComponent(target.user.handle)}`)
    await expect(page.getByRole('link', { name: target.user.displayName, exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByPlaceholder('@ハンドルまたは表示名で探す')).toHaveValue(target.user.handle)
    await expect(page.getByRole('link', { name: target.user.displayName, exact: true })).toBeVisible()
    void timeline
    await target.dispose()
  })

  test('プロフィールからフォローすると人数が増え、フォロー中の一覧に出て、タイムラインにも投稿が出る', async ({ page, timeline, me }) => {
    const target = await Api.signup('profile', { displayName: 'プロフィール太郎' })
    await target.post('フォローしたら見える投稿')

    await page.goto(`/users/${target.user.handle}`)
    await expect(page.getByRole('heading', { name: 'プロフィール太郎' })).toBeVisible()
    await expect(page.getByRole('link', { name: /フォロワー$/ })).toContainText('0')

    await page.getByRole('button', { name: 'フォロー', exact: true }).click()
    await expect(page.getByRole('button', { name: 'フォロー中' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('link', { name: /フォロワー$/ })).toContainText('1')

    // 自分のフォロー中一覧
    await page.goto(`/users/${me.user.handle}/following`)
    await expect(page.getByRole('link', { name: 'プロフィール太郎', exact: true })).toBeVisible()
    // 相手のフォロワー一覧
    await page.goto(`/users/${target.user.handle}/followers`)
    // (ヘッダーにも自分の名前のリンクがあるので、一覧の行に絞る)
    await expect(page.getByRole('listitem').getByRole('link', { name: me.user.displayName, exact: true })).toBeVisible()

    // タイムライン(フォロー中)に反映
    await timeline.goto()
    await expect(timeline.card('フォローしたら見える投稿')).toBeVisible()
    await target.dispose()
  })

  test('自分のプロフィールにはフォローボタンがなく、編集リンクが出る', async ({ page, timeline, me }) => {
    await page.goto(`/users/${me.user.handle}`)
    await expect(page.getByRole('link', { name: 'プロフィールを編集' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^フォロー/ })).toHaveCount(0)

    // 検索結果でも自分の行にはフォローボタンが出ない
    await page.goto(`/search?q=${encodeURIComponent(me.user.handle)}`)
    await expect(page.getByRole('listitem').getByRole('link', { name: me.user.displayName, exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /をフォロー/ })).toHaveCount(0)
    void timeline
  })

  test('API でも自分自身はフォローできない(400)', async ({ me }) => {
    const res = await me.raw('put', `/api/users/${me.user.handle}/follow`)
    expect(res.status()).toBe(400)
    expect((await res.json()).code).toBe('CANNOT_FOLLOW_SELF')
  })

  test('プロフィールを編集すると表示名と自己紹介が反映される', async ({ page, timeline, me }) => {
    await page.goto(`/users/${me.user.handle}`)
    await page.getByRole('link', { name: 'プロフィールを編集' }).click()
    await expect(page.getByRole('heading', { name: 'プロフィールを編集' })).toBeVisible()

    await page.getByLabel('表示名').fill('変更後の名前')
    await page.getByLabel('自己紹介').fill('こんにちは\nE2Eです')
    await page.getByRole('button', { name: '保存' }).click()

    await expect(page).toHaveURL(new RegExp(`/users/${me.user.handle}$`))
    await expect(page.getByRole('heading', { name: '変更後の名前' })).toBeVisible()
    await expect(page.getByText('E2Eです')).toBeVisible()
    await expect(page.getByRole('link', { name: '変更後の名前' })).toBeVisible() // ヘッダーにも反映
    void timeline
  })

  test('プロフィール編集の入力チェック(表示名の空・自己紹介160文字超)', async ({ page, timeline }) => {
    await page.goto('/settings/profile')
    const save = page.getByRole('button', { name: '保存' })

    await page.getByLabel('表示名').fill('')
    await expect(save).toBeDisabled()
    await page.getByLabel('表示名').fill('名前')
    await page.getByLabel('自己紹介').fill('あ'.repeat(161))
    await expect(save).toBeDisabled()
    await expect(page.getByText('残り -1 文字')).toBeVisible()
    await page.getByLabel('自己紹介').fill('あ'.repeat(160))
    await expect(save).toBeEnabled()
    void timeline
  })

  test('画像の保存先(S3)が未設定のときは、アイコンのアップロードがエラーになる', async ({ page, timeline }) => {
    await page.goto('/settings/profile')
    await page.locator('input[type=file]').setInputFiles({
      name: 'a.png',
      mimeType: 'image/png',
      // 1x1 の PNG
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'),
    })
    await page.getByRole('button', { name: '保存' }).click()
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toBeVisible()
    await expect(page).toHaveURL(/\/settings\/profile$/)
    void timeline
  })

  test('存在しないユーザーでは「ユーザーが見つかりません」を表示する', async ({ page, timeline }) => {
    await page.goto('/users/no_such_user_e2e')
    await expect(page.getByText('ユーザーが見つかりません')).toBeVisible()
    await page.goto('/users/no_such_user_e2e/followers')
    await expect(page.getByText('ユーザーが見つかりません')).toBeVisible()
    void timeline
  })
})
