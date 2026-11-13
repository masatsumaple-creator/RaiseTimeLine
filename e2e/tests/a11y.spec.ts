import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { Api, expect, test } from '../fixtures'

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function expectNoViolations(page: Page, name: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length}件 例) ${v.nodes[0]?.target.join(' ')}`)
  expect(summary, `${name} のアクセシビリティ違反`).toEqual([])
}

test.describe('アクセシビリティ(axe-core: WCAG 2.0/2.1 A・AA)', () => {
  test('ログイン・新規登録', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'ログイン' })).toBeVisible()
    await expectNoViolations(page, 'ログイン')

    // エラー表示中の状態も検査する
    await page.getByRole('button', { name: 'ログイン', exact: true }).click()
    await expect(page.getByText('パスワードを入力してください')).toBeVisible()
    await expectNoViolations(page, 'ログイン(エラー表示)')

    await page.goto('/signup')
    await expect(page.getByRole('heading', { name: '新規登録' })).toBeVisible()
    await expectNoViolations(page, '新規登録')
  })

  test('タイムライン・投稿詳細・検索・プロフィール・プロフィール編集・フォロー一覧', async ({ page, timeline, me }) => {
    const friend = await Api.signup('a11y')
    await me.follow(friend.user.handle)
    const post = await friend.post('アクセシビリティ確認用の投稿')
    await friend.comment(post.id, '確認用のコメント')
    await me.post('自分の投稿')

    await timeline.goto()
    await expect(timeline.card('アクセシビリティ確認用の投稿')).toBeVisible()
    await expectNoViolations(page, 'タイムライン')

    await page.goto(`/posts/${post.id}`)
    await expect(page.getByRole('region', { name: 'コメント' })).toContainText('確認用のコメント')
    await expectNoViolations(page, '投稿詳細')

    await page.goto(`/search?q=${encodeURIComponent(friend.user.handle)}`)
    await expect(page.getByRole('link', { name: friend.user.displayName, exact: true })).toBeVisible()
    await expectNoViolations(page, 'ユーザー検索')

    await page.goto(`/users/${friend.user.handle}`)
    await expect(page.getByRole('heading', { name: friend.user.displayName })).toBeVisible()
    await expectNoViolations(page, 'プロフィール')

    await page.goto('/settings/profile')
    await expect(page.getByRole('heading', { name: 'プロフィールを編集' })).toBeVisible()
    await expectNoViolations(page, 'プロフィール編集')

    await page.goto(`/users/${me.user.handle}/following`)
    await expect(page.getByRole('link', { name: friend.user.displayName, exact: true })).toBeVisible()
    await expectNoViolations(page, 'フォロー中一覧')

    await page.goto('/no-such-page')
    await expectNoViolations(page, 'NotFound')
    await friend.dispose()
  })

  test('キーボードだけで、投稿・いいね・タブ切替ができる', async ({ page, timeline, me }) => {
    await me.post('キーボード操作の対象')
    await timeline.goto()

    await timeline.bodyInput.focus()
    await page.keyboard.type('キーボードで投稿')
    await page.keyboard.press('Tab') // 画像を追加(ファイル入力)の次へ
    await timeline.submitButton.focus()
    await page.keyboard.press('Enter')
    await expect(timeline.card('キーボードで投稿')).toBeVisible()

    const like = timeline.likeButton(timeline.card('キーボード操作の対象'))
    await like.focus()
    await expect(like).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(like).toHaveAttribute('aria-pressed', 'true')

    await timeline.tab('全体').focus()
    await page.keyboard.press('Enter')
    await expect(timeline.tab('全体')).toHaveAttribute('aria-selected', 'true')
  })

  test('フォーカス中の要素は枠などで視認できる', async ({ page }) => {
    await page.goto('/login')
    const email = page.getByLabel('メールアドレス')
    await email.focus()
    const outline = await email.evaluate((el) => {
      const s = getComputedStyle(el)
      return { outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth, boxShadow: s.boxShadow, borderColor: s.borderColor }
    })
    const visible = outline.outlineStyle !== 'none' || outline.boxShadow !== 'none'
    expect(visible, `フォーカス表示が無い: ${JSON.stringify(outline)}`).toBe(true)
  })
})
