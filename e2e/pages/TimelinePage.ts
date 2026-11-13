import { expect, type Locator, type Page } from '@playwright/test'

/** タイムライン(S-03)。 */
export class TimelinePage {
  constructor(readonly page: Page) {}

  get bodyInput() {
    return this.page.getByPlaceholder('いまどうしてる?')
  }

  get submitButton() {
    return this.page.getByRole('button', { name: '投稿する' })
  }

  get counter() {
    return this.page.getByText(/^残り -?\d+ 文字$/).first()
  }

  tab(name: 'フォロー中' | '全体') {
    return this.page.getByRole('tab', { name })
  }

  /** 本文に text を含む投稿カード。 */
  card(text: string | RegExp): Locator {
    return this.page.getByRole('article').filter({ hasText: text })
  }

  /**
   * 表示中のタブで、text を含む投稿カードが見つかるまで、続きを読み込みながら探す。
   * 「全体」タブは並列で動く他のテストの投稿も流れてくるので、最新の 20 件に入っているとは限らない。
   */
  async findCard(text: string | RegExp): Promise<Locator> {
    const card = this.card(text)
    await expect(async () => {
      if (await card.count()) return
      await this.cards.last().scrollIntoViewIfNeeded()
      await expect(card).toBeVisible({ timeout: 1500 })
    }).toPass({ timeout: 20_000 })
    await expect(card).toBeVisible()
    return card
  }

  get cards() {
    return this.page.getByRole('article')
  }

  likeButton(card: Locator) {
    return card.getByRole('button', { name: /^いいね/ })
  }

  async goto() {
    await this.page.goto('/')
    await expect(this.bodyInput).toBeVisible()
  }

  async post(body: string) {
    await this.bodyInput.fill(body)
    await this.submitButton.click()
  }

  async selectTab(name: 'フォロー中' | '全体') {
    await this.tab(name).click()
    await expect(this.tab(name)).toHaveAttribute('aria-selected', 'true')
  }
}
