# Calculator Full-Stack: Design

Date: 2026-10-21. Status: approved design, pending implementation plan.

A keypad calculator. A React + TypeScript frontend owns the interaction state
machine and sends every arithmetic operation to a Go REST microservice. The
backend validates input, computes one operation per request and returns JSON.

Live demo (after deployment): https://calculator.ozgurgurcan.com

## 1. Goals and non-goals

Goals, in priority order:

1. Correctness: every operation and edge case (division by zero, invalid data,
   overflow) is handled and tested on both layers.
2. Clarity: small units with one purpose each, one-way dependencies, idiomatic
   Go and React.
3. Testability: pure domain code (Go `calc` package, TypeScript reducer) with
   no I/O; I/O confined to thin adapters (HTTP handlers, API client, hook).
4. Documentation: README with setup, run instructions, API examples, design
   decisions, coverage numbers, and a verbatim prompt log.
5. Deployment: Docker Compose stack, CI, and a live demo on Coolify.

Non-goals: persistence, history, authentication, rate limiting, multi-user
state, internationalised number formats, arbitrary-precision arithmetic.

## 2. Requirements mapping

| Requirement | Where it is met |
|---|---|
| Add, subtract, multiply, divide | `calc` package; keypad `+ − × ÷` |
| Exponentiation, square root, percentage | `calc` package; keypad `xʸ √ %` |
| Intuitive UI | iOS-style keypad, keyboard shortcuts, live display |
| Input validation and error handling (frontend) | entry rules in the reducer; API and network errors shown in the display |
| Responsive design | CSS grid keypad, fills a phone viewport, max-width 400px on desktop |
| Endpoints for operations | `POST /api/v1/calculate`, `GET /api/v1/operations`, `GET /healthz` |
| Validate input, division by zero, invalid data | request decoding + `calc` errors mapped to 400/422 |
| JSON results | every response, including errors, is JSON |
| Unit tests, both layers | Go `testing` + `httptest`; Vitest + Testing Library |
| Coverage report | `make coverage`, README table, CI artifacts |
| Dockerfile for full stack | two Dockerfiles + `docker-compose.yml` |
| Prompts shared | `PROMPTS.md`, append-only, verbatim |

## 3. Architecture

```
┌──────────────────────────────┐        ┌──────────────────────────────┐
│ frontend (React 19 + TS)     │        │ backend (Go 1.27, stdlib)    │
│                              │  JSON  │                              │
│ Keypad ─▶ reducer (pure)     │ ─────▶ │ api: routes, decode, errors  │
│   ▲         │ request        │ /api/  │   │                          │
│   │         ▼                │ ◀───── │   ▼                          │
│ Display ◀─ useCalculator ──▶ client   │ calc: registry + Calculate() │
└──────────────────────────────┘        └──────────────────────────────┘
        dev: Vite proxy /api → :8080        prod: nginx proxy /api → backend:8080
```

Data flow: key press → reducer → at most one `request` in state → hook runs
`fetch` → Go handler → `calc` → JSON → hook dispatches `resolved` or `failed`
→ reducer updates the display and may emit the next request.

Dependencies point one way:

- Go: `calc` ← `api` ← `cmd/server`
- TypeScript: `reducer`, `format`, `client` ← `useCalculator` ← components

No CORS code. In development Vite proxies `/api` to the Go server; in
production nginx does the same inside the compose network. The README states
this decision and the one-line change needed to call the API cross-origin.

## 4. Repository layout

```
calculator-fullstack/
├── backend/
│   ├── cmd/server/main.go          config from env, server timeouts, graceful shutdown, -healthcheck
│   ├── internal/calc/              calc.go, calc_test.go
│   ├── internal/api/               handler.go, errors.go, middleware.go, *_test.go
│   ├── go.mod                      go 1.27.3, no third-party dependencies
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── api/client.ts           calculate(); ApiError, NetworkError
│   │   ├── calculator/types.ts     Key, Action, State, Request
│   │   ├── calculator/reducer.ts   pure state machine
│   │   ├── calculator/format.ts    formatNumber()
│   │   ├── calculator/useCalculator.ts   hook: reducer + client
│   │   ├── calculator/useKeyboard.ts     keydown → Key
│   │   ├── components/             Calculator, Display, Keypad, Key
│   │   ├── App.tsx, main.tsx, index.css
│   │   └── test/setup.ts
│   ├── vite.config.ts              dev proxy, vitest config
│   ├── nginx.conf
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml              deploy-ready: no host ports
├── docker-compose.override.yml     local only: publishes frontend on :3000
├── .github/workflows/ci.yml
├── Makefile
├── README.md
├── PROMPTS.md
└── docs/DESIGN.md
```

