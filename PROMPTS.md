# Prompt log

Every message I sent to Claude Code (model Fable 5.1, Claude desktop app) while
building this assignment, verbatim and in order. Picks from the tool's
multiple-choice prompts are logged as the exact text I selected or typed; the
italic line above each pick names the question it answered. Nothing is edited
after the fact; new prompts are appended at the bottom.

The independent Codex black-box evaluation prompt is recorded separately at the end.

## 1. Kick-off (2026-10-21)

Sent as the `/anthropic-skills:brainstorming` slash command with this text:

```text
Take-home assignment for a senior full-stack role. Requirements below, verbatim. Use the brainstorming skill first. Keep a PROMPTS.md from the first commit with every prompt I send.

Objective
Build a full-stack calculator application with a React frontend and a backend microservice. The frontend should consume the backend API to perform basic and advanced arithmetic operations. Focus on clean design, maintainable code, and testable architecture.Requirements
Functional
Operations:

* Addition, Subtraction, Multiplication, Division
* Optional: Exponentiation, Square Root, Percentage

Frontend (React):

* Intuitive UI for entering input and displaying results
* Input validation and error handling
* Responsive design (basic mobile support)

Backend (REST API):

* Expose endpoints for calculator operations
* Validate input and handle edge cases (division by zero, invalid data)
* Return results in JSON format

Non-Functional

* Clean, readable, and idiomatic code (frontend and backend)
* Unit tests covering key functionality for both layers
* Documentation: setup instructions, API usage, and design rationale
* Optional: Dockerfile for full-stack deployment

Constraints

* Frontend: React (TypeScript preferred)
* Backend: Go is perferred

Deliverables

1. Git repository with frontend and backend code
2. README with setup instructions, API examples, and design decisions
3. Unit tests and coverage report
4. Optional: Dockerfile to run frontend + backend together

Instructions

1. Use any AI tooling you would like
2. Spend ~2–4 hours on this assignment. Prioritize correctness, clarity, and maintainability over extra features.
3. Push your solution to GitHub, GitLab, or another Git repository.
4. Share the repository link with us for evaluation.
5. Share any prompts that you used in your work
6. Make sure your README includes:
   * Setup instructions
   * How to run the frontend and backend
   * Examples of API calls (if using REST)
   * Design decisions or assumptions
```

## 2. Operations scope

*Answering: "Which operations should the calculator support?"*

```text
All 7 (Recommended)
```

## 3. Percentage semantics, UI model, GitHub

*Answering: "What should 'percentage' mean?"*

```text
unary: a/100, we can take ios calculator as example
```

*Answering: "Which UI interaction model?"*

```text
Keypad calculator
```

*Answering: "GitHub repo: visibility and when to push?"*

```text
Public, push from commit 1 (Recommended)
```

## 4. Approach

*Answering: "Which approach?" (A: per-operation API + frontend state machine with precedence; B: expression API; C: A without precedence)*

```text
A: API + state machine (Recommended)
```

## 5. Design review, section by section

*Answering: "Section 1, architecture and layout: looks right?"*

```text
Use the latest stable Go, not 1.22.  Put the spec at docs/DESIGN.md instead of docs/superpowers/specs/. Everything else agreed, including no CORS code; mention the proxy decision in the README.
```

*Answering: "Section 2, API contract and error model: looks right?"*

```text
Yes
```

*Answering: "Section 3, frontend state machine and UI: looks right?"*

```text
Yes, keep precedence. Two conditions: build the single-pending-operator version first and commit it, then add precedence as a separate commit so I can revert it if it takes too long. And make power right-associative (2 ^ 3 ^ 2 = 512), like scientific calculators. Reducer stays pure, fetch only in the hook.
```

*Answering: "Section 4, testing, Docker, CI, docs, cut list: looks right?"*

```text
Yes. One addition: deploy the compose stack to my Coolify server as a live demo, linked at the top of the README. Add a deploy job to ci.yml that runs only on main after tests pass and triggers the Coolify deploy webhook (token as a GitHub secret). Add a healthcheck on /healthz and memory limits to the compose file. Keep a short Deployment section in the README.
```

## 6. Spec review: change request (sent before the details were typed)

```text
I want changes to docs/DESIGN.md:
```

## 7. Spec review: three fixes

```text
Three fixes in docs/DESIGN.md before we start. 1e999 is not a 400: encoding/json turns it into +Inf, so it fails as 422 INVALID_OPERAND via the non-finite operand check; fix section 6. Add operations() to the client and call it on mount, otherwise GET /operations is dead code and should not be in the cut list. And use "go 1.27" in go.mod, not 1.27.3.
```

## 8. Spec approved

```text
Spec approved. Create the public GitHub repo, push, and write the implementation plan.
```

## 9. Plan approved

```text
Plan approved. Execute the tasks inline here, in order, one commit each.
```

## 10. Deployment go-ahead

