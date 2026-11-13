import { Api, expect, loginViaUi, test } from '../fixtures'
import { uniq } from '../fixtures/data'

test.describe('いいね・コメント', () => {
  test('いいねの付け外しで状態と件数が変わり、リロード後も保持される', async ({ page, timeline, me }) => {
    await me.post('いいねする投稿')
    await timeline.goto()
    const card = timeline.card('いいねする投稿')
    const like = timeline.likeButton(card)

    await expect(like).toHaveAttribute('aria-pressed', 'false')
    await expect(like).toHaveAccessibleName('いいね 0 件')

    await like.click()
    await expect(like).toHaveAttribute('aria-pressed', 'true')
    await expect(like).toHaveAccessibleName('いいね 1 件')

    await page.reload()
    await expect(timeline.likeButton(timeline.card('いいねする投稿'))).toHaveAttribute('aria-pressed', 'true')

    await timeline.likeButton(timeline.card('いいねする投稿')).click()
    await expect(timeline.likeButton(timeline.card('いいねする投稿'))).toHaveAccessibleName('いいね 0 件')
  })

  test('他のユーザーの投稿にもいいねでき、件数は人数分になる', async ({ timeline }) => {
    const author = await Api.signup('author')
    const text = uniq('みんなが押す投稿')
    const post = await author.post(text)
    const fan = await Api.signup('fan')
    await fan.raw('put', `/api/posts/${post.id}/like`)

    await timeline.selectTab('全体')
    const like = timeline.likeButton(await timeline.findCard(text))
    await expect(like).toHaveAccessibleName('いいね 1 件')
    await like.click()
    await expect(like).toHaveAccessibleName('いいね 2 件')
    await expect(like).toHaveAttribute('aria-pressed', 'true')
    await author.dispose()
    await fan.dispose()
  })

  test('投稿詳細でコメントを投稿・削除できる', async ({ page, timeline, me }) => {
    const post = await me.post('コメントを受ける投稿')
    await page.goto(`/posts/${post.id}`)
    await expect(page.getByRole('heading', { name: '投稿の詳細' })).toBeAttached()
    await expect(page.getByText('まだコメントがありません')).toBeVisible()

    await page.getByPlaceholder('コメントを書く').fill('最初のコメント')
    await page.getByRole('button', { name: 'コメントする' }).click()

    const comments = page.getByRole('region', { name: 'コメント' })
    await expect(comments).toContainText('最初のコメント')
    await expect(page.getByPlaceholder('コメントを書く')).toHaveValue('')
    await expect(page.getByLabel('コメント 1 件')).toBeVisible() // 件数が更新される

    page.once('dialog', (d) => void d.accept())
    await comments.getByRole('button', { name: '削除' }).click()
    await expect(comments).not.toContainText('最初のコメント')
    await expect(page.getByLabel('コメント 0 件')).toBeVisible()
    void timeline
  })

  test('コメントは空・281文字以上では送信できない', async ({ page, me }) => {
    const post = await me.post('検証用の投稿')
    await loginViaUi(page, me.user.email)
    await page.goto(`/posts/${post.id}`)

    const submit = page.getByRole('button', { name: 'コメントする' })
    await expect(submit).toBeDisabled()
    await page.getByPlaceholder('コメントを書く').fill('い'.repeat(281))
    await expect(submit).toBeDisabled()
    await page.getByPlaceholder('コメントを書く').fill('い'.repeat(280))
    await expect(submit).toBeEnabled()
  })

  test('他人のコメントには削除ボタンが出ない', async ({ page, timeline, me }) => {
    const post = await me.post('自分の投稿')
    const other = await Api.signup('commenter')
    await other.comment(post.id, '他人のコメント')

    await page.goto(`/posts/${post.id}`)
    const comments = page.getByRole('region', { name: 'コメント' })
    await expect(comments).toContainText('他人のコメント')
    await expect(comments.getByRole('button', { name: '削除' })).toHaveCount(0)
    void timeline
    await other.dispose()
  })

  test('投稿カードをクリックすると詳細へ、💬 からはコメント欄にフォーカスして開く', async ({ page, timeline, me }) => {
    const post = await me.post('詳細へ行く投稿')
    await timeline.goto()

    await timeline.card('詳細へ行く投稿').getByRole('link', { name: /コメントする$/ }).click()
    await expect(page).toHaveURL(new RegExp(`/posts/${post.id}\\?focus=1`))
    await expect(page.getByPlaceholder('コメントを書く')).toBeFocused()

    await page.goBack()
    await timeline.card('詳細へ行く投稿').getByText('詳細へ行く投稿').click()
    await expect(page).toHaveURL(new RegExp(`/posts/${post.id}$`))
  })

  test('存在しない投稿の詳細では「投稿が見つかりません」を表示する', async ({ page, timeline }) => {
    await page.goto('/posts/999999999')
    await expect(page.getByText('投稿が見つかりません')).toBeVisible()
    void timeline
  })
})
