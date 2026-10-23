import { expect, test } from './fixtures'
import { dialog, display, key, open, press, theme } from './helpers'

test.beforeEach(({ page }) => open(page))

test('a result survives a reload and starts a new expression when chosen', async ({
  page,
}) => {
  await press(page, '7', 'Multiply', '6', 'Equals')
  await expect(display(page)).toHaveText('42')
  await page.reload()
  await expect(display(page)).toHaveText('0')
  await key(page, 'History').click()
  await dialog(page).getByRole('button', { name: '7 × 6 = 42' }).click()
  await expect(dialog(page)).toBeHidden()
  await expect(display(page)).toHaveText('42')
  await press(page, 'Add', '1', 'Equals')
  await expect(display(page)).toHaveText('43')
})

test('two tabs both keep their results', async ({ page, context }) => {
  const other = await context.newPage()
  await open(other)
  await press(page, '1', 'Add', '1', 'Equals')
  await expect(display(page)).toHaveText('2')
  await press(other, '2', 'Add', '2', 'Equals')
  await expect(display(other)).toHaveText('4')

  const entries = ['2 + 2 = 4', '1 + 1 = 2']
  await key(other, 'History').click()
  await expect(dialog(other).locator('.history-entry')).toHaveText(entries)
  await key(page, 'History').click()
  await expect(dialog(page).locator('.history-entry')).toHaveText(entries)
})

test('Tab then Enter opens the history', async ({ page }) => {
  await page.keyboard.press('Tab')
  await expect(key(page, 'History')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(dialog(page)).toBeVisible()
})

test('the chosen theme survives a reload', async ({ page }) => {
  expect(await theme(page)).toBe('ios')
  await page.getByRole('radio', { name: 'Netflix' }).click()
  expect(await theme(page)).toBe('netflix')
  await page.reload()
  await expect(display(page)).toHaveText('0')
  expect(await theme(page)).toBe('netflix')
})