```text
I saved a root-ability token at ~/.config/coolify/token (chmod 600). Run deploy/coolify-create.sh and finish Task 10.
```

## 11. Expression line

```text
Add an expression line above the main display, like the small right-aligned line in the attached screenshot. It shows exactly what was pressed: after 2 + 3 × it reads "2 + 3 ×", and after = it reads "2 + 3 × 4 =". Derive it from the existing reducer state with a pure function, no new state field, with unit tests. Keep the main display as it is.
```

## 12. Keypad typography

```text
do this task with sub agent, use opus 5.5 high.
The keypad glyphs look thin and small next to the display. Bump the display weight, make digit keys larger, and make the operator glyphs (÷ × − + =) larger than the digits. Keep √, xʸ and the function keys smaller since they are two characters. CSS only.
```

## 13. Result animation

```text
do this task with sub agent, use opus 5.5 high.
When = is pressed the result just replaces the number. Animate it: the expression line slides up and shrinks into place, and the result fades in, like the calculator in the screenshot. About 150ms, CSS only. Respect prefers-reduced-motion.
```

## 14. Themes

```text
Keep the iOS theme as the default, light and dark following the system preference. Add four named themes: Netflix, Spotify, VS Code, and Claude. Each is a block of the existing CSS variables plus a font stack that evokes the product, using fonts already available on the system. Use the product name only as the theme label. No logos, no icons, no bundled font files.

No color values and no theme checks inside components. A small control lists the themes by name, the choice persists in localStorage, and the default is iOS following the system preference. Add one test: selecting a theme sets the attribute and the choice survives a reload. In the README, one line per theme naming the product it references.
```

## 15. Coverage gates, end-to-end tests, mutation testing

```text
1. CI should fail when coverage drops. Frontend already has vitest thresholds; confirm npm run test:coverage exits non-zero below 90 and that the CI step uses it. For the backend, parse `go tool cover -func` in the workflow and fail under 90% statements. Print both percentages in the job summary.
2. Add Playwright end-to-end tests that run against the compose stack, before the deploy job. Four cases: 12 + 3 = 15, 2 + 3 × 4 = 14, dividing by zero shows the error and AC recovers, and typing 2+2= on the keyboard. The deploy job must need this job, so a failing scenario never reaches the demo.
3. Add mutation testing for backend/internal/calc only. Flip operators and constants, rerun the package tests, and fail if a mutant survives. Keep it out of the main test run; give it its own CI job and a `make mutate` target. Document in the README what it proves.
```

## 16. Stop, stash, and change the evaluation model

```text
Stop after the current step. Stash the uncommitted mutation, e2e and CI changes, and do not push. I want to change the evaluation model first; we return to those tests after.

The behaviour I want is in this recording: '/Users/zgrgrcn/Desktop/Screen Recording 2026-10-22 at 00.28.22.mov'. Watch it, then:

Change the evaluation model. An operator key only appends to the expression; nothing is sent until =. Then the whole expression goes to the backend in one request, and the frontend still does no arithmetic.

Add POST /api/v1/evaluate, taking the token list and returning the result. Keep /calculate unchanged. While typing, show the full expression in large type instead of the current number. Commit this on its own with tests green before anything else.
```

## 17. Keep the pushed commits, build on top

```text
Leave the three commits on main. Build the evaluation model on top as its own commit; we fix the red backend job when we return to the tests.
```

## 18. Push the evaluation model

```text
Push 5c8f9b9 to origin/main now; the demo stays on the old model until the coverage gate is fixed.
```

## 19. Fix the coverage gate scope

```text
Scope the backend coverage run to the tested packages now, as its own small commit, so CI goes green and the demo deploys.
```

## 20. Equals animation, expression into the small line

```text
On =, animate the expression: it shrinks and moves up into the small line, and the result fades in where it was. 200ms, CSS only. Respect prefers-reduced-motion.
```

## 21. History

```text
Store each finished expression and its result in localStorage. A history button opens a panel listing "expression = result", newest first.
```

## 22. Theme swatches and source link

```text
Replace the theme <select> with a row of round swatches, one per theme, showing that theme's accent colour. Place it at the bottom-right corner of the page, fixed, away from the keypad. Highlight the active one. Keep the existing behaviour: the choice persists in localStorage and the default follows the system preference. Update the theme test to click a swatch instead of changing a select.

Add a "source" link to https://github.com/zgrgrcn/calculator-fullstack at the bottom-left corner, fixed, small and low-contrast, opening in a new tab.
```

## 23. Paint flashing on equals

```text
'/Users/zgrgrcn/Desktop/Screen Recording 2026-10-22 at 01.30.24.mov'

Paint flashing shows the bug precisely. Pressing a digit repaints only that key and the display, which is fine. Pressing = repaints the whole keypad and the display for the full 200ms, in stacked bands, so something is changing layout during the animation rather than only compositing.

A transform and opacity animation should not paint at all. Find what reflows on =. The likely cause: the expression moves from large type in the main line to the small line, so the line's height changes and the keypad below it shifts. Fix it by keeping the display area a fixed height and animating the expression inside it, so the keypad never moves.

Confirm with paint flashing afterwards: after the fix, = should repaint only the display area. Keypad, history button and theme picker stay unpainted.
```

