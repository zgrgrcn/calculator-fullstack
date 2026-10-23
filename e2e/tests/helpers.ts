import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

export const key = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true })
export const display = (page: Page) => page.getByRole('status')
export const expression = (page: Page) => page.getByTestId('expression')
export const dialog = (page: Page) =>
  page.getByRole('dialog', { name: 'History' })
export const theme = (page: Page) =>
  page.evaluate(() => document.documentElement.dataset.theme)

export async function open(page: Page) {
  await page.goto('/')
  await expect(display(page)).toHaveText('0')
}

export async function press(page: Page, ...names: string[]) {
  for (const name of names) await key(page, name).click()
}

/** How the main line's text sits in the line that clips it. */
export const displayFit = (page: Page) =>
  display(page)
    .locator('.line-text')
    .evaluate((line) => {
      const text = line.querySelector('bdi') as Element
      const box = text.getBoundingClientRect()
      const frame = line.getBoundingClientRect()
      return {
        clipped: box.width > frame.width,
        startClipped: box.left < frame.left - 0.5,
        endVisible: box.right <= frame.right + 0.5,
      }
    })

/** True when the display's text is wider than the line that clips it. */
export const clipped = async (page: Page) => (await displayFit(page)).clipped
