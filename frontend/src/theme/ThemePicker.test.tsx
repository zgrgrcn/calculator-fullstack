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

  it('sets the theme attribute and keeps the choice across a reload', async () => {
    const user = userEvent.setup()
    const firstLoad = render(<ThemePicker />)
    expect(document.documentElement.dataset.theme).toBe('ios')

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Theme' }),
      'netflix',
    )
    expect(document.documentElement.dataset.theme).toBe('netflix')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('netflix')

    // A reload starts from a bare document with only localStorage intact.
    firstLoad.unmount()
    delete document.documentElement.dataset.theme
    render(<ThemePicker />)
    expect(screen.getByRole('combobox', { name: 'Theme' })).toHaveValue(
      'netflix',
    )
    expect(document.documentElement.dataset.theme).toBe('netflix')
  })
})
