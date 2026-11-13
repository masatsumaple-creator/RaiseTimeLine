import { Api, expect, openAs, test } from '../fixtures'
import { uniq } from '../fixtures/data'

test.describe('タイムライン・投稿', () => {
  test('投稿すると一覧の先頭に表示され、入力欄が空になる', async ({ timeline, me }) => {
    await timeline.post('はじめての投稿です')

    await expect(timeline.cards.first()).toContainText('はじめての投稿です')
    await expect(timeline.cards.first()).toContainText(me.user.displayName)
    await expect(timeline.bodyInput).toHaveValue('')
  })

  test('残り文字数が表示され、280文字を超えると投稿できない', async ({ timeline }) => {
    await expect(timeline.submitButton).toBeDisabled() // 空
    await timeline.bodyInput.fill('あ'.repeat(280))
    await expect(timeline.counter).toHaveText('残り 0 文字')
    await expect(timeline.submitButton).toBeEnabled()

    await timeline.bodyInput.fill('あ'.repeat(281))
    await expect(timeline.counter).toHaveText('残り -1 文字')
    await expect(timeline.submitButton).toBeDisabled()
  })

  test('空白だけの投稿はできない', async ({ timeline }) => {
    await timeline.bodyInput.fill('     ')
    await expect(timeline.submitButton).toBeDisabled()
  })

  test('自分の投稿を編集すると「編集済み」が付く', async ({ timeline }) => {
    await timeline.post('編集前の本文')
    await expect(timeline.card('編集前の本文')).toBeVisible()
    // 編集中は本文が textarea に移り、本文での絞り込みが外れるので、先頭のカードで掴む
    const card = timeline.cards.first()
    await card.getByRole('button', { name: '編集' }).click()
    await card.getByLabel('投稿を編集').fill('編集後の本文')
    await card.getByRole('button', { name: '保存' }).click()

    await expect(timeline.card('編集後の本文')).toContainText('(編集済み)')
    await expect(timeline.card('編集前の本文')).toHaveCount(0)
  })

  test('編集をキャンセルすると元の本文のまま', async ({ timeline }) => {
    await timeline.post('そのままの本文')
    await expect(timeline.card('そのままの本文')).toBeVisible()
    const card = timeline.cards.first()
    await card.getByRole('button', { name: '編集' }).click()
    await card.getByLabel('投稿を編集').fill('変えるつもりの本文')
    await card.getByRole('button', { name: 'キャンセル' }).click()

    await expect(timeline.card('そのままの本文')).toBeVisible()
    await expect(timeline.card('変えるつもりの本文')).toHaveCount(0)
  })

  test('自分の投稿を削除できる(確認ダイアログ)', async ({ page, timeline }) => {
    await timeline.post('消す投稿')
    const card = timeline.card('消す投稿')

    // キャンセルすると消えない
    page.once('dialog', (d) => d.dismiss())
    await card.getByRole('button', { name: '削除' }).click()
    await expect(card).toBeVisible()

    page.once('dialog', (d) => {
      expect(d.message()).toBe('この投稿を削除しますか?')
      void d.accept()
    })
    await card.getByRole('button', { name: '削除' }).click()
    await expect(card).toHaveCount(0)
    await expect(page.getByText('投稿を削除しました')).toBeVisible()
  })

  test('他人の投稿には編集・削除ボタンが出ない', async ({ page, timeline, me }) => {
    const other = await Api.signup('other')
    const text = uniq('他人の投稿')
    await other.post(text)
    await timeline.selectTab('全体')

    const card = await timeline.findCard(text)
    await expect(card.getByRole('button', { name: '編集' })).toHaveCount(0)
    await expect(card.getByRole('button', { name: '削除' })).toHaveCount(0)
    void page
    void me
    await other.dispose()
  })

  test('「フォロー中」は自分とフォロー先の投稿、「全体」は全員の投稿を表示する', async ({ timeline, me }) => {
    const followed = await Api.signup('followed')
    const stranger = await Api.signup('stranger')
    await me.follow(followed.user.handle)
    const mine = uniq('自分の投稿')
    const fromFollowed = uniq('フォロー先の投稿')
    const fromStranger = uniq('他人の投稿')
    await me.post(mine)
    await followed.post(fromFollowed)
    await stranger.post(fromStranger)

    await timeline.goto()
    await expect(timeline.tab('フォロー中')).toHaveAttribute('aria-selected', 'true')
    await expect(timeline.card(mine)).toBeVisible()
    await expect(timeline.card(fromFollowed)).toBeVisible()
    await expect(timeline.card(fromStranger)).toHaveCount(0)

    await timeline.selectTab('全体')
    await timeline.findCard(fromStranger)
    await timeline.findCard(fromFollowed)
    await followed.dispose()
    await stranger.dispose()
  })

  test('投稿が無いときは案内を表示する', async ({ page, timeline }) => {
    await expect(page.getByText('まだ投稿がありません。投稿するか、気になるユーザーをフォローしましょう。')).toBeVisible()
    await page.getByRole('link', { name: 'ユーザーを検索' }).click()
    await expect(page).toHaveURL(/\/search/)
    void timeline
  })

  test('スクロールすると続きが自動で読み込まれる(無限スクロール)', async ({ page, me }) => {
    await me.postMany(45)
    const { context, page: p } = await openAs(page.context().browser()!, me)

    await expect(p.getByRole('article')).toHaveCount(20) // 1ページ目
    await p.getByRole('article').last().scrollIntoViewIfNeeded()
    await expect(p.getByRole('article')).toHaveCount(40)
    await p.getByRole('article').last().scrollIntoViewIfNeeded()
    await expect(p.getByRole('article')).toHaveCount(45)
    await expect(p.getByText('投稿 1', { exact: true })).toBeVisible() // 最古まで到達
    await context.close()
  })

  test('他のユーザーの新着投稿が「N件の新しい投稿を表示」で反映される', async ({ page, timeline, me }) => {
    await timeline.selectTab('全体')
    const other = await Api.signup('poster')
    const fresh = uniq('新着その3')
    await other.post('新着その1')
    await other.post('新着その2')

    // 30秒間隔のポーリング。時計を進めて待ち時間を短縮する
    await page.clock.install()
    await page.reload()
    await expect(timeline.bodyInput).toBeVisible()
    await timeline.selectTab('全体')
    await page.clock.fastForward(31_000)
    await other.post(fresh)
    await page.clock.fastForward(31_000)

    const bar = page.getByRole('button', { name: /件の新しい投稿を表示$/ })
    await expect(bar).toBeVisible()
    await bar.click()
    await timeline.findCard(fresh)
    await expect(bar).toHaveCount(0)
    void me
    await other.dispose()
  })
})
