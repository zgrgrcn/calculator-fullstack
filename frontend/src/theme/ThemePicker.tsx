import { THEMES, THEME_LABELS } from './themes'
import { useTheme } from './useTheme'

/**
 * One round swatch per theme, fixed in the bottom-right corner. The swatch
 * colours and the active ring live in CSS, keyed on data-swatch and
 * aria-checked.
 */
export function ThemePicker() {
  const { theme, setTheme } = useTheme()
  return (
    <div className="theme-picker" role="radiogroup" aria-label="Theme">
      {THEMES.map((name) => (
        <button
          key={name}
          type="button"
          role="radio"
          className="swatch"
          data-swatch={name}
          aria-checked={theme === name}
          aria-label={THEME_LABELS[name]}
          title={THEME_LABELS[name]}
          onClick={() => setTheme(name)}
        />
      ))}
    </div>
  )
}
