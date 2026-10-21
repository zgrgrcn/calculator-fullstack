export const THEMES = ['ios', 'netflix', 'spotify', 'vscode', 'claude'] as const
export type ThemeName = (typeof THEMES)[number]

/** Labels are the product names only; the looks live in index.css under [data-theme]. */
export const THEME_LABELS: Record<ThemeName, string> = {
  ios: 'iOS',
  netflix: 'Netflix',
  spotify: 'Spotify',
  vscode: 'VS Code',
  claude: 'Claude',
}

export const THEME_STORAGE_KEY = 'calculator.theme'

export function isThemeName(value: unknown): value is ThemeName {
  return (
    typeof value === 'string' && (THEMES as readonly string[]).includes(value)
  )
}

/**
 * The stored choice. On a first visit, when nothing valid is stored, one of
 * the five themes is picked at random and stored at once, so a reload keeps
 * it; a later pick by the user replaces it.
 */
export function readStoredTheme(): ThemeName {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (isThemeName(stored)) return stored
  } catch {
    // Storage unavailable: fall through to a random theme for this page.
  }
  const theme = randomTheme()
  storeTheme(theme)
  return theme
}

export function randomTheme(): ThemeName {
  return THEMES[Math.floor(Math.random() * THEMES.length)]
}

export function storeTheme(theme: ThemeName): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Storage unavailable (private mode, blocked): the choice lasts for this page only.
  }
}

/** Themes are selected by one attribute on the document; CSS does the rest. */
export function applyTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme
}
