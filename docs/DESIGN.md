# Calculator Full-Stack: Design

Date: 2026-10-21. Status: approved in review, implementation plan pending.

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

| Requirement                                    | Where it is met                                                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add, subtract, multiply, divide                | `calc` package; keypad `+ − × ÷`                                                                                                                  |
| Exponentiation, square root, percentage        | `calc` package; keypad `xʸ √ %`                                                                                                                   |
| Intuitive UI                                   | keypad that builds the expression in large type and evaluates on `=`, keyboard shortcuts, expression line above the display, history, five themes |
| Input validation and error handling (frontend) | entry rules in the reducer; API and network errors shown in the display                                                                           |
| Responsive design                              | CSS grid keypad from 320px up; measured display sizing; pills and a side-by-side layout on short and landscape phones; max-width 400px on desktop |
| Endpoints for operations                       | `POST /api/v1/evaluate` for a whole expression, `POST /api/v1/calculate` for one operation, `GET /api/v1/operations`, `GET /healthz`              |
| Validate input, division by zero, invalid data | request decoding, `expr` syntax checks and `calc` errors mapped to 400/422                                                                        |
| JSON results                                   | every response, including errors, is JSON                                                                                                         |
| Unit tests, both layers                        | Go `testing` + `httptest`; Vitest + Testing Library                                                                                               |
| End-to-end tests                               | `e2e/` Playwright scenarios against the compose stack (`make e2e`), a CI job the deploy depends on                                                |
| Mutation testing                               | `make mutate` on `internal/calc`, every mutant killed, its own CI job the deploy depends on                                                       |
| Coverage report                                | `make coverage`, README table, CI artifacts, 90% gates in both jobs                                                                               |
| Dockerfile for full stack                      | two Dockerfiles + `docker-compose.yml`                                                                                                            |
| Prompts shared                                 | `PROMPTS.md`, append-only, verbatim                                                                                                               |

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
│   ├── go.mod                      go 1.27, no third-party dependencies
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── api/client.ts           calculate(); ApiError, NetworkError
│   │   ├── calculator/types.ts     Key, Action, State, Request
│   │   ├── calculator/reducer.ts   pure state machine
│   │   ├── calculator/format.ts    formatNumber()
│   │   ├── calculator/useCalculator.ts   hook: reducer + client
│   │   ├── calculator/useOperations.ts   hook: GET /operations on mount
│   │   ├── calculator/useKeyboard.ts     keydown → Key
│   │   ├── components/             Calculator, Display, Keypad, Key
│   │   ├── App.tsx, main.tsx, index.css
│   │   └── test/setup.ts
│   ├── vite.config.ts              dev proxy, vitest config
│   ├── nginx.conf
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml              deploy-ready: no host ports
├── docker-compose.override.yml     local only: publishes frontend :3000 and backend :8080
├── .github/workflows/ci.yml
├── Makefile
├── README.md
├── PROMPTS.md
└── docs/DESIGN.md
```

## 5. Backend

### 5.1 Toolchain

- `go.mod` declares `go 1.27` (language version, no patch), as is conventional.
  Any toolchain ≥ 1.27.0 on PATH is used as is; this machine's Homebrew Go is
  1.27.3. With the default `GOTOOLCHAIN=auto`, an older local Go switches to
  the minimum, go1.27.0, and downloads it (verified on 2026-10-21 with the
  1.22.12 binary in /usr/local/go). Docker and CI resolve `1.27` to the newest
  patch. A developer who wants the newest patch locally upgrades Go; no system
  change is needed to build.
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

| Operation  | Arity | Result         | Errors                                                           |
| ---------- | ----- | -------------- | ---------------------------------------------------------------- |
| add        | 2     | a + b          | not finite                                                       |
| subtract   | 2     | a − b          | not finite                                                       |
| multiply   | 2     | a × b          | not finite                                                       |
| divide     | 2     | a ÷ b          | b == 0 (including −0) → `ErrDivisionByZero`; not finite          |
| power      | 2     | math.Pow(a, b) | NaN or ±Inf (0⁻¹, (−8)^(1/3), 10^400) → `ErrNotFinite`           |
| sqrt       | 1     | math.Sqrt(a)   | a < 0 → `ErrInvalidOperand` ("square root of a negative number") |
| percentage | 1     | a ÷ 100        | none                                                             |

Rules:

- Unknown operation → `ErrUnknownOperation`; wrong operand count →
  `ErrOperandCount` wrapped with detail, so the message reads "wrong number
  of operands: sqrt expects 1 operand, got 2".
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

| Pattern                                | Behaviour                              |
| -------------------------------------- | -------------------------------------- |
| `POST /api/v1/calculate`               | decode, call `calc.Calculate`, respond |
| `/api/v1/calculate` (any other method) | 405 JSON with `Allow: POST`            |
| `GET /api/v1/operations`               | `{"operations": calc.Operations()}`    |
| `GET /healthz`                         | `{"status":"ok"}`                      |
| `/` (everything else)                  | 404 JSON                               |

Request handling for `calculate`:

1. `http.MaxBytesReader` at 1 MiB → 413 `PAYLOAD_TOO_LARGE`.
2. `json.Decoder` with `DisallowUnknownFields`; body must be exactly one JSON
   object (a second `Decode` must return `io.EOF`). Decode failures → 400
   `INVALID_REQUEST` with a safe message: "invalid JSON body"; "operands must
   be numbers within float64 range" for an `UnmarshalTypeError` on operands,
   which is also how out-of-range literals such as `1e999` surface; "body must
   contain a single JSON object".
3. Empty `operation` → 400 `INVALID_REQUEST` ("operation is required").
   Missing or null `operands` is an empty list and fails the arity check.
4. `calc.Calculate` errors map via `errors.Is`:

| calc error            | HTTP | code                      |
| --------------------- | ---- | ------------------------- |
| `ErrUnknownOperation` | 400  | `UNKNOWN_OPERATION`       |
| `ErrOperandCount`     | 400  | `INVALID_OPERAND_COUNT`   |
| `ErrInvalidOperand`   | 422  | `INVALID_OPERAND`         |
| `ErrDivisionByZero`   | 422  | `DIVISION_BY_ZERO`        |
| `ErrNotFinite`        | 422  | `RESULT_NOT_FINITE`       |
| anything else         | 500  | `INTERNAL_ERROR` (logged) |

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
# 400 {"error":{"code":"INVALID_OPERAND_COUNT","message":"wrong number of operands: sqrt expects 1 operand, got 2"}}

curl -s localhost:8080/api/v1/operations
# {"operations":[{"name":"add","arity":2,"symbol":"+"}, ...]}
```

