import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { clipped, dialog, display, key, open, press } from './helpers'

/** The keypad and the fixed controls as the browser laid them out. */
const layoutReport = (page: Page) =>
  page.evaluate(() => {
    const rect = (element: Element) => element.getBoundingClientRect()
    const overlaps = (a: DOMRect, b: DOMRect) =>
      a.left < b.right &&
      b.left < a.right &&
      a.top < b.bottom &&
      b.top < a.bottom
    const inside = (box: DOMRect) =>
      box.top >= -0.5 &&
      box.left >= -0.5 &&
      box.bottom <= innerHeight + 0.5 &&
      box.right <= innerWidth + 0.5
    const fixed = ['.theme-picker', '.source-link'].map((selector) =>
      rect(document.querySelector(selector) as Element),
    )
    const keys = [...document.querySelectorAll('.key')].map((element) => ({
      name: element.getAttribute('aria-label'),
      box: rect(element),
    }))
    return {
      overflow: {
        x: document.documentElement.scrollWidth > innerWidth,
        y: document.documentElement.scrollHeight > innerHeight,
      },
      offScreen: keys.filter(({ box }) => !inside(box)).map(({ name }) => name),
      covered: keys
        .filter(({ box }) => fixed.some((control) => overlaps(box, control)))
        .map(({ name }) => name),
      smallestKey: Math.min(
        ...keys.map(({ box }) => Math.min(box.width, box.height)),
      ),
    }
  })

/**
 * No scrolling, every key inside the viewport and at least 44px on each
 * side, nothing fixed over a key, the two longest texts whole, and the
 * history dropdown inside the viewport.
 */
async function expectLayoutToFit(page: Page) {
  const report = await layoutReport(page)
  expect(report).toMatchObject({
    overflow: { x: false, y: false },
    offScreen: [],
    covered: [],
  })
  expect(report.smallestKey).toBeGreaterThanOrEqual(44)

  await page.keyboard.type('123456789012345')
  await expect(display(page)).toHaveText('123456789012345')
  expect(await clipped(page)).toBe(false)
  await press(page, 'All clear', '1', 'Divide', '3', 'Equals')
  await expect(display(page)).toHaveText('0.333333333333')
  expect(await clipped(page)).toBe(false)

  await key(page, 'History').click()
  await expect(dialog(page)).toBeVisible()
  const box = await dialog(page).boundingBox()
  const viewport = page.viewportSize()
  expect(box).not.toBeNull()
  expect(viewport).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width)
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height)
  await page.keyboard.press('Escape')
}

test.beforeEach(({ page }) => open(page))

test('every key is on screen, tappable and uncovered, and the longest texts fit', async ({
  page,
}) => {
  await expectLayoutToFit(page)
})

test('414×568 passes the same checks', async ({ page }) => {
  test.skip(
    test.info().project.name !== 'Desktop Chrome',
    'sets its own viewport',
  )
  await page.setViewportSize({ width: 414, height: 568 })
  await expectLayoutToFit(page)
})

test('375×667 keeps its round keys', async ({ page }) => {
  test.skip(
    test.info().project.name !== 'Desktop Chrome',
    'sets its own viewport',
  )
  await page.setViewportSize({ width: 375, height: 667 })
  const seven = await key(page, '7').boundingBox()
  expect(seven).not.toBeNull()
  expect(Math.round(seven!.width)).toBe(Math.round(seven!.height))
  expect(Math.round(seven!.width)).toBeGreaterThan(60)
})
