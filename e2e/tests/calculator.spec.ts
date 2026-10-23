import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const key = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true })
const display = (page: Page) => page.getByRole('status')
/** True when the display's text is wider than the line that clips it. */
const clipped = (page: Page) =>
  display(page)
    .locator('.line-text')
    .evaluate((line) => {
      const text = line.querySelector('bdi')
      return (
        text !== null &&
        text.getBoundingClientRect().width > line.getBoundingClientRect().width
      )
    })

async function press(page: Page, ...names: string[]) {
  for (const name of names) await key(page, name).click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(display(page)).toHaveText('0')
})

test('12 + 3 = 15', async ({ page }) => {
  await press(page, '1', '2', 'Add', '3', 'Equals')
  await expect(display(page)).toHaveText('15')
  await expect(page.getByTestId('expression')).toHaveText('12 + 3 =')
})

test('2 + 3 × 4 = 14, multiplication first', async ({ page }) => {
  await press(page, '2', 'Add', '3', 'Multiply', '4', 'Equals')
  await expect(display(page)).toHaveText('14')
})

test('dividing by zero shows the error and AC recovers', async ({ page }) => {
  await press(page, '1', 'Divide', '0', 'Equals')
  await expect(display(page)).toHaveText('Cannot divide by zero')
  await press(page, 'All clear')
  await expect(display(page)).toHaveText('0')
})

test('typing 2+2= on the keyboard', async ({ page }) => {
  await page.keyboard.type('2+2=')
  await expect(display(page)).toHaveText('4')
})

// The main line is sized by measuring, not by counting characters, so the
// whole result stays visible on the narrowest supported phone.
test('1 ÷ 3 shows the whole result on a 320px phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await press(page, '1', 'Divide', '3', 'Equals')
  await expect(display(page)).toHaveText('0.333333333333')
  expect(await clipped(page)).toBe(false)
})

test('fifteen typed digits stay whole on a 320px phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.keyboard.type('123456789012345')
  await expect(display(page)).toHaveText('123456789012345')
  expect(await clipped(page)).toBe(false)
})

test('the division error stays whole on a 320px phone in the monospace theme', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.evaluate(() => localStorage.setItem('calculator.theme', 'vscode'))
  await page.reload()
  await press(page, '1', 'Divide', '0', 'Equals')
  await expect(display(page)).toHaveText('Cannot divide by zero')
  expect(await clipped(page)).toBe(false)
})

// Below the 375×667 baseline the keys shorten into pills, and on a phone held
// sideways the display sits beside the keypad, so every key is on screen
// without scrolling and the fixed swatches and GitHub mark never cover one.
const SHORT_VIEWPORTS = [
  [320, 568],
  [414, 568],
  [667, 375],
] as const

for (const [width, height] of SHORT_VIEWPORTS) {
  test(`every key is on screen and clear of the fixed controls at ${width}×${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    const layout = await page.evaluate(() => {
      const rect = (element: Element) => element.getBoundingClientRect()
      const overlaps = (a: DOMRect, b: DOMRect) =>
        a.left < b.right &&
        b.left < a.right &&
        a.top < b.bottom &&
        b.top < a.bottom
      const picker = rect(document.querySelector('.theme-picker') as Element)
      const link = rect(document.querySelector('.source-link') as Element)
      const keys = [...document.querySelectorAll('.key')].map((key) => ({
        name: key.getAttribute('aria-label'),
        box: rect(key),
      }))
      return {
        scrolls: document.documentElement.scrollHeight > innerHeight,
        offScreen: keys
          .filter(
            ({ box }) =>
              box.top < 0 ||
              box.left < 0 ||
              box.bottom > innerHeight ||
              box.right > innerWidth,
          )
          .map((key) => key.name),
        covered: keys
          .filter(({ box }) => overlaps(box, picker) || overlaps(box, link))
          .map((key) => key.name),
      }
    })
    expect(layout).toEqual({ scrolls: false, offScreen: [], covered: [] })
    // A tap on the decimal key reaches the key, not a swatch.
    const theme = await page.evaluate(
      () => document.documentElement.dataset.theme,
    )
    await key(page, 'Decimal point').click()
    await expect(display(page)).toHaveText('0.')
    expect(
      await page.evaluate(() => document.documentElement.dataset.theme),
    ).toBe(theme)
  })
}

test('the 375×667 layout keeps its round keys', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  const seven = await key(page, '7').boundingBox()
  expect(seven).not.toBeNull()
  expect(Math.round(seven!.width)).toBe(Math.round(seven!.height))
  expect(Math.round(seven!.width)).toBeGreaterThan(60)
})

test('Enter activates focused controls outside the keypad and still evaluates elsewhere', async ({
  page,
}) => {
  const theme = () =>
    page.evaluate(() => document.documentElement.dataset.theme)
  const next = (await theme()) === 'netflix' ? 'Spotify' : 'Netflix'
  await page.getByRole('radio', { name: next }).focus()
  await page.keyboard.press('Enter')
  expect(await theme()).toBe(next.toLowerCase())

  // The history button opens the dropdown, whose × takes focus; Enter closes it.
  const dialog = page.getByRole('dialog', { name: 'History' })
  await key(page, 'History').focus()
  await page.keyboard.press('Enter')
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()

  // With nothing focused, Enter evaluates.
  await page.keyboard.type('2+2')
  await page.keyboard.press('Enter')
  await expect(display(page)).toHaveText('4')

  // Inside the dropdown, Enter on Clear clears.
  await key(page, 'History').focus()
  await page.keyboard.press('Enter')
  await expect(dialog.getByRole('button', { name: '2 + 2 = 4' })).toBeVisible()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Enter')
  await expect(dialog.getByText('No calculations yet')).toBeVisible()
})

test('reduced motion turns the key press animation off', async ({ page }) => {
  const animationOf = async () => {
    await key(page, '7').click()
    return key(page, '7').evaluate((k) => getComputedStyle(k).animationName)
  }
  expect(await animationOf()).toMatch(/^key-press-[ab]$/)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await animationOf()).toBe('none')
})

// Through the compose stack this goes via nginx, which must neither answer
// with its own HTML page nor name its version.
for (const megabytes of [1.1, 3]) {
  test(`a ${megabytes} MB body gets the JSON 413, with no server version`, async ({
    request,
  }) => {
    const padding = 'x'.repeat(Math.round(megabytes * 1024 * 1024))
    const response = await request.post('/api/v1/calculate', {
      headers: { 'Content-Type': 'application/json' },
      data: `{"operation":"add","operands":[1,2],"padding":"${padding}"}`,
    })
    expect(response.status()).toBe(413)
    expect(response.headers()['content-type']).toContain('application/json')
    expect(await response.json()).toEqual({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: expect.stringContaining('1048576'),
      },
    })
    expect(response.headers()['server'] ?? '').not.toMatch(/[0-9]/)
  })
}