Numbers are IEEE 754 doubles, returned raw. `0.1 + 0.2` is
`0.30000000000000004` at the API; display rounding is the client's job.
Integers are exact up to 2^53. A literal outside float64 range such as `1e999`
never reaches `calc`: `encoding/json` rejects it with an `UnmarshalTypeError`
and leaves the field untouched (verified on Go 1.27.3, with and without
`GOEXPERIMENT=jsonv2`), so the API answers 400 `INVALID_REQUEST` with
"operands must be numbers within float64 range". The non-finite operand check
in `calc` stays as a guard for direct Go callers.

## 7. Frontend

### 7.1 Toolchain

Vite 8 `react-ts` template: React 19, TypeScript 6, oxlint (the linter the
template ships), Prettier matching the template style (no semicolons, single
quotes). Tests: Vitest 5, `@testing-library/react`,
`@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`,
`@vitest/coverage-v8`. Plain CSS with custom properties; no UI library.

`vite.config.ts` proxies `/api` to `VITE_API_PROXY_TARGET` (default
`http://localhost:8080`) and holds the Vitest config (jsdom, setup file,
v8 coverage, thresholds: 85% lines and statements).

Scripts: `dev`, `build` (`tsc -b && vite build`), `preview`, `lint`,
`typecheck`, `format`, `test` (`vitest run`), `test:watch`, `test:coverage`.

### 7.2 `api/client.ts`

```ts
export type OperationName =
  "add" | "subtract" | "multiply" | "divide" | "power" | "sqrt" | "percentage";
export class ApiError extends Error {
  code: string;
  status: number;
}
export class NetworkError extends Error {}
export async function calculate(
  operation: OperationName,
  operands: number[],
  options?: { signal?: AbortSignal; baseUrl?: string },
): Promise<number>;

export interface OperationSpec {
  name: OperationName;
  arity: 1 | 2;
  symbol: string;
}
export async function operations(options?: {
  signal?: AbortSignal;
  baseUrl?: string;
}): Promise<OperationSpec[]>;
```

- POST `${baseUrl}/api/v1/calculate`, `baseUrl` defaults to `''` (same origin).
- `fetch` rejection → `NetworkError('Backend unreachable')`. Abort propagates
  as the DOM `AbortError` (the hook ignores it).
- Non-2xx: parse `{error:{code,message}}` → `ApiError`; unparsable body →
  `ApiError('UNKNOWN', 'HTTP <status>', status)`.
- 2xx: parse `{result}`; a missing or non-numeric result →
  `ApiError('INVALID_RESPONSE', ...)`.
- `operations()`: GET `${baseUrl}/api/v1/operations` with the same error
  mapping; a body whose `operations` is not an array → `INVALID_RESPONSE`.

### 7.3 Types

