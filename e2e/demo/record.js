// Records the README's media against a running compose stack:
//   docs/media/demo.gif    2 + 3 × 4 =, ÷ 7 =, the history, two other themes
//                          (Desktop Chrome, 640px wide, about 11 seconds, 10 fps)
//   docs/media/themes.png  the five themes side by side at 375×667 showing 1 ÷ 3 =
// Usage: node demo/record.js [baseURL]   (from e2e/; needs ffmpeg on PATH)
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const baseURL =
  process.argv[2] ?? process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')
const media = join(root, 'docs', 'media')
const work = mkdtempSync(join(tmpdir(), 'calculator-demo-'))
mkdirSync(media, { recursive: true })

const THEMES = ['ios', 'netflix', 'spotify', 'vscode', 'claude']
const GIF_BUDGET = 2 * 1024 * 1024
const PNG_BUDGET = 500 * 1024

const pause = (ms) => new Promise((done) => setTimeout(done, ms))
const key = (page, name) => page.getByRole('button', { name, exact: true })

/** Every context starts with a known theme and an empty history. */
const prepare = (context, theme) =>
  context.addInitScript((stored) => {
    localStorage.setItem('calculator.theme', stored)
    localStorage.removeItem('calculator.history')
  }, theme)

async function tap(page, ...names) {
  for (const name of names) {
    await key(page, name).click()
    await pause(350)
  }
}

async function recordDemo(browser) {
  const size = { width: 640, height: 720 }
  const context = await browser.newContext({
    viewport: size,
    deviceScaleFactor: 1,
    recordVideo: { dir: work, size },
  })
  await prepare(context, 'ios')
  const page = await context.newPage()
  await page.goto(baseURL)
  await page.getByRole('status').filter({ hasText: /^0$/ }).waitFor()
  await pause(600)
  await tap(page, '2', 'Add', '3', 'Multiply', '4', 'Equals')
  await pause(1000)
  await tap(page, 'Divide', '7', 'Equals')
  await pause(1000)
  await key(page, 'History').click()
  await pause(1400)
  await page.keyboard.press('Escape')
  await pause(500)
  await page.getByRole('radio', { name: 'Netflix' }).click()
  await pause(1100)
  await page.getByRole('radio', { name: 'Claude' }).click()
  await pause(1200)
  const video = page.video()
  await context.close()
  return video.path()
}

/** Two ffmpeg passes: a palette from the frame differences, then the GIF. */
function toGif(webm) {
  const out = join(media, 'demo.gif')
  const palette = join(work, 'palette.png')
  const frames = 'fps=10,scale=640:-1:flags=lanczos'
  const skipBlankStart = ['-ss', '0.4']
  execFileSync(
    'ffmpeg',
    [
      '-y',
      ...skipBlankStart,
      '-i',
      webm,
      '-vf',
      `${frames},palettegen=stats_mode=diff`,
      palette,
    ],
    { stdio: 'inherit' },
  )
  execFileSync(
    'ffmpeg',
    [
      '-y',
      ...skipBlankStart,
      '-i',
      webm,
      '-i',
      palette,
      '-lavfi',
      `${frames}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
      '-loop',
      '0',
      out,
    ],
    { stdio: 'inherit' },
  )
  return out
}

async function themesSideBySide(browser) {
  const shots = []
  for (const theme of THEMES) {
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
      deviceScaleFactor: 1,
    })
    await prepare(context, theme)
    const page = await context.newPage()
    await page.goto(baseURL)
    await tap(page, '1', 'Divide', '3', 'Equals')
    await page
      .getByRole('status')
      .filter({ hasText: '0.333333333333' })
      .waitFor()
    await pause(400)
    const file = join(work, `${theme}.png`)
    await page.screenshot({ path: file })
    shots.push(file)
    await context.close()
  }
  const out = join(media, 'themes.png')
  const inputs = shots.flatMap((file) => ['-i', file])
  const stack = `${shots.map((_, i) => `[${i}:v]`).join('')}hstack=inputs=${shots.length}`
  execFileSync(
    'ffmpeg',
    ['-y', ...inputs, '-filter_complex', stack, '-compression_level', '9', out],
    { stdio: 'inherit' },
  )
  return out
}

const browser = await chromium.launch()
try {
  const gif = toGif(await recordDemo(browser))
  const png = await themesSideBySide(browser)
  for (const [file, budget] of [
    [gif, GIF_BUDGET],
    [png, PNG_BUDGET],
  ]) {
    const bytes = statSync(file).size
    console.log(`${file}: ${Math.round(bytes / 1024)} KB`)
    if (bytes > budget) {
      console.error(`${file} is over its budget of ${budget / 1024} KB`)
      process.exitCode = 1
    }
  }
} finally {
  await browser.close()
  rmSync(work, { recursive: true, force: true })
}
