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