```ts
export type BinaryOp = "add" | "subtract" | "multiply" | "divide" | "power";
export type UnaryOp = "sqrt" | "percentage";

export type Key =
  | {
      type: "digit";
      value: "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
    }
  | { type: "decimal" }
  | { type: "negate" }
  | { type: "backspace" }
  | { type: "clear" }
  | { type: "operator"; op: BinaryOp }
  | { type: "unary"; op: UnaryOp }
  | { type: "equals" };

export type Action =
  | { type: "key"; key: Key }
  | { type: "resolved"; id: number; value: number }
  | { type: "failed"; id: number; message: string };

export type After =
  { kind: "operator"; op: BinaryOp } | { kind: "equals" } | { kind: "unary" };

export interface Request {
  id: number;
  op: BinaryOp | UnaryOp;
  operands: number[];
  after: After;
}
export interface PendingOperand {
  value: number;
  op: BinaryOp;
}
export type ExpressionToken =
  | { kind: "number"; text: string }
  | { kind: "operator"; op: BinaryOp }
  | { kind: "equals" };

export interface State {
  display: string; // text on screen: entry, formatted result, or error message
  entry: string | null; // digits being typed; null when display shows a result
  value: number; // numeric value of the current operand
  stack: PendingOperand[]; // left operands waiting for a right operand
  awaitingOperand: boolean; // true right after an operator key
  status: "idle" | "computing" | "error";
  request: Request | null; // at most one in flight
  nextRequestId: number; // monotonic, survives AC
  tokens: ExpressionToken[]; // what was pressed, for the expression line (added 2026-10-21)
}
```

Initial state: display `"0"`, entry `null`, value `0`, empty stack,
`awaitingOperand=false`, status `idle`, no request, `nextRequestId=1`.

### 7.4 Reducer (pure, no I/O)

`reduce(state, action): State`. While `computing`, every key except clear is
ignored. Clear resets the state and nulls the request, and the hook's effect
cleanup then aborts the fetch; that is the only recovery path when the
backend is slow rather than down. In `error`, only digit, decimal and clear
are accepted; digit and decimal start a fresh entry.

Entry editing:

- digit: entry `null` or `"0"` → replaced; otherwise appended. At most 15
  digit characters (`-` and `.` do not count); further digits are ignored.
  `value = Number(entry)`, `display = entry`.
- digit, decimal and negate all set `awaitingOperand = false`, so
  `5 + ± ×` computes `5 + (−5)` instead of replacing the operator.
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

- `resolved(id, v)` with no request or `id !== request.id` → ignored.
  Otherwise, for `operator` and `equals`, pop the reduced top (unary pushed
  nothing); then set `value = v`, `display = formatNumber(v)`, `entry = null`,
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

Expression line (added 2026-10-21): `tokens` records what was pressed and is
never consumed by evaluation, because the stack is. `formatExpression(state)`
in `expression.ts` is a pure function: tokens joined with spaces, then the
entry still being typed. Rules: an operator or `=` first commits the current
number (the entry, or the formatted value after an operator or a result);
emitting a request consumes the entry; a second operator replaces the last
operator token; a unary key writes its function form (`√(9)`, `50%`), nesting
on a unary result; a digit typed after a result starts a new expression, an
operator after a result continues from it (`5 +`); AC clears; a failed
expression stays visible until the next digit. So `2 + 3 ×` reads
"2 + 3 ×", and after `4 =` the line reads "2 + 3 × 4 =" while the display
shows 14.

### 7.5 `format.ts`

`formatNumber(n: number): string`

- `n === 0` (including −0) → `"0"`.
- `|n| ≥ 1e12` or `|n| < 1e-9` → `n.toExponential(11)` with trailing zeros
  (and a dangling `.`) stripped from the mantissa: `1e+21`, `1.23456789012e+14`.
- Otherwise `Number(n.toPrecision(12)).toString()`: `0.1 + 0.2` → `"0.3"`,
  `1/3` → `"0.333333333333"`, `100/3` → `"33.3333333333"`.

### 7.6 `useCalculator`, `useOperations` and `useKeyboard`

```ts
export function useCalculator(client = calculate): {
  display: string;
  status: State["status"];
  press: (key: Key) => void;
};
```

`useReducer` plus one `useEffect` keyed on `state.request`: create an
`AbortController`, call `client(req.op, req.operands, {signal})`, dispatch
`resolved` or `failed` (ApiError → its message with the first letter
capitalised; NetworkError → "Backend unreachable"; AbortError → nothing).
Cleanup aborts. This is the only place `fetch` is reached. There is no
client-side timeout: a slow request leaves the keypad disabled except for
AC, which aborts it.

`useOperations(client = operations)`: calls the backend once on mount, with
an `AbortController` cleanup, and returns `{ status: 'loading' | 'ready' |
'error', supported: ReadonlySet<OperationName> | null, reload: () => void }`.
`Calculator` passes `supported` to `Keypad`, which disables the keys of
operations the backend does not list (title "Not supported by the backend").
While loading or after a failure every key stays enabled, so a key press
surfaces the real error through the reducer path. On failure a status line
under the display reads "Backend unreachable" with a Retry button that calls
`reload()`. This makes `GET /api/v1/operations` the startup handshake: the
UI advertises only what the backend can do.

`useKeyboard(press, enabled)`: window `keydown` listener. Map: `0-9`,
`.`, `+ - * / ^ %`, `Enter` and `=` → equals, `Escape` → clear,
`Backspace`, `s` → sqrt. Ignored when Ctrl/Meta/Alt is held. Handled keys
call `preventDefault` (so `/` does not open quick-find in Firefox).

### 7.7 Components and layout

- `Calculator`: wires `useCalculator`, `useOperations` and `useKeyboard`;
  renders `Display`, the backend status line and `Keypad`.
