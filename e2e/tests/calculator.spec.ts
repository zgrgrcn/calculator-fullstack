import { expect, test } from './fixtures'
import {
  dialog,
  display,
  displayFit,
  expression,
  key,
  open,
  press,
  theme,
} from './helpers'

test.beforeEach(({ page }) => open(page))

test('12 + 3 = 15', async ({ page }) => {
  await press(page, '1', '2', 'Add', '3', 'Equals')
  await expect(display(page)).toHaveText('15')
  await expect(expression(page)).toHaveText('12 + 3 =')
})

test('2 + 3 × 4 = 14, multiplication first', async ({ page }) => {
  await press(page, '2', 'Add', '3', 'Multiply', '4', 'Equals')
  await expect(display(page)).toHaveText('14')
})

test('√, xʸ and % are postfix keys', async ({ page }) => {
  await press(page, '9', 'Square root')
  await expect(display(page)).toHaveText('√(9)')
  await press(page, 'Equals')
  await expect(display(page)).toHaveText('3')
  await expect(expression(page)).toHaveText('√(9) =')
  await press(page, 'All clear', '2', 'Power', '1', '0', 'Equals')
  await expect(display(page)).toHaveText('1024')
  await press(page, 'All clear', '5', '0', 'Percent', 'Equals')
  await expect(display(page)).toHaveText('0.5')
})

test('2 ^ 3 ^ 2 = 512, power binds to the right', async ({ page }) => {
  await press(page, '2', 'Power', '3', 'Power', '2', 'Equals')
  await expect(display(page)).toHaveText('512')
})

test('196 % × 5 = 9.8', async ({ page }) => {
  await press(page, '1', '9', '6', 'Percent', 'Multiply', '5', 'Equals')
  await expect(display(page)).toHaveText('9.8')
  await expect(expression(page)).toHaveText('196% × 5 =')
})

test('the square root of a negative number is an error from the backend', async ({
  page,
}) => {
  await press(page, '9', 'Negate', 'Square root', 'Equals')
  await expect(display(page)).toHaveAttribute('data-error', 'true')
  await expect(display(page)).toHaveText(
    'Invalid operand: square root of a negative number',
  )
  await expect(expression(page)).toHaveText('√(-9)')
})

test('10 ^ 400 is an error, not Infinity', async ({ page }) => {
  await press(page, '1', '0', 'Power', '4', '0', '0', 'Equals')
  await expect(display(page)).toHaveAttribute('data-error', 'true')
  await expect(display(page)).toHaveText('Result is not a finite number')
})

test('the next operator continues from the answer', async ({ page }) => {
  await press(page, '2', 'Add', '3', 'Equals')
  await expect(display(page)).toHaveText('5')
  await press(page, 'Add')
  await expect(display(page)).toHaveText('5 +')
  await expect(expression(page)).toHaveText('Ans = 5')
  await press(page, '1', 'Equals')
  await expect(display(page)).toHaveText('6')
  await expect(expression(page)).toHaveText('5 + 1 =')
})

test('0.1 + 0.2 = 0.3 on the display', async ({ page }) => {
  await press(page, '0', 'Decimal point', '1', 'Add')
  await press(page, '0', 'Decimal point', '2', 'Equals')
  await expect(display(page)).toHaveText('0.3')
})

test('a long expression keeps its right end in view', async ({ page }) => {
  await page.keyboard.type('1+'.repeat(30) + '1')
  await expect(display(page)).toHaveText(/\+ 1$/)
  expect(await displayFit(page)).toEqual({
    clipped: true,
    startClipped: true,
    endVisible: true,
  })
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

test('Enter activates focused controls outside the keypad and still evaluates elsewhere', async ({
  page,
}) => {
  const next = (await theme(page)) === 'netflix' ? 'Spotify' : 'Netflix'
  await page.getByRole('radio', { name: next }).focus()
  await page.keyboard.press('Enter')
  expect(await theme(page)).toBe(next.toLowerCase())

  // The history button opens the dropdown, whose × takes focus; Enter closes it.
  await key(page, 'History').focus()
  await page.keyboard.press('Enter')
  await expect(dialog(page)).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(dialog(page)).toBeHidden()

  // With nothing focused, Enter evaluates.
  await page.keyboard.type('2+2')
  await page.keyboard.press('Enter')
  await expect(display(page)).toHaveText('4')

  // Inside the dropdown, Enter on Clear clears.
  await key(page, 'History').focus()
  await page.keyboard.press('Enter')
  await expect(
    dialog(page).getByRole('button', { name: '2 + 2 = 4' }),
  ).toBeVisible()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Enter')
  await expect(dialog(page).getByText('No calculations yet')).toBeVisible()
})

test('reduced motion plays nothing', async ({ page }) => {
  const cssAnimations = () =>
    page.evaluate(() =>
      document
        .getAnimations()
        .filter((animation) => animation instanceof CSSAnimation)
        .map((animation) => (animation as CSSAnimation).animationName),
    )
  // Without the preference the key press animates, so the check below means something.
  await key(page, '7').click()
  expect(await cssAnimations()).toEqual([
    expect.stringMatching(/^key-press-[ab]$/),
  ])

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await press(page, 'All clear', '7', 'Add', '1', 'Equals')
  await expect(display(page)).toHaveText('8')
  expect(await cssAnimations()).toEqual([])
  for (const element of [key(page, '7'), expression(page), display(page)])
    expect(
      await element.evaluate((el) => getComputedStyle(el).animationName),
    ).toBe('none')
})