## 24. Calculator panel

```text
Wrap the display and the keypad in one panel: a rounded rectangle with a subtle border and the panel background, padded, centred, max-width unchanged. The history button, theme swatches and the source link stay outside it. The page background stays as it is, so the panel reads as the calculator sitting on it.
```

## 25. GitHub mark, swatch tooltips, clock history button, key press feedback

```text
1. Replace the "source" text link with the GitHub mark, an inline SVG, same corner and same link. Keep it small and low-contrast, and give it an aria-label of "Source on GitHub" plus a tooltip. It still opens in a new tab.
2. Show the theme name when a swatch is hovered or focused. A CSS tooltip is enough, no library. Keyboard focus must reveal it too, not only hover.
3. Put the history button inside the calculator panel, at the top-left of the display, opposite the expression. Use a clock icon, an inline SVG, with an aria-label of "History" and a tooltip. Keep it the same visual weight as the expression text so it does not compete with the result.
4. On press, a key should grow slightly and lighten, then settle back, instead of shrinking. About 120ms, transform and background-color only, so it paints nothing outside the key. It must also play for keyboard input, not only for clicks. Respect prefers-reduced-motion.
```

## 26. History dropdown

```text
Open the history as a dropdown directly under the history button, anchored to the top-left of the display, not as a panel rising from the bottom of the page. It lists "expression = result", newest first.

Replace the Clear label with a broom icon and the Close label with an × icon, each an inline SVG with an aria-label and a tooltip.

Clicking a result inserts it as the start of a new expression, so the user can keep calculating from it, and closes the dropdown.

Close the dropdown when clicking anywhere outside it, and on Escape. Keep the existing keyboard access.
```

## 27. Random theme on first visit

```text
On a first visit, when no theme is stored, pick one at random from the five themes instead of defaulting to iOS. Once the user chooses a theme, keep that choice as before. Reload must not re-roll a stored choice.
```

## 28. CI annotations, runner pin, summary permissions

```text
Remove the two annotations in CI. Pin every job to runs-on: ubuntu-24.04 instead of ubuntu-latest. And fix the "Resource not accessible by integration" warning on the backend and mutate jobs: the step that writes the job summary needs permission to do so. Add the narrowest permissions block that allows it, keep everything else read-only. Don't change what the jobs run.
```

## 29. Tooltips on touch, trash icon

Sent with a screenshot of the live site on an iPhone, the "Clear history" tooltip left open after a tap:

```text
1. Tooltips stay on screen after a tap and overlap the display. Show them only for hover and keyboard focus, never after a touch. A short delay before they appear is fine. They must also close as soon as the pointer leaves or the key is released. Keep the aria-labels, so nothing changes for a screen reader.
2. Replace the broom icon with a trash can. It reads more clearly as "clear" at this size. Keep it an inline SVG with the same aria-label and tooltip.
```

## 30. Independent black-box evaluation (Codex, 2026-10-22)

Independent black-box pass against the live site, run by Codex.

```text
Test https://calculator.ozgurgurcan.com in Google Chrome as a black box for a senior full-stack take-home assignment. Use the rendered UI, DevTools, and APIs discovered from network traffic. Do not read source code, bundles, the repository, or documentation.

Systematically check arithmetic and input validation; desktop and mobile layouts; accessibility and keyboard use; themes, history, and storage; multiple tabs and private sessions; copy/paste; network failures and recovery; and observed API endpoints with invalid and edge-case inputs. Reproduce failures and continue as long as needed to finish the coverage.

Stay below 300 HTTP requests total, at most five concurrent, with bodies below 2 MB. No automated fuzzing.

Write one report at /Users/zgrgrcn/career/resume/2026/sezzle/blackbox-report-2026-10-22.md, with a coverage log including passes, reproducible bugs with severity and screenshots, anything not tested and why, and a three-sentence verdict: would you ship, first requested change, and one interview question. Report observed behaviour only; do not guess implementation or propose code changes.
```

## 31. Fixes next, one per prompt

```text
Review and an independent black-box test are done; fixes next, one per prompt. Keep logging every prompt in PROMPTS.md, this one included. One commit per task, tests green, push to main after each; CI gates the deploy, fix forward if a job fails.
```

## 32. Display clips long results

```text
1 ÷ 3 = shows "…333333": the leading "0." is clipped. Any 12–14 character result does this. No result the formatter can produce may be clipped, at 320px and up. Keep the fixed line heights. Test the boundaries.
```

## 33. History across tabs

```text
History is last-writer-wins across tabs: a calculation in tab B drops what tab A saved. Merge on write and pick up changes from other tabs. Unit-test two writers.
```