- `ExpressionLine`: the small muted line above the display with
  `formatExpression(state)`; `data-testid="expression"`.
- `Display`: `role="status" aria-live="polite"`, right-aligned; a
  `data-length` attribute drives font shrinking (`>9` chars smaller, `>14`
  smallest); error state uses the error colour.
- `Keypad`: renders a static `KEY_LAYOUT` array (label, aria-label, Key,
  variant, span); `aria-busy` and disabled buttons while computing;
  operation keys absent from `supported` are disabled.
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

### 7.8 Themes (added 2026-10-22)

`src/theme/themes.ts` names five themes (`ios` default, `netflix`,
`spotify`, `vscode`, `claude`), reads and stores the choice in
`localStorage` under `calculator.theme`, and applies it as `data-theme` on
the document. `useTheme` owns the choice; `ThemePicker` is a `radiogroup`
of round swatches fixed in the bottom-right corner (since 2026-10-22; it
started as a `<select>` above the expression line), each in its theme's
accent colour from CSS keyed on `data-swatch`, with a ring on the active
one. Phones get 60px of bottom padding so the keypad clears the fixed row,
which also holds a small `source` link to the repository bottom-left. Every look is CSS:
`:root[data-theme='…']` blocks in `index.css` redefine the same custom
properties plus `--font`, so components hold no colours and no theme
checks. The iOS look stays on `:root` with its `prefers-color-scheme` dark
block. One test covers selecting a theme and surviving a reload.

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
  `12 + 3 =`; `2 + 3 × 4 =` in both versions: v1 emits `add(2,3)` then
  `multiply(5,4)` and shows 20, and the precedence commit changes the
  assertion to `multiply(3,4)` then `add(2,12)` and 14 (two requests either
  way; order and result differ); `2 ^ 3 ^ 2 =` (v2 only, 512); unary during
  a pending operator; error state and
  recovery, stale and mismatched ids ignored, keys ignored while computing.
- `format.test.ts`: the examples in 7.5 plus −0, 2^40, 1e-10.
- `client.test.ts`: success, 422 with body → ApiError code/message, 500
  without JSON → ApiError UNKNOWN, fetch rejection → NetworkError, non-numeric
  result → INVALID_RESPONSE, abort; `operations()` success and a non-array
  body → INVALID_RESPONSE.
- `Calculator.test.tsx` with a mocked `fetch`: `12 + 3 = 15`, `2 + 3 × 4 =
14` (two calls, in order), divide by zero shows "Cannot divide by zero" and
  AC recovers, network failure shows "Backend unreachable", keyboard input,
  keypad disabled while a request is pending, `xʸ` disabled when the mocked
  operations list omits `power`, a failed mount request shows the status
  line and Retry clears it after a successful reload.

Coverage report: `make coverage` produces `backend/coverage.out`,
`backend/coverage.html` and `frontend/coverage/` (HTML + text summary). All
are gitignored. The README carries a table with the final numbers and the
date; CI uploads both reports as workflow artifacts.

Added 2026-10-22: CI fails below 90% coverage on both layers (vitest
thresholds; `go tool cover -func` parsed in the workflow), prints both
percentages in the job summary; `e2e/` holds four Playwright scenarios run
against the compose stack by the `e2e` job, which the deploy job needs;
`backend/tools/mutate` mutation-tests `internal/calc` (operator and constant
flips, 47 mutants, all killed) in its own `mutate` job, also required by
deploy, and via `make mutate`.

## 9. Docker and Compose

- `backend/Dockerfile`: multi-stage, static binary, distroless nonroot,
  `EXPOSE 8080`, `ENTRYPOINT ["/server"]`.
- `frontend/Dockerfile`: `node:24-alpine` build (`npm ci && npm run build`)
  → `nginx:alpine` with `nginx.conf`: serve `/usr/share/nginx/html`,
  `location /api/ { proxy_pass http://backend:8080; }`,
  `location /healthz { return 200 'ok'; }`, `try_files $uri /index.html`.
- `docker-compose.yml` (deploy-ready, no host ports):
  - `backend`: build, `expose: ["8080"]`, `restart: unless-stopped`,
    healthcheck `["CMD", "/server", "-healthcheck"]` with `interval: 10s`,
    `timeout: 3s`, `retries: 3`, `start_period: 10s`, `start_interval: 2s`
    (Docker 25+; without it the first probe waits a full interval and
    `depends_on: service_healthy` delays nginx by that much);
    `deploy.resources.limits.memory: 128M`.
  - `frontend`: build, `expose: ["80"]`, `depends_on: backend:
condition: service_healthy`, healthcheck
    `["CMD", "wget", "-qO-", "http://127.0.0.1/healthz"]` same timings;
    memory limit `64M`.