## 5. Backend

### 5.1 Toolchain

- `go.mod` declares `go 1.27.3` (latest stable on 2026-10-21). With the default
  `GOTOOLCHAIN=auto`, an older local Go (this machine has 1.22.12) downloads
  1.27.3 on first use. No system change required; `brew upgrade go` is optional.
- Standard library only: `net/http` with Go 1.22+ method patterns, `encoding/json`,
  `log/slog`, `math`, `testing`, `net/http/httptest`.
- Docker: `golang:1.27-alpine` build stage, `gcr.io/distroless/static-debian12:nonroot`
  runtime, static binary (`CGO_ENABLED=0`, `-trimpath -ldflags="-s -w"`).

### 5.2 Package `calc` (pure domain)

```go
type Operation string

const (
    Add        Operation = "add"
    Subtract   Operation = "subtract"
    Multiply   Operation = "multiply"
    Divide     Operation = "divide"
    Power      Operation = "power"
    Sqrt       Operation = "sqrt"
    Percentage Operation = "percentage"
)

type Spec struct {
    Name   Operation `json:"name"`
    Arity  int       `json:"arity"`
    Symbol string    `json:"symbol"`
}

func Operations() []Spec                                      // stable order, as listed above
func Calculate(op Operation, operands []float64) (float64, error)

var (
    ErrUnknownOperation = errors.New("unknown operation")
    ErrOperandCount     = errors.New("wrong number of operands")
    ErrInvalidOperand   = errors.New("invalid operand")
    ErrDivisionByZero   = errors.New("cannot divide by zero")
    ErrNotFinite        = errors.New("result is not a finite number")
)
```

Semantics:

| Operation | Arity | Result | Errors |
|---|---|---|---|
| add | 2 | a + b | not finite |
| subtract | 2 | a − b | not finite |
| multiply | 2 | a × b | not finite |
| divide | 2 | a ÷ b | b == 0 (including −0) → `ErrDivisionByZero`; not finite |
| power | 2 | math.Pow(a, b) | NaN or ±Inf (0⁻¹, (−8)^(1/3), 10^400) → `ErrNotFinite` |
| sqrt | 1 | math.Sqrt(a) | a < 0 → `ErrInvalidOperand` ("square root of a negative number") |
| percentage | 1 | a ÷ 100 | none |

Rules:

- Unknown operation → `ErrUnknownOperation`; wrong operand count →
  `ErrOperandCount` wrapped with detail ("sqrt expects 1 operand, got 2").
- Any NaN or ±Inf operand → `ErrInvalidOperand` (defensive; JSON cannot carry
  them, but the package is usable without the API).
- Every result is checked with `math.IsNaN` / `math.IsInf` → `ErrNotFinite`.
  `encoding/json` refuses NaN and Inf, so this check guards the encoder too.
- Errors are wrapped with `fmt.Errorf("%w: ...")`; callers use `errors.Is`.
- Implementation: a map from `Operation` to `{arity, fn}`; `Operations()`
  returns the specs in a fixed order.

### 5.3 Package `api` (HTTP transport)

`func NewHandler(logger *slog.Logger) http.Handler`

Routes (Go 1.22 `ServeMux` patterns):

| Pattern | Behaviour |
|---|---|
| `POST /api/v1/calculate` | decode, call `calc.Calculate`, respond |
| `/api/v1/calculate` (any other method) | 405 JSON with `Allow: POST` |
| `GET /api/v1/operations` | `{"operations": calc.Operations()}` |
| `GET /healthz` | `{"status":"ok"}` |
| `/` (everything else) | 404 JSON |

Request handling for `calculate`:

