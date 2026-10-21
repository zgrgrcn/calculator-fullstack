import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { ThemePicker } from './ThemePicker'
import { THEME_STORAGE_KEY } from './themes'

describe('ThemePicker', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
  })

  it('sets the theme attribute from a swatch and keeps the choice across a reload', async () => {
    const user = userEvent.setup()
    // A stored choice is honoured; a first visit without one is random (see themes.test.ts).
    localStorage.setItem(THEME_STORAGE_KEY, 'ios')
    const firstLoad = render(<ThemePicker />)
    expect(document.documentElement.dataset.theme).toBe('ios')
    expect(screen.getByRole('radio', { name: 'iOS' })).toHaveAttribute(
      'aria-checked',
      'true',
    )

    await user.click(screen.getByRole('radio', { name: 'Netflix' }))
    expect(document.documentElement.dataset.theme).toBe('netflix')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('netflix')
    expect(screen.getByRole('radio', { name: 'Netflix' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('radio', { name: 'iOS' })).toHaveAttribute(
      'aria-checked',
      'false',
    )

    // A reload starts from a bare document with only localStorage intact.
    firstLoad.unmount()
    delete document.documentElement.dataset.theme
    render(<ThemePicker />)
    expect(screen.getByRole('radio', { name: 'Netflix' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(document.documentElement.dataset.theme).toBe('netflix')
  })
})
