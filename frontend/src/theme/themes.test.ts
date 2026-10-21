import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  THEMES,
  THEME_STORAGE_KEY,
  isThemeName,
  readStoredTheme,
} from './themes'

describe('readStoredTheme', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('picks a random theme on a first visit and stores it, so a reload keeps it', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const first = readStoredTheme()
    expect(isThemeName(first)).toBe(true)
    expect(first).toBe(THEMES[Math.floor(0.5 * THEMES.length)])
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(first)

    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    expect(readStoredTheme()).toBe(first)
  })

  it('covers every theme across the random range', () => {
    const picks = new Set<string>()
    for (const r of [0, 0.2, 0.4, 0.6, 0.8, 0.999]) {
      localStorage.clear()
      vi.spyOn(Math, 'random').mockReturnValue(r)
      picks.add(readStoredTheme())
    }
    expect([...picks].sort()).toEqual([...THEMES].sort())
  })

  it('keeps a stored choice and replaces an invalid one', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'netflix')
    expect(readStoredTheme()).toBe('netflix')
    localStorage.setItem(THEME_STORAGE_KEY, 'solarized')
    const replaced = readStoredTheme()
    expect(isThemeName(replaced)).toBe(true)
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(replaced)
  })
})