1. `http.MaxBytesReader` at 1 MiB → 413 `PAYLOAD_TOO_LARGE`.
2. `json.Decoder` with `DisallowUnknownFields`; body must be exactly one JSON
   object (a second `Decode` must return `io.EOF`). Decode failures → 400
   `INVALID_REQUEST` with a safe message ("invalid JSON body", "operands must
   be numbers", "body must contain a single JSON object").
3. Empty `operation` → 400 `INVALID_REQUEST` ("operation is required").
   Missing or null `operands` is an empty list and fails the arity check.
4. `calc.Calculate` errors map via `errors.Is`:

| calc error | HTTP | code |
|---|---|---|
| `ErrUnknownOperation` | 400 | `UNKNOWN_OPERATION` |
| `ErrOperandCount` | 400 | `INVALID_OPERAND_COUNT` |
| `ErrInvalidOperand` | 422 | `INVALID_OPERAND` |
| `ErrDivisionByZero` | 422 | `DIVISION_BY_ZERO` |
| `ErrNotFinite` | 422 | `RESULT_NOT_FINITE` |
| anything else | 500 | `INTERNAL_ERROR` (logged) |

400 means the request itself is malformed or names something that does not
exist. 422 means the request is well-formed but the mathematics is impossible.

Responses (all `Content-Type: application/json; charset=utf-8`):

```json
{"operation":"divide","operands":[10,4],"result":2.5}
{"error":{"code":"DIVISION_BY_ZERO","message":"cannot divide by zero"}}
```

Middleware, outermost first: `recover` (500 JSON, logs the panic and stack,
never leaks it) → request logger (`slog`: method, path, status, duration_ms)
→ mux. A small status-capturing `ResponseWriter` supports the logger.

### 5.4 `cmd/server`

- `PORT` env, default `8080`. `LOG_LEVEL` is not needed; info level, JSON
  handler to stdout.
- `http.Server` timeouts: ReadHeader 5s, Read 10s, Write 10s, Idle 60s.
- `signal.NotifyContext` on SIGINT/SIGTERM → `Shutdown` with a 10s deadline.
- `-healthcheck` flag: GET `http://127.0.0.1:$PORT/healthz`, exit 0 on 200,
  otherwise 1. The distroless image has no curl or wget, so the binary probes
  itself. Coolify and compose healthchecks call this.

## 6. API contract (for the README)

```bash
curl -s -X POST localhost:8080/api/v1/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation":"add","operands":[1.5,2.25]}'
# {"operation":"add","operands":[1.5,2.25],"result":3.75}

curl -s -X POST localhost:8080/api/v1/calculate -d '{"operation":"sqrt","operands":[144]}'
# {"operation":"sqrt","operands":[144],"result":12}

curl -s -X POST localhost:8080/api/v1/calculate -d '{"operation":"divide","operands":[1,0]}'
# 422 {"error":{"code":"DIVISION_BY_ZERO","message":"cannot divide by zero"}}

curl -s -X POST localhost:8080/api/v1/calculate -d '{"operation":"sqrt","operands":[1,2]}'
# 400 {"error":{"code":"INVALID_OPERAND_COUNT","message":"sqrt expects 1 operand, got 2"}}

curl -s localhost:8080/api/v1/operations
# {"operations":[{"name":"add","arity":2,"symbol":"+"}, ...]}
```

Numbers are IEEE 754 doubles, returned raw. `0.1 + 0.2` is
`0.30000000000000004` at the API; display rounding is the client's job.
Integers are exact up to 2^53. Literals the decoder cannot represent (`1e999`)
are rejected with 400.

## 7. Frontend

### 7.1 Toolchain

Vite 7 `react-ts` template: React 19, TypeScript 5.x, ESLint from the
template, Prettier with defaults. Tests: Vitest, `@testing-library/react`,
`@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`,
`@vitest/coverage-v8`. Plain CSS with custom properties; no UI library.

`vite.config.ts` proxies `/api` to `VITE_API_PROXY_TARGET` (default
`http://localhost:8080`) and holds the Vitest config (jsdom, setup file,
v8 coverage, thresholds: 85% lines and statements).

Scripts: `dev`, `build` (`tsc -b && vite build`), `preview`, `lint`,
`typecheck`, `format`, `test` (`vitest run`), `test:watch`, `test:coverage`.

### 7.2 `api/client.ts`

```ts
export type OperationName = 'add' | 'subtract' | 'multiply' | 'divide' | 'power' | 'sqrt' | 'percentage';
export class ApiError extends Error { code: string; status: number }
export class NetworkError extends Error {}
export async function calculate(
  operation: OperationName,
  operands: number[],
  options?: { signal?: AbortSignal; baseUrl?: string },
): Promise<number>
```

- POST `${baseUrl}/api/v1/calculate`, `baseUrl` defaults to `''` (same origin).
- `fetch` rejection → `NetworkError('Backend unreachable')`. Abort propagates
  as the DOM `AbortError` (the hook ignores it).
- Non-2xx: parse `{error:{code,message}}` → `ApiError`; unparsable body →
  `ApiError('UNKNOWN', 'HTTP <status>', status)`.
- 2xx: parse `{result}`; a missing or non-numeric result →
  `ApiError('INVALID_RESPONSE', ...)`.

### 7.3 Types

```ts
export type BinaryOp = 'add' | 'subtract' | 'multiply' | 'divide' | 'power';
export type UnaryOp = 'sqrt' | 'percentage';

export type Key =
  | { type: 'digit'; value: '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' }
  | { type: 'decimal' } | { type: 'negate' } | { type: 'backspace' } | { type: 'clear' }
  | { type: 'operator'; op: BinaryOp } | { type: 'unary'; op: UnaryOp } | { type: 'equals' };

export type Action =
  | { type: 'key'; key: Key }
  | { type: 'resolved'; id: number; value: number }
  | { type: 'failed'; id: number; message: string };

export type After = { kind: 'operator'; op: BinaryOp } | { kind: 'equals' } | { kind: 'unary' };

export interface Request { id: number; op: BinaryOp | UnaryOp; operands: number[]; after: After }
export interface PendingOperand { value: number; op: BinaryOp }

export interface State {
  display: string;              // text on screen: entry, formatted result, or error message
  entry: string | null;         // digits being typed; null when display shows a result
  value: number;                // numeric value of the current operand
  stack: PendingOperand[];      // left operands waiting for a right operand
  awaitingOperand: boolean;     // true right after an operator key
  status: 'idle' | 'computing' | 'error';
  request: Request | null;      // at most one in flight
  nextRequestId: number;        // monotonic, survives AC
}
```

Initial state: display `"0"`, entry `null`, value `0`, empty stack,
`awaitingOperand=false`, status `idle`, no request, `nextRequestId=1`.

### 7.4 Reducer (pure, no I/O)

`reduce(state, action): State`. Key actions are ignored while `computing`.
In `error`, only digit, decimal and clear are accepted; digit and decimal
start a fresh entry.

Entry editing:

- digit: entry `null` or `"0"` → replaced; otherwise appended. At most 15
  digit characters; further digits are ignored. `value = Number(entry)`,
  `display = entry`, `awaitingOperand = false`.
- decimal: entry `null` → `"0."`; already has `.` → ignored; else append.
- backspace: entry `null` → ignored; drop the last character; empty or `"-"`
  → `"0"`.
- negate: entry present → toggle leading `-` unless entry is `"0"`; entry
  `null` → `value = -value`, `display = formatNumber(value)`, 0 stays `"0"`.
  No API call: negation is a display edit, not an arithmetic operation.
- clear (AC): initial state, but keep `nextRequestId` so a late response
  from before the reset is dropped.

Operators and equals:

- operator `op`, when `awaitingOperand`: replace the top operator (iOS
  behaviour for `5 + ×`). Otherwise `startReduction({kind:'operator', op})`.
- equals, empty stack: `entry = null` (freeze the current value as a result).
  Otherwise `startReduction({kind:'equals'})`. Repeating `=` does nothing;
  iOS "repeat last operation" is out of scope.
- unary `op`: emit `{op, operands:[value], after:{kind:'unary'}}`, status
  `computing`. The stack is untouched, so `2 + 9 √ =` gives 5.

`startReduction(state, after)`:

1. `top = stack.at(-1)`. If `top` exists and (`after.kind === 'equals'` or
   `shouldReduce(top.op, after.op)`): emit
   `{op: top.op, operands: [top.value, value], after}`, status `computing`.
2. Otherwise, for `operator`: push `{value, op}`, `awaitingOperand = true`,
   `entry = null`, display unchanged (shows the left operand, as iOS does).
   For `equals` with an empty stack: `entry = null`, status `idle`.

Results:

- `resolved(id, v)` with `id !== request.id` → ignored. Otherwise pop the
  reduced top, set `value = v`, `display = formatNumber(v)`, `entry = null`,
  `awaitingOperand = false`, clear the request, then: `unary` → idle;
  `operator` or `equals` → `startReduction(after)` again, which either emits
  the next request or finishes.
- `failed(id, message)` with matching id → status `error`, display shows the
  message, stack emptied, request cleared.

Precedence is delivered in two commits so the second can be reverted alone:

- v1, single pending operator: `shouldReduce` returns `true` always, so the
  stack never holds more than one entry and `2 + 3 × 4 =` gives 20.
- v2, precedence: `prec(add) = prec(subtract) = 1`, `prec(multiply) =
  prec(divide) = 2`, `prec(power) = 3`. `shouldReduce(top, incoming) =
  prec(top) > prec(incoming) || (prec(top) === prec(incoming) && incoming !==
  'power')`. Power is right-associative: `2 ^ 3 ^ 2 = 512`. `2 + 3 × 4 =`
  gives 14 with two sequential requests; `2 × 3 + 4` reduces to 6 when `+`
  is pressed, then pushes `6 +`.

### 7.5 `format.ts`

`formatNumber(n: number): string`

- `n === 0` (including −0) → `"0"`.
- `|n| ≥ 1e12` or `|n| < 1e-9` → `n.toExponential(11)` with trailing zeros
  (and a dangling `.`) stripped from the mantissa: `1e+21`, `1.23456789012e+14`.
- Otherwise `Number(n.toPrecision(12)).toString()`: `0.1 + 0.2` → `"0.3"`,
  `1/3` → `"0.333333333333"`, `100/3` → `"33.3333333333"`.

### 7.6 `useCalculator` and `useKeyboard`

```ts
export function useCalculator(client = calculate): {
  display: string; status: State['status']; press: (key: Key) => void;
}
```

`useReducer` plus one `useEffect` keyed on `state.request`: create an
`AbortController`, call `client(req.op, req.operands, {signal})`, dispatch
`resolved` or `failed` (ApiError → its message with the first letter
capitalised; NetworkError → "Backend unreachable"; AbortError → nothing).
Cleanup aborts. This is the only place `fetch` is reached.

`useKeyboard(press, enabled)`: window `keydown` listener. Map: `0-9`,
`.`, `+ - * / ^ %`, `Enter` and `=` → equals, `Escape` → clear,
`Backspace`, `s` → sqrt. Ignored when Ctrl/Meta/Alt is held. Handled keys
call `preventDefault` (so `/` does not open quick-find in Firefox).

### 7.7 Components and layout

- `Calculator`: wires `useCalculator` and `useKeyboard`, renders `Display`
  and `Keypad`.
- `Display`: `role="status" aria-live="polite"`, right-aligned; a
  `data-length` attribute drives font shrinking (`>9` chars smaller, `>14`
  smallest); error state uses the error colour.
- `Keypad`: renders a static `KEY_LAYOUT` array (label, aria-label, Key,
  variant, span); `aria-busy` and disabled buttons while computing.
- `Key`: a `<button>` with `aria-label` for symbol keys and a `title` with
  the keyboard shortcut.

Grid, 4 columns:

```
AC   ⌫    %    ÷
√    xʸ   ±    ×
7    8    9    −
4    5    6    +
1    2    3    =   (= spans two rows)
0 (spans two)  .
```

Responsive: `max-width: 400px`, centred, keys `aspect-ratio: 1` with
`min-height: 48px`, fills a 320px-wide phone without horizontal scroll.
Colours via custom properties with a `prefers-color-scheme: dark` block.

Validation summary (frontend): the keypad is the input, so validation is the
entry rules above (digit limit, one decimal point, no leading zeros, no
operator without an operand) plus surfacing every backend error message and
network failure in the display.

## 8. Testing

Backend (`go test -race -cover ./...`, target ≥ 90% statements):

- `calc`: table-driven tests over all seven operations, happy paths with
  negatives and decimals, `divide` by 0 and −0, `sqrt(-1)`, `power`
  overflow and NaN, unknown operation, wrong arity for each operation, NaN
  and Inf operands, `Operations()` order and arity.
- `api`: `httptest` for each route; every error code and status listed in
  5.3; malformed JSON, unknown field, trailing data, oversized body, wrong
  method (405 + Allow), unknown path (404), `healthz`, `operations`;
  recover middleware returns JSON 500.
- `cmd/server`: `-healthcheck` probe against an `httptest` server.

Frontend (`vitest run --coverage`, thresholds 85% lines and statements):

- `reducer.test.ts`: entry rules, negate, backspace, clear keeps the id
  counter, operator replacement, request emission sequences for
  `12 + 3 =`, `2 + 3 × 4 =` (v2: two requests, v1: still passes with
  immediate execution semantics adjusted in the precedence commit),
  `2 ^ 3 ^ 2 =` (v2), unary during pending operator, error state and
  recovery, stale and mismatched ids ignored, keys ignored while computing.
- `format.test.ts`: the examples in 7.5 plus −0, 2^40, 1e-10.
- `client.test.ts`: success, 422 with body → ApiError code/message, 500
  without JSON → ApiError UNKNOWN, fetch rejection → NetworkError, non-numeric
  result → INVALID_RESPONSE, abort.
- `Calculator.test.tsx` with a mocked `fetch`: `12 + 3 = 15`, `2 + 3 × 4 =
  14` (two calls, in order), divide by zero shows "Cannot divide by zero" and
  AC recovers, network failure shows "Backend unreachable", keyboard input,
  keypad disabled while a request is pending.

Coverage report: `make coverage` produces `backend/coverage.out`,
`backend/coverage.html` and `frontend/coverage/` (HTML + text summary). All
are gitignored. The README carries a table with the final numbers and the
date; CI uploads both reports as workflow artifacts.

## 9. Docker and Compose

- `backend/Dockerfile`: multi-stage, static binary, distroless nonroot,
  `EXPOSE 8080`, `ENTRYPOINT ["/server"]`.
- `frontend/Dockerfile`: `node:24-alpine` build (`npm ci && npm run build`)
  → `nginx:alpine` with `nginx.conf`: serve `/usr/share/nginx/html`,
  `location /api/ { proxy_pass http://backend:8080; }`,
  `location /healthz { return 200 'ok'; }`, `try_files $uri /index.html`.
- `docker-compose.yml` (deploy-ready, no host ports):
  - `backend`: build, `expose: ["8080"]`, `restart: unless-stopped`,
    healthcheck `["CMD", "/server", "-healthcheck"]` every 30s, timeout 3s,
    retries 3, start_period 5s; `deploy.resources.limits.memory: 128M`.
  - `frontend`: build, `expose: ["80"]`, `depends_on: backend:
    condition: service_healthy`, healthcheck
    `["CMD", "wget", "-qO-", "http://127.0.0.1/healthz"]` same timings;
    memory limit `64M`.
- `docker-compose.override.yml` (picked up automatically by `docker compose
  up`, ignored by Coolify which runs the main file explicitly): publishes
  `3000:80` for the frontend and `8080:8080` for the backend.
- `docker compose up --build` → http://localhost:3000.

## 10. CI and deployment

### 10.1 GitHub Actions (`.github/workflows/ci.yml`)

Triggers: `push` to `main`, `pull_request`. Jobs:

1. `backend`: `actions/setup-go` with `go-version-file: backend/go.mod`;
   `gofmt -l` must be empty; `go vet ./...`; `go test -race
   -coverprofile=coverage.out ./...`; upload `coverage.out` as artifact.
2. `frontend`: `actions/setup-node` 24 with npm cache; `npm ci`; `npm run
   lint`; `npm run typecheck`; `npm run test:coverage`; upload `coverage/`.
3. `docker`: `docker compose build`.
4. `deploy`: `needs: [backend, frontend, docker]`, runs only when
   `github.event_name == 'push' && github.ref == 'refs/heads/main'`,
   environment `production`. One step:
   `curl --fail-with-body -X POST "$COOLIFY_WEBHOOK_URL" -H "Authorization: Bearer $COOLIFY_TOKEN"`.
   Secrets `COOLIFY_TOKEN` and `COOLIFY_WEBHOOK_URL` are set by the user with
   `gh secret set` in their own terminal, never pasted into chat (PROMPTS.md
   records every chat message verbatim).

### 10.2 Coolify (live demo)

- Server `oracle-server`, panel https://coolify.ozgurgurcan.com. New project
  `calculator-fullstack`, environment `production`, following the one
  project per app convention.
- Resource: Docker Compose application from the public GitHub repository
  `zgrgrcn/calculator-fullstack`, branch `main`, compose file
  `/docker-compose.yml`. Created through the Coolify API
  (`POST /api/v1/applications/public` with `build_pack: dockercompose`); if
  the API rejects that shape, created in the panel instead.
- Domain `https://calculator.ozgurgurcan.com` on the `frontend` service, port
  80. `*.ozgurgurcan.com` already resolves through Cloudflare (verified
  2026-10-21), so Traefik and TLS work as for the other apps. The backend is
  internal only.
- Coolify's own push-to-deploy stays off; CI triggers the deploy webhook
  after tests pass. The webhook token is a Coolify API token with only the
  `deploy` ability, created by the user in the panel.
- Healthchecks come from the compose file (the Go binary probes itself, nginx
  uses busybox wget), so the "image has no curl" trap from the Coolify notes
  does not apply.

## 11. Documentation

`README.md` sections, in order: title + live demo link; overview with the
architecture diagram; quick start (`docker compose up --build`); running
backend and frontend separately; API reference with the curl examples from
section 6 and the error table; design decisions and assumptions (section
12); testing and coverage table; deployment (Coolify, CI webhook, secrets);
project structure; AI usage with a link to `PROMPTS.md`; cut list and what
would come next.

`PROMPTS.md`: append-only log of every message sent to Claude Code during
the assignment, verbatim, including multiple-choice picks, each with a
one-line italic note of the question it answered.

## 12. Decisions and assumptions

1. Percentage is unary, `a ÷ 100`, like the iOS calculator `%` key.
2. Operator precedence as on iOS (`2 + 3 × 4 = 14`); power is
   right-associative (`2 ^ 3 ^ 2 = 512`) as on scientific calculators.
3. Negation is local; every other operation, including unary ones, goes
   through the API.
4. No repeat-equals, no history, no memory keys.
5. Numbers are float64 end to end; the API returns raw values and the UI
   rounds to 12 significant digits for display. Entry is capped at 15 digits.
6. 400 for malformed requests, 422 for impossible mathematics, JSON on every
   response including 404, 405, 413 and 500.
7. No CORS: same-origin via Vite proxy (dev) and nginx (prod). Calling the
   API from another origin needs a CORS middleware, documented as a one-line
   addition in the README.
8. The precedence feature lands as its own commit so it can be reverted.
9. Backend image is distroless and self-probing; compose has healthchecks
   and memory limits; no host ports in the deploy file.

## 13. Delivery order and time budget

| Step | Commit | Est. |
|---|---|---|
| 1 | docs: design spec, prompt log, gitignore (this commit) | done |
| 2 | chore: scaffold Go module and Vite app, Makefile | 15 min |
| 3 | feat(backend): calc package with tests | 20 min |
| 4 | feat(backend): HTTP API, middleware, server, tests | 30 min |
| 5 | feat(frontend): client, format, reducer v1 (single pending operator), tests | 35 min |
| 6 | feat(frontend): keypad UI, hook, keyboard, component tests | 40 min |
| 7 | feat(frontend): operator precedence, right-associative power (revertable) | 20 min |
| 8 | build: Dockerfiles, compose with healthchecks and limits | 20 min |
| 9 | ci: test, build and deploy workflow | 15 min |
| 10 | docs: README with coverage numbers | 25 min |
| 11 | deploy: Coolify app, secrets, first webhook deploy, live link in README | 20 min |

Total about 4 hours of implementation. Cut list if over budget, in order:
step 7 (precedence), keyboard shortcuts, CI docker job, `GET /operations`,
dark mode.
