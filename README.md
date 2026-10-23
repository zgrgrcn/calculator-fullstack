# Calculator Full-Stack

[![ci](https://github.com/zgrgrcn/calculator-fullstack/actions/workflows/ci.yml/badge.svg)](https://github.com/zgrgrcn/calculator-fullstack/actions/workflows/ci.yml)

**Live demo:** https://calculator.ozgurgurcan.com

A keypad calculator. The React + TypeScript frontend only builds the
expression; on `=` the whole token list goes to a Go REST microservice in one
request, which validates it, evaluates it with the usual precedence and
answers in JSON. The frontend does no arithmetic. Single operations stay
available on `/api/v1/calculate`.

- Add, subtract, multiply, divide, power, square root and percentage. The
  expression builds in large type as keys are pressed and nothing is sent
  until `=`; then the backend applies precedence (`2 + 3 × 4 = 14`),
  right-associative power (`2 ^ 3 ^ 2 = 512`) and postfix `%` and `√`
  (`196% × 5 = 9.8`)
- A small line above the display shows the evaluated expression or the last
  answer (`Ans = 14`); the main line picks its font size by measuring, so no
  result is clipped from 320px up
- Keyboard input, five themes picked from swatches and remembered, and a
  history of finished evaluations kept in localStorage and shared across tabs
- Works from 320×568 and phones held sideways up to the desktop with every key
  on screen and nothing covering one; animations use transform and opacity
  only and stop under reduced motion
- Every API response is JSON with one error envelope, and CI gates each deploy
  on unit tests, coverage thresholds, 15 Playwright scenarios against the
  compose stack and a mutation test

## Quick start with Docker

Requires Docker 25+ with Compose v2.

```bash
docker compose up --build
```

Open http://localhost:3000. nginx serves the built frontend and proxies
`/api/` to the backend container; the backend is also published on
http://localhost:8080 for direct API calls. Both containers have healthchecks
and memory limits (`docker compose ps` shows `healthy`).

## Running the backend and frontend separately

Requires Go 1.27 (any Go 1.21+ downloads it automatically through
`GOTOOLCHAIN=auto`) and Node 24.

```bash
make setup      # npm ci in frontend/ and e2e/
make backend    # Go API on http://localhost:8080
make frontend   # Vite dev server on http://localhost:5173, proxies /api to the backend
```

Run the two in separate terminals. The dev proxy target can be changed with
`VITE_API_PROXY_TARGET=http://host:port make frontend`. Other targets:
`make test`, `make coverage`, `make lint`, `make help`.

The backend reads one environment variable, `PORT` (default `8080`).

## Architecture

```
┌──────────────────────────────┐        ┌──────────────────────────────┐
│ frontend (React 19 + TS)     │        │ backend (Go 1.27, stdlib)    │
│                              │  JSON  │                              │
│ Keypad ─▶ reducer (pure)     │ ─────▶ │ api: routes, decode, errors  │
│   ▲         │ request        │ /api/  │   │                          │
│   │         ▼                │ ◀───── │   ▼                          │
│ Display ◀─ useCalculator ──▶ client   │ expr: precedence ─▶ calc     │
└──────────────────────────────┘        └──────────────────────────────┘
        dev: Vite proxy /api → :8080        prod: nginx proxy /api → backend:8080
```

A key press goes into a pure reducer that only appends to a token list: an
operator key never computes anything. On `=` the reducer places exactly one
`request` holding the whole expression; a hook posts it to
`/api/v1/evaluate` and dispatches `resolved` or `failed`; the reducer then
shows the answer under the evaluated expression. Dependencies point one way:
`calc ← expr ← api ← cmd/server` in Go, and `reducer, expression, format,
client ← useCalculator ← components` in TypeScript, so each unit is tested on
its own.

On start the frontend calls `GET /api/v1/operations` and enables only the
operation keys the backend advertises; the call doubles as a connectivity
check and shows a "Backend unreachable" line with a Retry button when it
fails.

## Interface details

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
  right edge; 375×667 and up are unchanged.

## Themes

A row of round swatches fixed in the bottom-right corner, one per theme in
that theme's accent colour with a ring on the active one, switches the look.
A first visit without a stored choice gets one of the five at random, stored
at once so a reload keeps it; a pick replaces it. The choice is stored in
`localStorage` and applied as a `data-theme` attribute on the document, so
each theme is one block of CSS variables plus a font stack in
[`frontend/src/index.css`](frontend/src/index.css); components contain no
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

## API

Base path `/api/v1`. Every response is `application/json; charset=utf-8`.

| Method | Path                 | Purpose                                           |
| ------ | -------------------- | ------------------------------------------------- |
| `POST` | `/api/v1/evaluate`   | Evaluate a whole expression given as a token list |
| `POST` | `/api/v1/calculate`  | Run one operation                                 |
| `GET`  | `/api/v1/operations` | List operations with arity and symbol             |
| `GET`  | `/healthz`           | Liveness, `{"status":"ok"}`                       |

Operations and operand counts: `add`, `subtract`, `multiply`, `divide`,
`power` take two operands; `sqrt` and `percentage` take one.
`percentage` is `a ÷ 100`.

`/evaluate` takes `{"tokens":[...]}` where each token is
`{"type":"number","value":2}`, `{"type":"operator","op":"add"}` or a postfix
`{"type":"unary","op":"sqrt"}` applying to the operand before it. `× ÷` bind
tighter than `+ −`, `^` tighter still and right-associative, unary tightest.
The frontend sends exactly this on `=`.

```bash
curl -s -X POST localhost:8080/api/v1/evaluate \
  -H 'Content-Type: application/json' \
  -d '{"tokens":[{"type":"number","value":2},{"type":"operator","op":"add"},{"type":"number","value":3},{"type":"operator","op":"multiply"},{"type":"number","value":4}]}'
# {"result":14}

curl -s -X POST localhost:8080/api/v1/evaluate \
  -d '{"tokens":[{"type":"number","value":196},{"type":"unary","op":"percentage"},{"type":"operator","op":"multiply"},{"type":"number","value":5}]}'
# {"result":9.8}

curl -s -X POST localhost:8080/api/v1/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation":"add","operands":[1.5,2.25]}'
# {"operation":"add","operands":[1.5,2.25],"result":3.75}

curl -s -X POST localhost:8080/api/v1/calculate -d '{"operation":"sqrt","operands":[144]}'
# {"operation":"sqrt","operands":[144],"result":12}

curl -s -X POST localhost:8080/api/v1/calculate -d '{"operation":"divide","operands":[1,0]}'
# 422 {"error":{"code":"DIVISION_BY_ZERO","message":"cannot divide by zero"}}

curl -s -X POST localhost:8080/api/v1/calculate -d '{"operation":"sqrt","operands":[1,2]}'
# 400 {"error":{"code":"INVALID_OPERAND_COUNT","message":"wrong number of operands: sqrt expects 1 operand, got 2"}}

curl -s localhost:8080/api/v1/operations
# {"operations":[{"name":"add","arity":2,"symbol":"+"},{"name":"subtract","arity":2,"symbol":"−"}, ...]}
```

Errors always have the shape `{"error":{"code":"...","message":"..."}}`.
400 means the request itself is malformed or names something that does not
exist; 422 means the request is well-formed but the mathematics is
impossible.

| Status | Code                    | When                                                                                                                                  |
| ------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `INVALID_REQUEST`       | Malformed JSON, unknown field, non-numeric or out-of-range operand (`1e999`), missing operation, more than one JSON value in the body |
| 400    | `UNKNOWN_OPERATION`     | `operation` is not in the registry                                                                                                    |
| 400    | `INVALID_EXPRESSION`    | `/evaluate` token list is empty or malformed: leading or doubled operators, a trailing operator, a unary with nothing before it       |
| 400    | `INVALID_OPERAND_COUNT` | Wrong number of operands for the operation                                                                                            |
| 422    | `INVALID_OPERAND`       | Square root of a negative number                                                                                                      |
| 422    | `DIVISION_BY_ZERO`      | Divisor is 0 (or −0)                                                                                                                  |
| 422    | `RESULT_NOT_FINITE`     | Result overflows or is undefined, such as `10^400` or `0^-1`                                                                          |
| 404    | `NOT_FOUND`             | Unknown route                                                                                                                         |
| 405    | `METHOD_NOT_ALLOWED`    | Wrong method; the `Allow` header names the right one                                                                                  |
| 413    | `PAYLOAD_TOO_LARGE`     | Body over 1 MiB                                                                                                                       |
| 500    | `INTERNAL_ERROR`        | A panic, recovered and logged; never a stack trace                                                                                    |

Numbers are IEEE 754 doubles, returned raw: `0.1 + 0.2` is
`0.30000000000000004` at the API, and the frontend rounds to 12 significant
digits for display. Integers are exact up to 2^53. Results that are NaN or
infinite are rejected before encoding, so a successful response always
carries a finite number.

In the compose stack nginx passes request bodies up to 2 MB through, so the
backend's own 413 reaches the client; above that nginx answers with the same
JSON body, and `server_tokens off` keeps its version out of headers and error
pages.

## Design decisions and assumptions

1. **One request per expression.** Keys only build a token list; `=` posts
   it to `/api/v1/evaluate`, where `expr` applies precedence and delegates
   every step to `calc`, so the frontend does no arithmetic and the error
   vocabulary is shared with `/calculate`, which stays for single operations.
   An earlier version evaluated chains step by step through `/calculate`; the
   current model follows the Google calculator, where an operator key only
   extends the expression.
2. **Precedence and associativity**, now in the backend: `+ −` bind weaker
   than `× ÷`, which bind weaker than `^`; `^` is right-associative like
   scientific calculators; postfix unary binds tightest.
3. **Percentage and square root are postfix tokens** (`196% × 5`),
   evaluated with the rest. Negation (`±`) edits the number being typed and
   is the only thing the frontend changes about a number.
4. **Validation on both layers.** The keypad constrains entry (15 digits,
   one decimal point, no leading zeros, a second operator replaces a trailing
   one, `=` is ignored while the expression ends with an operator); the API
   re-validates everything, including the token list's shape, and the UI
   shows the backend's own error message under the failed expression.
5. **No CORS code, by design.** The frontend and the API are served from one
   origin: Vite proxies `/api` in development and nginx does it in the
   compose stack. A client on another origin would need a small CORS
   middleware wrapping the mux in `backend/internal/api/handler.go`; it was
   left out as unneeded.
6. **400 versus 422.** Shape problems are 400; impossible mathematics is 422.
   Every error, including 404 and 405, uses the same JSON envelope.
7. **float64 end to end.** Arbitrary-precision decimals were out of scope;
   the display formatting hides binary noise, the API documents it.
8. **Go standard library only.** `net/http` method patterns, `encoding/json`
   with `DisallowUnknownFields`, `log/slog`. No third-party modules.
9. **Distroless backend image** with a self-probing `-healthcheck` flag,
   because the image has no shell or curl. The compose file has no host
   ports; `docker-compose.override.yml` adds them for local use only.
10. **History** is a localStorage list of `expression = result`, newest
    first, capped at 50, fed by the hook once a result is accepted and merged
    across tabs on every write; the reducer stays free of side effects.
    **Not built:** memory keys and rate limiting; everything else that was
    left out is listed below and under "What would come next".

The full design is in [docs/DESIGN.md](docs/DESIGN.md) and the task plan in
[docs/PLAN.md](docs/PLAN.md).

## Deliberately left as is

- **Repeat `=`.** A second `=` does nothing: the expression is complete and
  there is no "last operation" to reapply.
- **Operator replacement.** Typing `+` and then `×` replaces the pending
  operator instead of raising an error, as phone calculators do.
- **Delete.** Only Backspace is mapped; it removes the last digit, then the
  last token. Delete has no separate meaning on a keypad.
- **No paste.** Input is the keypad and single key presses; a pasted
  expression would need its own parser and error vocabulary.
- **Content-Type not checked.** The API parses every body as JSON whatever the
  header says, so a plain `curl -d` works, as the examples above do.
- **No CORS.** One origin by design (decision 5); the Chrome extension under
  "What would come next" is where it would come back.

## Testing and coverage

```bash
make test       # go vet + go test -race, then typecheck + lint + vitest
make coverage   # backend/coverage.html and frontend/coverage/index.html
make e2e        # compose stack up, Playwright against it, stack down
make mutate     # mutation test internal/calc; fails if a mutant survives
```

Backend: table-driven tests for every operation and edge case in `calc`
(division by zero and by −0, negative square root, overflow, NaN and Inf
operands, arity, unknown operation), a precedence and syntax table for
`expr`, and `httptest` tests for every route, status code and error code in
`api`, including malformed JSON, unknown fields, trailing data, oversized
bodies and the recover middleware.

Frontend: the reducer (entry rules, append-only operators, postfix unary
tokens, one request on `=`, continuing from the answer, failure and
recovery, stale request ids), expression formatting, the API client (every
error path and abort), the display's size buckets and measured fit, the
history store and hook with two tabs on one storage, the keyboard hook, the
tooltip controller, and the `Calculator` component against a fake
`/evaluate` backend (single request per chain, division by zero,
unreachable backend, keyboard input, disabled keypad while a request is
pending, operations handshake, Retry and the history dropdown).

CI fails when coverage drops below 90%: vitest's own thresholds for lines,
statements, functions and branches fail `npm run test:coverage`, and the
backend job parses `go tool cover -func` and fails under 90% statements.
Both percentages are printed in the job summary and the reports are
uploaded as artifacts. This table is the one place the numbers live; measured
on 2026-10-23 with `make coverage`:

| Layer              | Statements | Lines | Notes                                                                                       |
| ------------------ | ---------- | ----- | ------------------------------------------------------------------------------------------- |
| Go `internal/calc` | 100%       |       |                                                                                             |
| Go `internal/api`  | 94.6%      |       |                                                                                             |
| Go `internal/expr` | 97.8%      |       |                                                                                             |
| Go `cmd/server`    | 90.2%      |       | `main` is one line calling the tested `realMain`                                            |
| Go total           | 95.1%      |       | gate 90% over `./cmd/...` and `./internal/...`; `tools/mutate` has no tests and is excluded |
| Frontend           | 98.7%      | 99.5% | branches 95.9%, functions 99.2%; 90% thresholds enforced                                    |

### End-to-end tests

[`e2e/`](e2e) holds 15 Playwright scenarios that run against the compose
stack exactly as deployed: `12 + 3 = 15`; `2 + 3 × 4 = 14`; dividing by zero
shows the error and AC recovers; typing `2+2=` on the keyboard; `1 ÷ 3`,
fifteen typed digits and the division error (in the monospace theme) shown
whole on a 320px phone; every key on screen and clear of the fixed controls at
320×568, 414×568 and 667×375 while 375×667 keeps its round keys; Enter
activating a swatch, the history button, Close and Clear and still evaluating
with nothing focused; the key press animation off under emulated reduced
motion; and 1.1 MB and 3 MB bodies answered with the JSON 413 and no server
version. `make e2e` builds and starts the stack, runs them and tears it down.
In CI the `e2e` job does the same, and the deploy job needs it, so a failing
scenario never reaches the demo.

### Mutation testing

`make mutate` runs [`backend/tools/mutate`](backend/tools/mutate/main.go),
a small mutation tester for `internal/calc` only. It flips every binary
operator (`+ - * / < <= > >= == != && ||`) and bumps every numeric constant
by one, one site at a time, reruns the package tests against each mutant in
a scratch copy of the module, and fails if any mutant survives.

What it proves: coverage shows which lines the tests execute; a 47 of 47
kill score shows the assertions would notice a wrong operator, a wrong
constant or a flipped comparison anywhere in the arithmetic. Writing it
found two real gaps: nothing tested a negative-infinity operand or result,
so `math.IsInf(x, 0)` could have become `math.IsInf(x, 1)` unnoticed, and
the zero result returned with every error was unasserted. It stays out of
`make test`, runs in its own CI job in about half a minute, and the deploy
job needs it.

## Deployment

The live demo runs the compose stack on a self-hosted Coolify server as a
Docker Compose application built from this repository's `main` branch, with
the domain attached to the `frontend` service. The backend is reachable only
inside the compose network.

Deploys are gated by CI: the `deploy` job in
[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs after the
backend, frontend, e2e and mutate jobs succeed on a push to `main` and calls
the Coolify deploy webhook. It needs two repository secrets, `COOLIFY_TOKEN`
(an API token with only the `deploy` ability) and `COOLIFY_WEBHOOK_URL`
(`https://<coolify>/api/v1/deploy?uuid=<app uuid>&force=false`), set with
`gh secret set`. While either is missing the job skips with a notice, so the
workflow stays green on forks.

Both containers define healthchecks and memory limits (128 MB backend, 64 MB
frontend); Coolify uses the compose healthchecks as-is. First deployed on
2026-10-21; every push to `main` that passes CI redeploys it.
[`deploy/coolify-create.sh`](deploy/coolify-create.sh) creates the project
and the compose application through the Coolify API (idempotent; needs a
token with the root ability in `~/.config/coolify/token`) and prints the
webhook URL for the CI secret.

## Project structure

```
backend/
  cmd/server/          main: config from env, timeouts, graceful shutdown, -healthcheck
  internal/calc/       pure arithmetic: operation registry, Calculate, sentinel errors
  internal/expr/       token-list evaluation with precedence, built on calc
  internal/api/        HTTP handler, JSON decoding, error mapping, middleware
  tools/mutate/        mutation tester for internal/calc (make mutate)
frontend/
  src/api/             typed client: calculate(), operations(), ApiError, NetworkError
  src/calculator/      reducer (pure state machine), format, hooks
  src/components/      Calculator, Display and its measured size buckets, Keypad, Key, key layout
  src/theme/           theme names, persistence, picker
  src/history/         history storage shared across tabs, hook, dropdown
  src/tooltip/         tooltip controller for hover and keyboard focus
  nginx.conf           static files + /api proxy for the container
e2e/                   Playwright scenarios against the compose stack (make e2e)
docker-compose.yml     deploy-ready stack; docker-compose.override.yml adds local ports
.github/workflows/     CI: test, build, deploy
docs/                  DESIGN.md (spec), PLAN.md (task plan)
PROMPTS.md             every prompt used, verbatim
```

## AI usage

Built with Claude Code (model Fable 5.1) in the Claude desktop app. The
workflow was: a structured brainstorming session that produced the spec
([docs/DESIGN.md](docs/DESIGN.md)), a task plan derived from it
([docs/PLAN.md](docs/PLAN.md)), then execution task by task, with the tests
written from the plan's test tables and committed with the code, one commit
per task. Every prompt I sent, including multiple-choice answers, is in
[PROMPTS.md](PROMPTS.md), verbatim and in order.

## What would come next

Six steps, each with what it requires:

1. **Decimal arithmetic** for exact money-style results. Requires a decimal
   type in `calc` (`math/big.Rat` or scaled integers, to stay on the standard
   library), numbers as strings on the wire because JSON numbers are doubles,
   the keypad's entry rules and the formatter working on strings, and a
   rounding rule per operation with its own test table.
2. **Server-side history behind authentication.** Requires a user identity
   (sessions or tokens), a store with migrations, `/api/v1/history` endpoints
   scoped per user with deletion, and a merge of the local list on first
   sign-in, which the hook's merge-on-write already shapes.
3. **Share links.** Requires a URL form of an expression (the token list the
   reducer already produces) and a route that loads it and validates it the
   way `/evaluate` does; a stored short link would add an endpoint, expiry
   and abuse limits.
4. **Shared live session.** Requires a WebSocket or SSE channel, session ids,
   one rule for concurrent presses (a single driver, or applying the pure
   reducer's actions in the same order on every client) and reconnection;
   the reducer's state is plain data, so it travels as it is.
5. **Chrome extension.** Requires the CORS middleware that decision 5 left
   out, with an allowlist of extension origins, the API published outside the
   compose network, a manifest with host permissions, and a popup build of
   the React app.
6. **Request ids and metrics.** Requires a middleware that accepts or assigns
   `X-Request-Id`, echoes it and puts it in every `slog` line, a `/metrics`
   endpoint (counters and latency histograms on the standard library, or
   `expvar`) kept off the public nginx route, and alerts on the error rate.
