import { useEffect, useState } from 'react'
import { applyTheme, readStoredTheme, storeTheme } from './themes'
import type { ThemeName } from './themes'

export function useTheme() {
  const [theme, setTheme] = useState<ThemeName>(readStoredTheme)

  useEffect(() => {
    applyTheme(theme)
    storeTheme(theme)
  }, [theme])

  return { theme, setTheme }
}
