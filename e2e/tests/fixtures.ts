import { test as base } from '@playwright/test'

/**
 * A first visit picks a theme at random, which would make fonts and widths
 * differ between runs. Every context starts with iOS stored instead; a theme a
 * test chooses afterwards is kept, as "the chosen theme survives a reload"
 * relies on.
 */
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript(() => {
      if (!localStorage.getItem('calculator.theme'))
        localStorage.setItem('calculator.theme', 'ios')
    })
    await use(context)
  },
})

export { expect } from '@playwright/test'
