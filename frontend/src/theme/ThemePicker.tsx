import { THEMES, THEME_LABELS, isThemeName } from './themes'
import { useTheme } from './useTheme'

/** Lists the themes by name; the look itself is entirely in CSS. */
export function ThemePicker() {
  const { theme, setTheme } = useTheme()
  return (
    <label className="theme-picker">
      <span>Theme</span>
      <select
        value={theme}
        onChange={(event) => {
          if (isThemeName(event.target.value)) setTheme(event.target.value)
        }}
      >
        {THEMES.map((name) => (
          <option key={name} value={name}>
            {THEME_LABELS[name]}
          </option>
        ))}
      </select>
    </label>
  )
}
