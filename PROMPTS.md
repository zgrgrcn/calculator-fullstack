# Prompt log

Every message I sent to Claude Code (model Fable 5.1, Claude desktop app) while
building this assignment, verbatim and in order. Picks from the tool's
multiple-choice prompts are logged as the exact text I selected or typed; the
italic line above each pick names the question it answered. Nothing is edited
after the fact; new prompts are appended at the bottom.

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
