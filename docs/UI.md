# Interface, themes and end-to-end scenarios

The detail behind three short summaries in the [README](../README.md): how the
interface behaves, what each theme references, and what the Playwright suite
covers. Moved here on 2026-10-23 so the README reads in ten minutes.

## Interface details

- On start the frontend calls `GET /api/v1/operations` and enables only the
  operation keys the backend advertises; the call doubles as a connectivity
  check and shows a "Backend unreachable" line with a Retry button when it
  fails.
- The expression line and the main display have fixed heights and never
  wrap; overflowing input is clipped at its start so the newest keys stay
  visible. The `=` animation moves the expression up into the small line and
  fades the result in with transform and opacity only, so pressing `=`
  repaints the display area and nothing else.
- The main line is sized by measuring: `useFittedSize` applies each of seven
  font sizes to the display and keeps the largest at which the text fits its
  line, in every theme's font and at every width, and measures again when the
  viewport or the theme changes. Only an over-long expression still clips.
- History: the clock icon at the top-left of the panel drops down the list of
  `expression = result`, newest first; clicking an entry starts a new
  expression from that exact result, the trash can clears the list, and
  Escape or a click outside closes it. Each tab's write merges with what the
  other tabs saved, and their changes arrive through the storage event.
- Keys grow slightly and lighten for 120ms when pressed, by click or by
  keyboard, transform and background-color only, off under reduced motion.
- Enter on a focused button or link outside the keypad activates it, like
  Space; on the keypad or with nothing focused Enter evaluates.
- Tooltips open after a short delay for mouse or pen hover and for keyboard
  focus, never after a touch, and close the moment the pointer leaves or the
  control is pressed; the `aria-label`s carry the same names.
- Below the 375×667 baseline (320×568, 414×568, 667×375 and the like) the
  keys shorten into pills sized from the viewport, and a phone held sideways
  puts the display beside the keypad with the swatches in a column at the
  right edge; 375×667 and up are unchanged. A desktop window shorter than
  the full-size column gives up its top margin first and uses the same pills
  below 696px, so a 1280×720 window shows every key too.

## Themes

A row of round swatches fixed in the bottom-right corner, one per theme in
that theme's accent colour with a ring on the active one, switches the look.
A first visit without a stored choice gets one of the five at random, stored
at once so a reload keeps it; a pick replaces it. The choice is stored in
`localStorage` and applied as a `data-theme` attribute on the document, so
each theme is one block of CSS variables plus a font stack in
[`frontend/src/index.css`](../frontend/src/index.css); components contain no
colours and no theme checks. Fonts come from the system; there are no logos,
icons or bundled font files, and the product names are labels only.

- **iOS**: references the iOS calculator; follows the system light or dark preference.
- **Netflix**: references Netflix; near-black surfaces, red accent, Helvetica-style type.
- **Spotify**: references Spotify; charcoal surfaces, green accent, a geometric sans (Avenir where available).
- **VS Code**: references Visual Studio Code's dark editor; editor greys, blue accent, monospace type.
- **Claude**: references Claude by Anthropic; warm cream surfaces, terracotta accent, a serif stack.

Hovering a swatch with a mouse or focusing it from the keyboard shows the theme
name in a tooltip (see Interface details). A small low-contrast GitHub mark
fixed in the bottom-left corner (`Source on GitHub`) opens this repository in a
new tab.

## End-to-end scenarios

[`e2e/`](../e2e) holds 23 Playwright scenarios in four files, run against the
compose stack exactly as deployed and in four projects: Desktop Chrome
(1280×720), the original iPhone SE (320×568 with touch and a mobile user agent,
in Chromium so one browser serves every project), a plain 320×568 window and a
667×375 landscape one; 80 runs in all, about nine seconds with four workers.
Every context starts with the iOS theme stored, so a first visit's random theme
never changes fonts or widths between runs, while a theme a test picks is kept.

- `layout.spec.ts` runs the same size check in every project: no scrolling in
  either direction, every key inside the viewport and at least 44px on each
  side, nothing fixed over a key, fifteen digits and `1 ÷ 3` shown whole, and
  the history dropdown inside the viewport. Desktop Chrome also checks 414×568
  and that 375×667 keeps its round keys.
- `calculator.spec.ts`: `12 + 3`, `2 + 3 × 4`, `√ xʸ %` as postfix keys,
  `2 ^ 3 ^ 2 = 512`, `196 % × 5 = 9.8`, the negative square root and
  `10 ^ 400` errors, continuing from the answer, `0.1 + 0.2 = 0.3`, a long
  expression keeping its right end in view, dividing by zero and AC, the
  keyboard, Enter on focused controls, and reduced motion playing no CSS
  animation at all.
- `history.spec.ts`: a result surviving a reload and starting a new
  expression when chosen, two tabs both keeping their results, Tab then Enter
  opening the history, and the chosen theme surviving a reload.
- `api.spec.ts` (Desktop Chrome only): 1.1 MB and 3 MB bodies get the JSON
  413 with no server version.

`make e2e` builds and starts the stack, runs them and tears it down. In CI the
`e2e` job does the same with four workers and a two-minute global timeout, and
the deploy job needs it, so a failing scenario never reaches the demo.
