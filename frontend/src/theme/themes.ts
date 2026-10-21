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

export const DEFAULT_THEME: ThemeName = 'ios'
export const THEME_STORAGE_KEY = 'calculator.theme'

export function isThemeName(value: unknown): value is ThemeName {
  return (
    typeof value === 'string' && (THEMES as readonly string[]).includes(value)
  )
}

/** The stored choice, or the default when storage is empty, invalid or unavailable. */
export function readStoredTheme(): ThemeName {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return isThemeName(stored) ? stored : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
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