- `docker-compose.override.yml` (picked up automatically by `docker compose
up`): publishes `3000:80` for the frontend and `8080:8080` for the backend.
  Coolify copies the main file into its own deployment directory and runs it
  with `-f`, which should skip the override; verify on the first deploy. If
  it is picked up anyway, rename it to `docker-compose.local.yml` and
  document `docker compose -f docker-compose.yml -f docker-compose.local.yml up`.
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
   `curl --fail-with-body -X POST "$COOLIFY_WEBHOOK_URL" -H "Authorization: Bearer $COOLIFY_TOKEN"`,
   which exits 0 with a notice while either secret is unset, so CI stays
   green before the Coolify app exists. Actions are pinned to their v7 majors.
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
  (`POST /api/v1/applications/public` with `build_pack: dockercompose`,
  `docker_compose_location: /docker-compose.yml` and `docker_compose_domains:
[{name: frontend, domain: https://calculator.ozgurgurcan.com}]`; fields
  verified against the Coolify OpenAPI spec on 2026-10-21). The deploy
  webhook is `POST /api/v1/deploy?uuid=<app uuid>`; GET is accepted too.
- Domain `https://calculator.ozgurgurcan.com` on the `frontend` service, port 80. `*.ozgurgurcan.com` already resolves through Cloudflare (verified
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
   API from another origin needs a small CORS middleware; the README says
   where it would go.
8. The precedence feature lands as its own commit so it can be reverted.
9. Backend image is distroless and self-probing; compose has healthchecks
   and memory limits; no host ports in the deploy file.
10. The frontend calls `GET /api/v1/operations` on mount and enables only
    the operation keys the backend advertises; the call doubles as a startup
    connectivity check, so the endpoint is not dead code.

## 13. Delivery order and time budget

| Step | Commit                                                                            | Est.   |
| ---- | --------------------------------------------------------------------------------- | ------ |
| 1    | docs: design spec, prompt log, gitignore (this commit)                            | done   |
| 2    | chore: scaffold Go module and Vite app, Makefile                                  | 15 min |
| 3    | feat(backend): calc package with tests                                            | 20 min |
| 4    | feat(backend): HTTP API, middleware, server, tests                                | 30 min |
| 5    | feat(frontend): client, format, reducer v1 (single pending operator), tests       | 35 min |
| 6    | feat(frontend): keypad UI, hooks, operations handshake, keyboard, component tests | 50 min |
| 7    | feat(frontend): operator precedence, right-associative power (revertable)         | 20 min |
| 8    | build: Dockerfiles, compose with healthchecks and limits                          | 20 min |
| 9    | ci: test, build and deploy workflow                                               | 15 min |
| 10   | docs: README with coverage numbers                                                | 25 min |
| 11   | deploy: Coolify app, secrets, first webhook deploy, live link in README           | 20 min |

Total about 4 hours of implementation. Cut list if over budget, in order:
step 7 (precedence), keyboard shortcuts, CI docker job, dark mode.

## 14. Evaluation model change (2026-10-22)

Supersedes the request-per-operation parts of sections 3, 5.3, 7.3 and 7.4;
the recording of the Google calculator is the reference.

- **Frontend builds, backend evaluates.** Keys only append to
  `tokens`: numbers (`{kind, text, value}`), operators, postfix unaries, and
  a closing `equals`. Nothing is sent until `=`, which places one request
  holding the whole token list (without `equals`). The frontend does no
  arithmetic; `±` edits the entry text only.
- **State** is `tokens`, `entry`, `lastResult`, `status`, `error`,
  `request`, `nextRequestId`. The operator stack, `awaitingOperand`,
  `shouldReduce` and the request chain are gone.
- **Display.** Main line: the expression while typing (`2 + 3 ×`), the
  answer after `=`, the error message after a failure. Small line: the
  evaluated or failed expression (`2 + 3 × 4 =`), otherwise `Ans = 14`.
  Both are pure functions of state (`mainText`, `secondaryText`).
- **Rules.** A second operator replaces a trailing one; an operator before
  any number starts from 0; `=` is ignored on an empty expression, on a
  trailing operator, and when repeated; after an answer a digit starts a new
  expression, an operator or unary continues from the answer, `±` starts
  from the negated answer; a unary wraps the entry or the closed operand
  before it and nests (`√(√(81))`); digits after a closed operand are
  ignored; backspace edits the entry, then removes tokens.
- **`POST /api/v1/evaluate`** takes `{tokens: [{type:number,value} |
{type:operator,op} | {type:unary,op}]}` and returns `{result}`.
  `internal/expr` parses with precedence climbing (`+ −` 1, `× ÷` 2, `^` 3
  right-associative, postfix unary tightest) and calls `calc.Calculate` for
  every step, so the error codes are shared; malformed lists are 400
  `INVALID_EXPRESSION`. `/calculate` and `/operations` are unchanged.

## 15. History (added 2026-10-22)

`src/history/history.ts` reads and writes `calculator.history` in
localStorage: an array of `{expression, result, at}`, newest first, capped
at 50, validated on read. `useHistory` owns the list; `useCalculator` takes
an `onResult` callback (read through a ref so a new identity never restarts
a request) and calls it with the formatted expression and result once an
answer is accepted. `HistoryPanel` is a `role="dialog"` listing
`expression = result` with Clear and Close; Escape closes it, and the
calculator's keyboard handling is disabled while it is open so Escape does
not also clear. The toolbar above the expression line holds the History
button and the theme picker.

## 16. Paint on equals (2026-10-22)

Paint flashing showed the whole keypad repainting on `=`. Measured cause:
the busy state set `disabled` on every key and the stylesheet dimmed
disabled keys, so all 22 keys repainted when the request started and again
when it resolved; the keyframes also animated `color`, which kept the small
line's animation on the main thread. Fixes: only keys the backend does not
offer are dimmed (`data-unsupported`); busy keys stay `disabled` for
semantics with no visual change; the keyframes animate transform and
opacity only, with `will-change` while they run; both lines have fixed
heights (`1.5rem`, `4.5rem`), never wrap, and clip overflowing text at its
start, so no text change can move the keypad. The keypad's position was
already stable across the animation; it stays so.

## 17. Panel (2026-10-22)

The expression line, the display and the keypad sit inside one `.panel`:
a 24px-radius rectangle with a 1px border at 12% of the text colour
(`color-mix`) and the theme's `--panel` background, 16px padding, inside the
unchanged 400px-wide column. The History button above it, the theme
swatches and the source link stay outside on the page background. The
backend alert and the history overlay got the same border, and the alert
uses the page background, so they stay visible on the panel.

## 18. Icons, tooltips and key press feedback (2026-10-22)

- The source link is the GitHub mark as an inline SVG, `aria-label` and
  tooltip "Source on GitHub", still fixed bottom-left and opening a new tab.
- Tooltips are CSS: a `[data-tooltip]::after` pseudo-element that fades in
  on `:hover` and on `:focus-visible`, so keyboard users see the theme names
  on the swatches too; placement overrides keep them inside the viewport.
- The history control is a clock icon button inside the panel's top row,
  left of the expression line, in the expression's muted colour, with
  `aria-label` and tooltip "History".
- Key press feedback: the pressed key grows to 1.06 and lightens
  (`color-mix` of its `--key-bg` with white), then settles, over 120ms on
  transform and background-color only. `Calculator` counts presses per
  `keyId` for clicks and keyboard alike; the count's parity picks one of two
  identical animations so a repeated key replays. `prefers-reduced-motion`
  disables it. The old `:active` shrink is gone.

## 19. History dropdown (2026-10-22)

The history opens as `HistoryDropdown`, absolutely positioned under the
clock button inside a relative `.history-anchor`, over the display, instead
of a sheet at the bottom. Rows are buttons: choosing one dispatches the new
reducer action `insert`, which starts a new expression from the entry's
exact stored `value` (older entries without a value fall back to parsing the
text) and closes the dropdown. Clear and Close are icon buttons (broom, ×)
with `aria-label` and tooltips. The dropdown closes on Escape and on any
pointer-down outside the anchor; the clock button toggles it. The
calculator's keyboard handling stays disabled while it is open.

## 20. Random first-visit theme (2026-10-22)

`readStoredTheme` no longer defaults to iOS: when nothing valid is stored it
picks one of the five themes with `Math.random`, stores it immediately and
returns it, so a reload never re-rolls; a swatch pick replaces it as before.
iOS itself still follows the system light or dark preference when chosen.

## 21. Tooltips on touch, trash icon (2026-10-22)

On a phone the `:hover` tooltips stayed open after a tap, because touch
browsers keep the tapped element in the hover state until the next tap, and
they overlapped the display. The pseudo-element is now visible only while its
control carries `data-tooltip-open`, which `installTooltips`
(`src/tooltip/tooltips.ts`, installed once in `main.tsx`) sets and clears:

- Opens after `TOOLTIP_DELAY_MS` (400ms) when a mouse or pen enters the control
  (`pointerover`, ignoring moves between a control's own children) or when the
  control takes keyboard focus (`focusin` matching `:focus-visible`, and only
  while the last input was not a pointer press, so the dropdown's autofocused ×
  stays quiet after a click or tap). A `pointerover` whose `pointerType` is
  `touch` is ignored, so a tap never opens one.
- Closes the moment the pointer leaves, on any `pointerdown`, on Enter or Space
  release, on Escape, and when focus moves on; nothing reopens it until the
  pointer leaves and returns. The 120ms fade applies on the way in only.
- `aria-label`s are unchanged, so screen readers announce the same names.

The dropdown's Clear button shows a trash can instead of the broom: the same
inline SVG style, `aria-label` and tooltip.

## 22. Display sized by measurement (2026-10-23)

The main line chose its font size from the character count (9 and 14 as the
boundaries), which clipped valid results: `0.333333333333` is 14 characters,
got 2.5rem, and at that size overflowed the line from 12 characters on a 375px
phone, so the start-clipping ellipsis hid the leading `0.`. Every 12-digit
decimal result did this.

The size is now measured. `useFittedSize` (`src/components/useFittedSize.ts`)
applies each of seven buckets (`SIZES` in `size.ts`: normal 3.5rem, medium
3rem, small 2.5rem, compact 2rem, tiny 1.6rem, micro 1.2rem, nano 1rem) to the
display in turn
and keeps the first at which the text's box is no wider than the line that
clips it, measuring the browser's own layout, so every theme's font and every
viewport width is covered without guessing glyph widths. It runs in a layout
effect whenever the text changes, so no frame paints a wrong size, and again
from a `ResizeObserver` on the display and the line when the viewport or the
theme's font changes. Micro holds the longest result the formatter can
produce, 20 characters (`-0.00000123456789012`), inside a 320px viewport in
every theme's font; nano exists for `Cannot divide by zero`, which the
monospace VS Code font sets wider than micro allows there. Only an over-long
expression still clips at its start, as before. Both lines keep their fixed
heights. Error messages are capped at 1.6rem with `min()` and shrink below it
only when they must.

The expression line's bucket, which the `=` animation scales from, is no longer
computed from its text: `Display` reports its measured bucket through `onSize`,
`Calculator` remembers it while no result is shown, and passes it to
`ExpressionLine` as the size the expression had in the main line. The stylesheet
has an `--expression-scale` per bucket.

Tests: `size.test.ts` covers the bucket boundaries of `fitSize`;
`Display.test.tsx` stands in for layout with character widths of 0.6em and
checks that `0.333333333333` is whole at 320px (tiny) and at the desktop width
(compact), that the longest results and fifteen typed digits fit at 320px, that
an over-long expression falls back to nano and clips, that the error message
shrinks only as far as it must, and that a resize is measured again; three
Playwright tests check the real layout at a 320px viewport, one of them in the
monospace theme.

## 23. History shared across tabs (2026-10-23)

`useHistory` wrote its whole in-memory list to localStorage on every change,
so the last tab to finish a calculation overwrote whatever the others had
saved since it loaded, and a tab never saw the others' entries until a reload.

Now storage is the truth and each tab's list is a cache of it. `add` reads
the stored list at that moment, merges the new entry into it with
`mergeHistory` (union, newest first by `at`, an entry present in both kept
once, capped at 50), writes the result and shows it; it does not merge the
tab's own stale list, so a clear in another tab stays cleared. `clear` writes
an empty list. `subscribeHistory` listens for the browser's `storage` event,
which fires in every tab except the writer (with a null key when storage was
wiped), and replaces the list with what is stored. The hook subscribes on
mount and unsubscribes on unmount. When storage cannot be written (private
mode, blocked, full) `writeHistory` returns false and the entry is merged into
the tab's own list instead, so history still lasts for the page.

`useHistory.test.ts` mounts two hooks on the shared jsdom storage as two tabs
and delivers the storage event by hand, since one window never fires it for
itself: both writers' entries survive, a tab picks up the other's write, a
clear propagates and is not undone by the next write, writes from both tabs
order newest first under the cap, other keys are ignored, and the no-storage
fallback keeps the page's list.

## 24. Short viewports (2026-10-23)

At 320×568, 414×568 and 667×375 the column was taller than the viewport, so
the fixed swatches and GitHub mark sat over the bottom keypad row and a tap on
the decimal key could change the theme. 375×667 and up stay as they were; the
panel is never scaled.

- `@media (max-height: 660px)`: the keys stop being squares and become pills
  of height `clamp(40px, (100dvh − 250px) / 6, 56px)`, where 250px is
  everything else in the column (12px top and 60px bottom padding, the
  panel's padding and border, the top row, the display and the gaps), so six
  rows, the display and the reserved bottom row fit the viewport exactly. The
  panel's gap and padding drop to 8px and 12px, the `=` key spans its two rows
  as before, and `--expression-travel` follows the smaller gap. The column is
  pinned to the viewport height with the panel at the bottom, so the fixed row
  is reserved at every width, short desktop windows included.
- `@media (max-height: 460px) and (orientation: landscape)`: six rows cannot
  fit under the display, so the panel becomes a grid with the top row and the
  display in a left column and the keypad (four 60px columns, pills of
  `clamp(40px, (100dvh − 80px) / 6, 48px)`) on the right, 532px wide at most
  and centred. The swatches become a column fixed at the right edge, vertically
  centred, with their tooltips to the left; the GitHub mark stays bottom-left,
  and the column's side paddings (46px left, 58px right) keep the panel clear
  of both, down to 568×320.

Three Playwright tests load each of the three sizes and check from the laid-
out rectangles that nothing scrolls, every key is inside the viewport, none
intersects the swatches or the mark, and a click on the decimal key types `.`
without changing the theme; a fourth checks 375×667 still has round keys.

## 25. Enter on controls, reduced motion, nginx 413 (2026-10-23)

- `useKeyboard` listened for Enter on the window and prevented its default
  to evaluate, which also cancelled the activation of whatever button or link
  had focus: the history button, a swatch, Retry, a history entry, Clear or
  Close did nothing on Enter while Space worked. The handler now leaves Enter
  alone when the event comes from a button or link outside `.keypad`; on a
  keypad key, or with nothing focused, Enter still evaluates, and digits and
  operators typed while a swatch has focus still reach the calculator.
  `useKeyboard.test.ts` covers each case.
- The `prefers-reduced-motion` block sat before the `.key[data-pressed='0']`
  and `'1'` rules at equal specificity, so the press animation still played.
  The block is now the last rule in the stylesheet. A Playwright test
  emulates reduced motion and checks the pressed key's `animation-name` is
  `none`, after first seeing `key-press-a` or `-b` without it.
- nginx's default `client_max_body_size` of 1 MB cut a 1.1 MB POST off before
  the backend saw it, answering with its own HTML 413 page naming its
  version. `nginx.conf` now sets `server_tokens off`, allows bodies up to 2 MB
  on `/api/` so the backend's JSON 413 (its limit is 1 MiB) reaches the
  client, and answers anything larger itself with the same JSON body through
  `error_page 413`. Playwright posts 1.1 MB and 3 MB bodies and expects a JSON
  413 with `PAYLOAD_TOO_LARGE` and no digit in the `Server` header; through
  the dev server the backend answers both, through the compose stack nginx
  answers the second.

## 26. Playwright suite (2026-10-23)

The e2e package grew from one file of 15 scenarios into four files and four
projects, with a shared fixture.

- `tests/fixtures.ts` extends `test` so every browser context runs an init
  script that stores the iOS theme when nothing is stored: a first visit's
  random theme would otherwise change fonts and widths between runs. A theme a
  test picks afterwards is kept, which the reload scenario relies on.
- Projects: Desktop Chrome (1280×720), the original iPhone SE descriptor
  (320×568, touch, 2× screen, mobile user agent) forced onto Chromium so one
  browser install covers all four, a plain 320×568 window and a 667×375
  landscape one. `api.spec.ts` needs no viewport and runs in Desktop Chrome
  only; the two layout tests that set their own viewport (414×568, and
  375×667 keeping round keys) skip themselves elsewhere. 23 tests, 80 runs.
- `layout.spec.ts` runs one size check in every project from the laid-out
  rectangles: no overflow on either axis, every key inside the viewport and at
  least 44px on each side, no key intersecting the swatches or the GitHub
  mark, fifteen typed digits and `1 ÷ 3` unclipped, and the history dropdown's
  box inside the viewport.
- Scenarios added: `√ xʸ %` as postfix keys, `2 ^ 3 ^ 2 = 512`,
  `196 % × 5 = 9.8`, the negative square root and `10 ^ 400` errors with the
  backend's exact messages, continuing from `Ans`, `0.1 + 0.2 = 0.3`, a long
  expression clipped at its start with its end visible, the history round
  trip through a reload, two tabs in one context both keeping their results,
  Tab then Enter opening the history, the chosen theme surviving a reload, and
  reduced motion leaving no `CSSAnimation` anywhere after `=` (having first
  seen the key press animation without the preference).
- Config: `workers: 4` under `CI`, `globalTimeout` two minutes, 15s per test
  and 5s per expectation, so a hang fails fast. Locally the run takes about
  nine seconds against the compose stack.

The size check found that Desktop Chrome at 1280×720 scrolled by about 30px:
the 8vh top margin plus the 693px full-size column did not fit. `.calculator`
now sets `margin-top: min(8vh, max(0px, 100dvh − 693px))`, so the margin
shrinks before anything scrolls; windows at least 600px wide and at most
695px tall use the same compact keys as short phones; and the 60px bottom
reservation for the fixed row applies up to 747px wide, below which the swatch
row can sit under the 400px column. 1280×800 and 375×667 are unchanged.

## 27. Deployment as built (2026-10-23)

Moved from the README's Deployment section, which keeps a summary.

The live demo runs the compose stack on a self-hosted Coolify server as a
Docker Compose application built from this repository's `main` branch, with
the domain attached to the `frontend` service. The backend is reachable only
inside the compose network.

Deploys are gated by CI: the `deploy` job in
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs after the
backend, frontend, e2e and mutate jobs succeed on a push to `main` and calls
the Coolify deploy webhook. It needs two repository secrets, `COOLIFY_TOKEN`
(an API token with only the `deploy` ability) and `COOLIFY_WEBHOOK_URL`
(`https://<coolify>/api/v1/deploy?uuid=<app uuid>&force=false`), set with
`gh secret set`. While either is missing the job skips with a notice, so the
workflow stays green on forks.

Both containers define healthchecks and memory limits (128 MB backend, 64 MB
frontend); Coolify uses the compose healthchecks as-is. First deployed on
2026-10-21; every push to `main` that passes CI redeploys it.
[`deploy/coolify-create.sh`](../deploy/coolify-create.sh) creates the project
and the compose application through the Coolify API (idempotent; needs a
token with the root ability in `~/.config/coolify/token`) and prints the
webhook URL for the CI secret.

## 28. Next steps (2026-10-23)

Moved from the README's "What would come next", which keeps the list.

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

## 29. Repository layout as built (2026-10-23)

Section 4 is the layout the spec planned; this is the tree as it stands, moved
from the README's Project structure section, which keeps a one-paragraph shape.

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
docs/                  DESIGN.md (spec), UI.md (interface, themes, e2e list), PLAN.md, coverage.txt, media/
PROMPTS.md             every prompt used, verbatim
```
