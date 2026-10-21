# Calculator Full-Stack: Implementation Plan

Date: 2026-10-21. Source of truth for behaviour: [DESIGN.md](DESIGN.md). This
plan turns the spec into ordered tasks. One task is one commit on `main`,
pushed when its checks pass. Every task follows the same loop: write the
tests, watch them fail, implement, watch them pass, run the full check for
that layer, commit.

Conventions:

- Backend checks, run from `backend/`: `gofmt -l .` (must print nothing),
  `go vet ./...`, `go test -race -cover ./...`.
- Frontend checks, run from `frontend/`: `npm run typecheck`, `npm run lint`,
  `npm run format:check`, `npm test`.
- Commit messages use conventional commits and end with
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- `PROMPTS.md` gets every user message appended verbatim, in the commit that
  follows it.
- Facts verified while planning (2026-10-21): `npm create vite@latest -- --template react-ts`
  runs without prompts when stdin is `/dev/null` and yields Vite 8.3, React
  19.3, TypeScript 6.0 and oxlint 1.88; the Vitest 5 config in Task 1 was
  executed in a throwaway project with coverage thresholds, typecheck, oxlint
  and build all passing; image tags `golang:1.27-alpine`, `node:24-alpine`,
  `nginx:alpine` and `gcr.io/distroless/static-debian12:nonroot` exist;
  `actions/checkout`, `setup-go`, `setup-node` and `upload-artifact` are at v7.

| Task | Commit | Est. |
|---|---|---|
| 1 | chore: scaffold Go module, Vite app and Makefile | 15 min |
| 2 | feat(backend): calc package with operation registry and tests | 20 min |
| 3 | feat(backend): HTTP API with validation, error mapping and server | 35 min |
| 4 | feat(frontend): API client, display formatting and single-operator reducer | 35 min |
| 5 | feat(frontend): keypad UI, hooks, operations handshake and keyboard support | 50 min |
| 6 | feat(frontend): operator precedence with right-associative power | 15 min |
| 7 | build: Dockerfiles and compose with healthchecks and memory limits | 20 min |
| 8 | ci: test, build and deploy workflow | 15 min |
| 9 | docs: README with setup, API examples, design decisions and coverage | 25 min |
| 10 | deploy: Coolify compose app, secrets, first deploy, live check | 25 min |

Tasks 2–3 (backend) and 4–6 (frontend) touch disjoint directories and can
run in parallel. Tasks 7–10 depend on both.

---

## Task 1: Scaffold

**Files**

- Create `backend/go.mod`
- Create `frontend/` from the Vite template, then edit `package.json`,
  `vite.config.ts`, `index.html`, add `.prettierrc`, `.prettierignore`,
  `src/test/setup.ts`; delete template boilerplate
- Create `Makefile`, `README.md` (stub)

**Steps**

1. Backend module:

   ```bash
   mkdir -p backend && printf 'module github.com/zgrgrcn/calculator-fullstack/backend\n\ngo 1.27\n' > backend/go.mod
   ```

2. Frontend scaffold, from the repo root:

   ```bash
   npm create vite@latest frontend -- --template react-ts < /dev/null
   cd frontend && npm install && npm install -D vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event prettier
   rm -rf src/App.css src/assets README.md .gitignore
   ```

   The root `.gitignore` already covers `frontend/node_modules`, `dist` and
   `coverage`. Keep `public/favicon.svg` for now; Task 5 replaces it.

3. `frontend/package.json` scripts (keep the template's `dev`, `build`,
   `lint`, `preview`):

   ```json
   "typecheck": "tsc -p tsconfig.app.json --noEmit",
   "test": "vitest run",
   "test:watch": "vitest",
   "test:coverage": "vitest run --coverage",
   "format": "prettier --write .",
   "format:check": "prettier --check ."
   ```

4. `frontend/vite.config.ts` (verified shape):

   ```ts
   import { defineConfig } from 'vitest/config'
   import react from '@vitejs/plugin-react'

   export default defineConfig({
     plugins: [react()],
     server: {
       proxy: {
         '/api': {
           target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8080',
           changeOrigin: true,
         },
       },
     },
     test: {
       environment: 'jsdom',
       setupFiles: ['./src/test/setup.ts'],
       coverage: {
         provider: 'v8',
         include: ['src/**/*.{ts,tsx}'],
         exclude: ['src/main.tsx', 'src/**/*.test.{ts,tsx}', 'src/test/**'],
         reporter: ['text', 'html'],
         thresholds: { lines: 85, statements: 85 },
       },
     },
   })
   ```

5. `frontend/src/test/setup.ts`: `import '@testing-library/jest-dom/vitest'`.
   `frontend/.prettierrc`: `{ "semi": false, "singleQuote": true }`.
   `frontend/.prettierignore`: `dist`, `coverage`, `node_modules`.
   `frontend/index.html`: title `Calculator`, keep the viewport meta.
   `frontend/src/App.tsx`: temporary `export default function App() { return <h1>Calculator</h1> }`.
   `frontend/src/index.css`: empty for now.

6. Root `Makefile` (tabs, not spaces):

   ```makefile
   .PHONY: help backend frontend test test-backend test-frontend coverage lint docker-up docker-down
   help:            ## list targets
   	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*##' '{printf "  %-16s %s\n", $$1, $$2}'
   backend:         ## run the API on :8080
   	cd backend && go run ./cmd/server
   frontend:        ## run the Vite dev server on :5173
   	cd frontend && npm run dev
   test: test-backend test-frontend ## run all tests
   test-backend:
   	cd backend && go vet ./... && go test -race -cover ./...
   test-frontend:
   	cd frontend && npm run typecheck && npm run lint && npm test
   coverage:        ## write backend/coverage.html and frontend/coverage/
   	cd backend && go test -race -covermode=atomic -coverprofile=coverage.out ./... && go tool cover -html=coverage.out -o coverage.html && go tool cover -func=coverage.out | tail -1
   	cd frontend && npm run test:coverage
   lint:            ## formatting and static checks
   	cd backend && test -z "$$(gofmt -l .)" && go vet ./...
   	cd frontend && npm run lint && npm run format:check && npm run typecheck
   docker-up:       ## build and start the stack on http://localhost:3000
   	docker compose up --build -d
   docker-down:
   	docker compose down
   ```

7. Root `README.md` stub: title, one line pointing at `docs/DESIGN.md`,
   "README is written in Task 9".

**Verify**: `cd backend && go build ./...` (prints a "matched no packages"
warning, exit 0); `cd frontend && npm run typecheck && npm run lint && npm run format && npm run build`.

**Commit**: `chore: scaffold Go module, Vite app and Makefile`. Push.

---

## Task 2: `calc` package

**Files**: create `backend/internal/calc/calc.go`, `backend/internal/calc/calc_test.go`.

**Step 1, tests first.** Table-driven `TestCalculate` with these rows
(`wantErr` checked with `errors.Is`; floats compared exactly where exact,
otherwise `math.Abs(got-want) < 1e-12`):

| op | operands | want | wantErr |
|---|---|---|---|
| add | 1.5, 2.25 | 3.75 | |
| add | -1, 1 | 0 | |
| subtract | 5, 7.5 | -2.5 | |
| multiply | -3, 4 | -12 | |
| multiply | 1e308, 10 | | ErrNotFinite |
| divide | 10, 4 | 2.5 | |
| divide | 1, 0 | | ErrDivisionByZero |
| divide | 1, math.Copysign(0, -1) | | ErrDivisionByZero |
| power | 2, 10 | 1024 | |
| power | 2, 0.5 | math.Sqrt2 | |
| power | 0, -1 | | ErrNotFinite |
| power | -8, 1.0/3 | | ErrNotFinite |
| power | 10, 400 | | ErrNotFinite |
| sqrt | 144 | 12 | |
| sqrt | 0 | 0 | |
| sqrt | -1 | | ErrInvalidOperand |
| percentage | 50 | 0.5 | |
| percentage | -200 | -2 | |
| modulo | 1, 2 | | ErrUnknownOperation |
| add | 1 | | ErrOperandCount |
| add | (none) | | ErrOperandCount |
| sqrt | 1, 2 | | ErrOperandCount |
| add | NaN, 1 | | ErrInvalidOperand |
| add | +Inf, 1 | | ErrInvalidOperand |

Plus `TestOperandCountMessage` asserting the error text is exactly
`wrong number of operands: sqrt expects 1 operand, got 2` (and `2 operands`
for a binary op), and `TestOperations` asserting the seven specs in order
`add, subtract, multiply, divide, power, sqrt, percentage` with arities
`2,2,2,2,2,1,1` and symbols `+ − × ÷ ^ √ %`.

**Step 2**: `go test ./internal/calc/` fails to compile. Good.

**Step 3, implement** `calc.go` exactly as DESIGN.md 5.2 declares it. Shape:

```go
type spec struct {
	arity  int
	symbol string
	fn     func(args []float64) (float64, error)
}

var registry = map[Operation]spec{
	Add:        {2, "+", func(a []float64) (float64, error) { return a[0] + a[1], nil }},
	Subtract:   {2, "−", func(a []float64) (float64, error) { return a[0] - a[1], nil }},
	Multiply:   {2, "×", func(a []float64) (float64, error) { return a[0] * a[1], nil }},
	Divide:     {2, "÷", divide},
	Power:      {2, "^", func(a []float64) (float64, error) { return math.Pow(a[0], a[1]), nil }},
	Sqrt:       {1, "√", sqrt},
	Percentage: {1, "%", func(a []float64) (float64, error) { return a[0] / 100, nil }},
}

var order = []Operation{Add, Subtract, Multiply, Divide, Power, Sqrt, Percentage}

func Calculate(op Operation, operands []float64) (float64, error) {
	s, ok := registry[op]
	if !ok {
		return 0, fmt.Errorf("%w: %q", ErrUnknownOperation, op)
	}
	if len(operands) != s.arity {
		return 0, fmt.Errorf("%w: %s expects %s, got %d", ErrOperandCount, op, plural(s.arity, "operand"), len(operands))
	}
	for i, v := range operands {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return 0, fmt.Errorf("%w: operand %d is not a finite number", ErrInvalidOperand, i)
		}
	}
	result, err := s.fn(operands)
	if err != nil {
		return 0, err
	}
	if math.IsNaN(result) || math.IsInf(result, 0) {
		return 0, ErrNotFinite
	}
	return result, nil
}
```

`divide` returns `ErrDivisionByZero` when `b == 0` (this also catches −0).
`sqrt` returns `fmt.Errorf("%w: square root of a negative number", ErrInvalidOperand)`
for `a < 0`. `Operations()` maps `order` through `registry` into `[]Spec`.

**Step 4**: `go test -race -cover ./internal/calc/` passes; coverage should be
100% for this package.

**Commit**: `feat(backend): calc package with operation registry and tests`. Push.

---

## Task 3: HTTP API and server

**Files**: create `backend/internal/api/handler.go`, `errors.go`,
`middleware.go`, `handler_test.go`, `middleware_test.go`,
`backend/cmd/server/main.go`, `backend/cmd/server/main_test.go`.

**Step 1, tests first** (`handler_test.go`, using `httptest.NewRecorder` and
`NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)))`; a helper
`do(t, method, path, body string) (*httptest.ResponseRecorder, map[string]any)`):

- Happy path for each of the seven operations, asserting status 200, the
  `Content-Type: application/json; charset=utf-8` header, and the echoed
  `operation`, `operands`, `result`.
- Error matrix, each asserting status and `error.code`, and `error.message`
  where listed:

| body | status | code | message |
|---|---|---|---|
| divide [1,0] | 422 | DIVISION_BY_ZERO | cannot divide by zero |
| sqrt [-1] | 422 | INVALID_OPERAND | |
| power [10,400] | 422 | RESULT_NOT_FINITE | |
| modulo [1,2] | 400 | UNKNOWN_OPERATION | |
| sqrt [1,2] | 400 | INVALID_OPERAND_COUNT | wrong number of operands: sqrt expects 1 operand, got 2 |
| `{"operation":"add"}` | 400 | INVALID_OPERAND_COUNT | |
| `{"operands":[1,2]}` | 400 | INVALID_REQUEST | operation is required |
| `{"operation":"add","operands":["1","2"]}` | 400 | INVALID_REQUEST | operands must be numbers within float64 range |
| `{"operation":"add","operands":[1e999,1]}` | 400 | INVALID_REQUEST | operands must be numbers within float64 range |
| `{"operation":5,"operands":[1,2]}` | 400 | INVALID_REQUEST | operation must be a string |
| `{"operation":"add","operands":[1,2],"x":1}` | 400 | INVALID_REQUEST | unknown field "x" |
| `{"operation":"add","operands":[1,2]} {}` | 400 | INVALID_REQUEST | body must contain a single JSON object |
| `not json` | 400 | INVALID_REQUEST | invalid JSON body |
| 1 MiB + 1 byte body | 413 | PAYLOAD_TOO_LARGE | |

- `GET /api/v1/calculate` → 405, `Allow: POST`, code `METHOD_NOT_ALLOWED`.
- `GET /api/v1/operations` → 200, seven entries, first is
  `{name:add, arity:2, symbol:+}`; `POST` there → 405.
- `GET /healthz` → 200 `{"status":"ok"}`.
- `GET /nope` → 404 JSON, code `NOT_FOUND`.

`middleware_test.go`: a handler that panics returns 500 with code
`INTERNAL_ERROR` and the logger output contains `panic`; a normal request
logs `method=GET path=/healthz status=200`.

`main_test.go`: `probe(url)` returns 0 against an `httptest` server that
answers 200 and 1 against one that answers 503 or is closed.

**Step 2**: tests fail to compile.

**Step 3, implement.**

`errors.go`:

```go
type errorBody struct {
	Error apiError `json:"error"`
}
type apiError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func writeJSON(w http.ResponseWriter, status int, v any)
func writeError(w http.ResponseWriter, status int, code, message string)

// statusFor maps calc errors to HTTP status and code.
func statusFor(err error) (int, string) {
	switch {
	case errors.Is(err, calc.ErrUnknownOperation): return 400, "UNKNOWN_OPERATION"
	case errors.Is(err, calc.ErrOperandCount):     return 400, "INVALID_OPERAND_COUNT"
	case errors.Is(err, calc.ErrInvalidOperand):   return 422, "INVALID_OPERAND"
	case errors.Is(err, calc.ErrDivisionByZero):   return 422, "DIVISION_BY_ZERO"
	case errors.Is(err, calc.ErrNotFinite):        return 422, "RESULT_NOT_FINITE"
	default:                                       return 500, "INTERNAL_ERROR"
	}
}
```

`handler.go`:

```go
const maxBodyBytes = 1 << 20

func NewHandler(logger *slog.Logger) http.Handler {
	h := &handler{logger: logger}
	mux := http.NewServeMux()
	route(mux, "POST", "/api/v1/calculate", h.calculate)
	route(mux, "GET", "/api/v1/operations", h.operations)
	route(mux, "GET", "/healthz", h.healthz)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "no such route")
	})
	return recoverer(logger, requestLogger(logger, mux))
}

// route registers the method-specific pattern and a fallback that answers 405.
func route(mux *http.ServeMux, method, path string, fn http.HandlerFunc) {
	mux.HandleFunc(method+" "+path, fn)
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Allow", method)
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "use "+method)
	})
}
```

`calculate` decodes with `http.MaxBytesReader`, `DisallowUnknownFields`, and
a second `Decode` that must return `io.EOF`. Decode error mapping, in order:
`*http.MaxBytesError` → 413; `*json.UnmarshalTypeError` → 400 with
"operands must be numbers within float64 range" when `Field` starts with
`operands`, otherwise "operation must be a string"; message starting with
`json: unknown field` → 400 with that field quoted; anything else → 400
"invalid JSON body". Then `operation == ""` → 400 "operation is required".
Then `calc.Calculate`; on error `statusFor` decides, the message is
`err.Error()` for 4xx and "internal error" for 500 (logged). Success writes
`{operation, operands, result}`; a nil operands slice is written as `[]`.

`middleware.go`: `recoverer` (defer/recover → log with `debug.Stack()`,
`writeError(w, 500, "INTERNAL_ERROR", "internal error")`), `requestLogger`
(wrap `ResponseWriter` in `statusWriter{status: 200}`; after `next` log
`method`, `path`, `status`, `duration_ms`).

`cmd/server/main.go`: `-healthcheck` flag, `PORT` env (default `8080`),
JSON slog to stdout, `http.Server` with ReadHeader 5s / Read 10s / Write 10s
/ Idle 60s, `signal.NotifyContext` for SIGINT and SIGTERM, `Shutdown` with a
10s deadline. `probe(url string) int` does a GET with a 3s client timeout and
returns 0 only on 200.

**Step 4**: `go test -race -cover ./...` passes; `api` ≥ 90%. Manual smoke:
`go run ./cmd/server` in one shell, the curl examples from DESIGN.md §6 in
another, then Ctrl-C and confirm a clean "shutting down" log line.

**Commit**: `feat(backend): HTTP API with validation, error mapping and server`. Push.

---

## Task 4: Frontend core (client, format, reducer v1)

**Files**: create `frontend/src/api/types.ts`, `src/api/client.ts`,
`src/api/client.test.ts`, `src/calculator/types.ts`, `src/calculator/format.ts`,
`src/calculator/format.test.ts`, `src/calculator/reducer.ts`,
`src/calculator/reducer.test.ts`.

**Step 1, tests first.**

`format.test.ts`:

| input | expected |
|---|---|
| 0.1 + 0.2 | `0.3` |
| 1 / 3 | `0.333333333333` |
| 100 / 3 | `33.3333333333` |
| -0 | `0` |
| 2 ** 40 | `1.099511627776e+12` |
| 1e-10 | `1e-10` |
| 1e21 | `1e+21` |
| 123456789 | `123456789` |
| -2.5 | `-2.5` |
| 1e-7 | `1e-7` |

`client.test.ts` (stub `fetch` with `vi.stubGlobal`): `calculate` posts to
`/api/v1/calculate` with the JSON body `{operation, operands}` and the JSON
content-type, and resolves the `result`; a 422 body
`{error:{code:'DIVISION_BY_ZERO',message:'cannot divide by zero'}}` rejects
with `ApiError` carrying code, message and status 422; a 500 with a non-JSON
body rejects with `ApiError('UNKNOWN', 'HTTP 500', 500)`; a rejected fetch
rejects with `NetworkError` whose message is `Backend unreachable`; a 200
without a numeric `result` rejects with code `INVALID_RESPONSE`; an aborted
signal rejects with the `AbortError` itself; `operations()` gets
`/api/v1/operations` and resolves the array; a body whose `operations` is
not an array rejects with `INVALID_RESPONSE`; `baseUrl` is prefixed.

`reducer.test.ts`, driving `reduce` with a helper `press(state, ...keys)` and
asserting on `display`, `stack`, `request` and `status`:

1. Entry: `1 2 3` shows `123`; leading zero is replaced (`0 5` → `5`);
   `.` then `5` → `0.5`; a second `.` is ignored; the 16th digit is ignored;
   backspace removes the last character and `5 ⌫` → `0`; backspace after a
   result is ignored.
2. Negate: `5 ±` → `-5`, again → `5`; `0 ±` stays `0`; negating a result
   (entry null) formats the negated value; `5 + ± ×` emits `add(5, -5)`.
3. Clear: AC from any state returns to the initial display `0` but keeps
   `nextRequestId`; AC while `computing` clears `request` and the late
   `resolved` with the old id is ignored.
4. Operators: `5 +` pushes `{5, add}` and keeps the display `5`; `5 + ×`
   replaces the operator with `multiply`; `12 + 3 =` emits `add(12,3)` with
   after `equals`, then `resolved` shows `15` and empties the stack; `=`
   with an empty stack freezes the entry; a second `=` does nothing.
5. Chains (v1 semantics): `2 + 3 ×` emits `add(2,3)`; after `resolved(5)` the
   stack is `[{5, multiply}]` and the display `5`; then `4 =` emits
   `multiply(5,4)`; `resolved(20)` shows `20`.
6. Unary: `9 √` emits `sqrt(9)` with after `unary`; `2 + 9 √ =` resolves to
   `sqrt(9)` then `add(2,3)`; `50 %` emits `percentage(50)`.
7. Failure: `failed` with the matching id sets status `error`, display to
   the message and empties the stack; a digit then starts a fresh entry with
   status `idle`; operators are ignored in the error state; `failed` with a
   stale id is ignored.
8. Computing: every key except AC is ignored while a request is pending.

**Step 2**: tests fail.

**Step 3, implement.**

`api/types.ts`: `OperationName` union of the seven names and
`OperationSpec { name: OperationName; arity: 1 | 2; symbol: string }`.

`api/client.ts`:

```ts
export class ApiError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message)
    this.name = 'ApiError'
  }
}
export class NetworkError extends Error {
  constructor(message = 'Backend unreachable') {
    super(message)
    this.name = 'NetworkError'
  }
}
export interface RequestOptions { signal?: AbortSignal; baseUrl?: string }

export async function calculate(operation: OperationName, operands: number[], options: RequestOptions = {}): Promise<number> {
  const body = await send(`${options.baseUrl ?? ''}/api/v1/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation, operands }),
    signal: options.signal,
  })
  const result = isRecord(body) ? body.result : undefined
  if (typeof result !== 'number') throw new ApiError('INVALID_RESPONSE', 'Backend returned no result', 200)
  return result
}

export async function operations(options: RequestOptions = {}): Promise<OperationSpec[]> {
  const body = await send(`${options.baseUrl ?? ''}/api/v1/operations`, { signal: options.signal })
  const list = isRecord(body) ? body.operations : undefined
  if (!Array.isArray(list)) throw new ApiError('INVALID_RESPONSE', 'Backend returned no operations', 200)
  return list as OperationSpec[]
}

async function send(url: string, init: RequestInit): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch (err) {
    if (isAbortError(err)) throw err
    throw new NetworkError()
  }
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : {}
    throw new ApiError(
      typeof error.code === 'string' ? error.code : 'UNKNOWN',
      typeof error.message === 'string' ? error.message : `HTTP ${response.status}`,
      response.status,
    )
  }
  return body
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}
```

`calculator/types.ts`: as DESIGN.md §7.3, with `BinaryOp` and `UnaryOp`
derived from `OperationName` via `Extract`, plus
`type ReductionAfter = Exclude<After, { kind: 'unary' }>`.

`calculator/format.ts`:

```ts
export function formatNumber(n: number): string {
  if (n === 0) return '0'
  const abs = Math.abs(n)
  if (abs >= 1e12 || abs < 1e-9) {
    const [mantissa, exponent] = n.toExponential(11).split('e')
    return `${trimZeros(mantissa)}e${exponent}`
  }
  return Number(n.toPrecision(12)).toString()
}
function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s
}
```

`calculator/reducer.ts`, the whole state machine; `shouldReduce` is the only
line Task 6 changes:

```ts
export const MAX_DIGITS = 15

export function initialState(nextRequestId = 1): State {
  return { display: '0', entry: null, value: 0, stack: [], awaitingOperand: false, status: 'idle', request: null, nextRequestId }
}

// v1: a new operator always reduces the pending one first.
export function shouldReduce(_top: BinaryOp, _incoming: BinaryOp): boolean {
  return true
}

export function reduce(state: State, action: Action): State {
  switch (action.type) {
    case 'key': return onKey(state, action.key)
    case 'resolved': return onResolved(state, action.id, action.value)
    case 'failed': return onFailed(state, action.id, action.message)
  }
}

function onKey(state: State, key: Key): State {
  if (key.type === 'clear') return initialState(state.nextRequestId)
  if (state.status === 'computing') return state
  if (state.status === 'error' && key.type !== 'digit' && key.type !== 'decimal') return state
  switch (key.type) {
    case 'digit': return withEntry(state, appendDigit(state.entry, key.value))
    case 'decimal': return withEntry(state, appendDecimal(state.entry))
    case 'backspace': return state.entry === null ? state : withEntry(state, deleteLast(state.entry))
    case 'negate': return negate(state)
    case 'operator': return onOperator(state, key.op)
    case 'equals': return state.stack.length === 0 ? { ...state, entry: null } : startReduction(state, { kind: 'equals' })
    case 'unary': return emit(state, { op: key.op, operands: [state.value], after: { kind: 'unary' } })
  }
}

function withEntry(state: State, entry: string): State {
  return { ...state, entry, value: Number(entry), display: entry, awaitingOperand: false, status: 'idle' }
}
function appendDigit(entry: string | null, digit: string): string {
  if (entry === null || entry === '0') return digit
  if (entry === '-0') return '-' + digit
  if (entry.replace(/\D/g, '').length >= MAX_DIGITS) return entry
  return entry + digit
}
function appendDecimal(entry: string | null): string {
  if (entry === null) return '0.'
  return entry.includes('.') ? entry : entry + '.'
}
function deleteLast(entry: string): string {
  const next = entry.slice(0, -1)
  return next === '' || next === '-' ? '0' : next
}
function negate(state: State): State {
  if (state.entry !== null) {
    if (state.entry === '0') return { ...state, awaitingOperand: false }
    const entry = state.entry.startsWith('-') ? state.entry.slice(1) : '-' + state.entry
    return { ...state, entry, value: Number(entry), display: entry, awaitingOperand: false }
  }
  if (state.value === 0) return { ...state, awaitingOperand: false }
  const value = -state.value
  return { ...state, value, display: formatNumber(value), awaitingOperand: false }
}

function onOperator(state: State, op: BinaryOp): State {
  if (state.awaitingOperand && state.stack.length > 0) {
    const top = state.stack[state.stack.length - 1]
    return { ...state, stack: [...state.stack.slice(0, -1), { ...top, op }] }
  }
  return startReduction(state, { kind: 'operator', op })
}

function startReduction(state: State, after: ReductionAfter): State {
  const top = state.stack[state.stack.length - 1]
  if (top && (after.kind === 'equals' || shouldReduce(top.op, after.op))) {
    return emit(state, { op: top.op, operands: [top.value, state.value], after })
  }
  if (after.kind === 'operator') {
    return { ...state, stack: [...state.stack, { value: state.value, op: after.op }], awaitingOperand: true, entry: null, status: 'idle' }
  }
  return { ...state, entry: null, status: 'idle' }
}

function emit(state: State, request: Omit<Request, 'id'>): State {
  return { ...state, request: { id: state.nextRequestId, ...request }, status: 'computing', nextRequestId: state.nextRequestId + 1 }
}

function onResolved(state: State, id: number, value: number): State {
  if (!state.request || state.request.id !== id) return state
  const { after } = state.request
  const stack = after.kind === 'unary' ? state.stack : state.stack.slice(0, -1)
  const next: State = { ...state, stack, value, display: formatNumber(value), entry: null, awaitingOperand: false, status: 'idle', request: null }
  return after.kind === 'unary' ? next : startReduction(next, after)
}

function onFailed(state: State, id: number, message: string): State {
  if (!state.request || state.request.id !== id) return state
  return { ...state, status: 'error', display: message, stack: [], entry: null, awaitingOperand: false, request: null }
}
```

**Step 4**: `npm test` passes; `npm run typecheck`, `npm run lint`,
`npm run format:check` clean.

**Commit**: `feat(frontend): API client, display formatting and single-operator reducer`. Push.

---

## Task 5: Keypad UI, hooks, operations handshake, keyboard

**Files**: create `src/calculator/useCalculator.ts`, `useOperations.ts`,
`useKeyboard.ts`, `src/components/keys.ts`, `Key.tsx`, `Keypad.tsx`,
`Display.tsx`, `Calculator.tsx`, `Calculator.test.tsx`; rewrite `src/App.tsx`,
`src/index.css`; replace `public/favicon.svg` with a small inline-SVG
calculator glyph; set `index.html` `<title>Calculator</title>` and a
`theme-color` meta.

**Step 1, tests first** (`Calculator.test.tsx`). A `fakeBackend()` helper
stubs `fetch`: `GET /api/v1/operations` answers the seven specs (overridable),
`POST /api/v1/calculate` computes in JS (`add, subtract, multiply, divide,
power, sqrt, percentage`), answers 422 `DIVISION_BY_ZERO` with message
`cannot divide by zero` for `divide` by 0, and records every call. Keys are
clicked through `screen.getByRole('button', { name })` using the aria labels
from `keys.ts`; results are read from `screen.getByRole('status')`.

1. `1 2 + 3 =` shows `15`; one calculate call: `add [12,3]`.
2. `2 + 3 × 4 =` shows `20` with calls `add [2,3]` then `multiply [5,4]`
   (Task 6 changes this test to `14`, `multiply [3,4]` then `add [2,12]`).
3. `1 ÷ 0 =` shows `Cannot divide by zero`; `AC` shows `0`.
4. `fetch` rejecting on calculate shows `Backend unreachable`.
5. Keyboard: `userEvent.keyboard('12+3{Enter}')` shows `15`; `Escape` clears.
6. While a calculate call is pending (unresolved promise) the keypad has
   `aria-busy="true"` and the `7` key is disabled; `AC` stays enabled.
7. Operations handshake: when the operations list omits `power`, the
   `Power` button is disabled; when the mount request fails, the alert
   `Backend unreachable` with a `Retry` button is shown, and after clicking
   Retry against a now-working backend it disappears.

**Step 2**: tests fail.

**Step 3, implement.**

`useCalculator.ts`:

```ts
export function useCalculator(client: typeof calculate = calculate) {
  const [state, dispatch] = useReducer(reduce, 1, initialState)
  const { request } = state
  useEffect(() => {
    if (!request) return
    const controller = new AbortController()
    client(request.op, request.operands, { signal: controller.signal }).then(
      (value) => dispatch({ type: 'resolved', id: request.id, value }),
      (err: unknown) => {
        if (!isAbortError(err)) dispatch({ type: 'failed', id: request.id, message: toMessage(err) })
      },
    )
    return () => controller.abort()
  }, [request, client])
  const press = useCallback((key: Key) => dispatch({ type: 'key', key }), [])
  return { display: state.display, status: state.status, press }
}

export function toMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message.charAt(0).toUpperCase() + err.message.slice(1)
  if (err instanceof NetworkError) return err.message
  return 'Something went wrong'
}
```

`useOperations.ts`: state `result: { supported: ReadonlySet<OperationName> } | { error: true } | null`
plus an `attempt` counter; one effect keyed on `[client, attempt]` that
aborts on cleanup; `reload` sets `result` to `null` and bumps `attempt`.
Returns `{ status, supported, reload }` where `status` is derived
(`loading` while `result` is null).

`useKeyboard.ts`: a `KEYMAP: Record<string, Key>` for `0`–`9`, `.`, `+`,
`-`, `*`, `/`, `^`, `%`, `s` (sqrt), `Enter`, `=`, `Escape`, `Backspace`;
one `keydown` listener on `window`, skipped when `ctrlKey`, `metaKey` or
`altKey` is held; `preventDefault()` on handled keys.

`components/keys.ts`: `KEY_LAYOUT: KeyDef[]` in the DESIGN.md §7.7 grid
order, each `{ key, label, aria, variant: 'digit' | 'operator' | 'function',
shortcut?, colSpan?, rowSpan? }`. Aria labels: All clear, Backspace, Percent,
Divide, Square root, Power, Negate, Multiply, Subtract, Add, Equals, Decimal
point, and the digit itself for digits. `=` has `rowSpan: 2`, `0` has
`colSpan: 2`.

`Key.tsx`: a `<button type="button">` with `aria-label`, `title` showing the
shortcut, `disabled`, inline `gridColumn`/`gridRow` spans, class
`key key-<variant>`.

`Keypad.tsx`: `<div className="keypad" aria-busy={busy}>` mapping
`KEY_LAYOUT`; a key is disabled when `busy && key.type !== 'clear'`, or when
`supported` is set and the key is an operator or unary whose `op` is not in
it (then `title` is "Not supported by the backend").

`Display.tsx`: `<div role="status" aria-live="polite" className="display"
data-length={text.length} data-error={error || undefined}>{text}</div>`.

`Calculator.tsx`:

```tsx
export function Calculator() {
  const { display, status, press } = useCalculator()
  const ops = useOperations()
  useKeyboard(press)
  return (
    <main className="calculator">
      <Display text={display} error={status === 'error'} />
      {ops.status === 'error' && (
        <p className="backend-status" role="alert">
          Backend unreachable <button type="button" onClick={ops.reload}>Retry</button>
        </p>
      )}
      <Keypad onPress={press} busy={status === 'computing'} supported={ops.supported} />
    </main>
  )
}
```

`App.tsx` renders `<Calculator />`. `index.css`: custom properties for
background, key colours (digit, function, operator, disabled), text and
error; dark values under `@media (prefers-color-scheme: dark)`; body centres
`.calculator` with `max-width: 400px`, `padding: 16px`; `.display` is
right-aligned, `font-size: 3rem`, with `[data-length="10"]`-style shrinking
via `.display[data-length]` rules for lengths above 9 and above 14, and
`[data-error]` in the error colour; `.keypad` is `display: grid;
grid-template-columns: repeat(4, 1fr); gap: 12px`; `.key` has
`aspect-ratio: 1; min-height: 48px; border-radius: 50%` (spans use
`border-radius: 999px`), large font, `:disabled` dims.

**Step 4**: `npm run test:coverage` passes the 85% thresholds; `typecheck`,
`lint`, `format:check` clean. Manual check: backend on 8080, `npm run dev`,
open http://localhost:5173, run `12 + 3 =`, `1 ÷ 0 =`, keyboard entry, then
resize to 320px wide and confirm no horizontal scroll. Stop the backend and
confirm Retry recovers after restarting it.

**Commit**: `feat(frontend): keypad UI, hooks, operations handshake and keyboard support`. Push.

---

## Task 6: Operator precedence (revertable)

**Files**: modify `src/calculator/reducer.ts`, `reducer.test.ts`,
`components/Calculator.test.tsx`.

**Step 1, tests first** (reducer, v2 semantics):

- `2 + 3 ×` pushes without a request; stack `[{2, add}, {3, multiply}]`,
  display `3`.
- `2 + 3 × 4 =` emits `multiply(3,4)`, then after `resolved(12)` emits
  `add(2,12)`, then `resolved(14)` shows `14`.
- `2 × 3 + 4 =`: `+` emits `multiply(2,3)`; after `resolved(6)` the stack is
  `[{6, add}]` and the display `6`; `4 =` emits `add(6,4)`.
- `8 − 2 − 1 =` reduces left to right: `subtract(8,2)` then `subtract(6,1)`.
- `2 ^ 3 ^ 2 =`: second `^` pushes; `=` emits `power(3,2)` then `power(2,9)`;
  final display `512`.
- Calculator test 2 becomes `14` with calls `multiply [3,4]`, `add [2,12]`.

**Step 2**: the new tests fail, the v1 chain test fails.

**Step 3, implement** by replacing `shouldReduce`:

```ts
const PRECEDENCE: Record<BinaryOp, number> = { add: 1, subtract: 1, multiply: 2, divide: 2, power: 3 }

// Reduce the pending operator when it binds at least as tightly as the new
// one, except that power is right-associative (2 ^ 3 ^ 2 = 2 ^ 9).
export function shouldReduce(top: BinaryOp, incoming: BinaryOp): boolean {
  const t = PRECEDENCE[top]
  const i = PRECEDENCE[incoming]
  return t > i || (t === i && incoming !== 'power')
}
```

Update the v1 chain test to the v2 expectation.

**Step 4**: all frontend checks pass.

**Commit**: `feat(frontend): operator precedence with right-associative power`.
Push. Reverting this single commit restores four-function behaviour; the
README documents that.

---

## Task 7: Docker and Compose

**Files**: create `backend/Dockerfile`, `backend/.dockerignore`,
`frontend/Dockerfile`, `frontend/.dockerignore`, `frontend/nginx.conf`,
`docker-compose.yml`, `docker-compose.override.yml`.

`backend/Dockerfile`:

```dockerfile
FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/server /server
EXPOSE 8080
ENTRYPOINT ["/server"]
```

`frontend/Dockerfile`:

```dockerfile
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

`frontend/nginx.conf` (the resolver and variable keep nginx up when the
backend container is recreated with a new address):

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    resolver 127.0.0.11 valid=10s ipv6=off;

    location /healthz {
        access_log off;
        add_header Content-Type text/plain;
        return 200 'ok';
    }
    location /api/ {
        set $backend http://backend:8080;
        proxy_pass $backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    location / {
        try_files $uri /index.html;
    }
}
```

`docker-compose.yml`:

```yaml
services:
  backend:
    build: ./backend
    expose: ["8080"]
    environment:
      PORT: "8080"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "/server", "-healthcheck"]
      interval: 10s
      timeout: 3s
      retries: 3
      start_period: 10s
      start_interval: 2s
    deploy:
      resources:
        limits:
          memory: 128M
  frontend:
    build: ./frontend
    expose: ["80"]
    depends_on:
      backend:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1/healthz"]
      interval: 10s
      timeout: 3s
      retries: 3
      start_period: 10s
      start_interval: 2s
    deploy:
      resources:
        limits:
          memory: 64M
```

`docker-compose.override.yml`:

```yaml
services:
  backend:
    ports: ["8080:8080"]
  frontend:
    ports: ["3000:80"]
```

`.dockerignore` files: backend `coverage.*`; frontend `node_modules`, `dist`,
`coverage`.

**Verify**: `docker compose up --build -d`; within ~15 s `docker compose ps`
shows both `healthy`; `curl -s localhost:3000/healthz` → `ok`;
`curl -s -X POST localhost:3000/api/v1/calculate -H 'Content-Type: application/json' -d '{"operation":"divide","operands":[1,0]}'`
→ 422 JSON through nginx; `curl -s localhost:3000/` serves the app;
`docker stats --no-stream` shows the limits; `docker compose down`.

**Commit**: `build: Dockerfiles and compose with healthchecks and memory limits`. Push.

---

## Task 8: CI

**Files**: create `.github/workflows/ci.yml`.

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:
permissions:
  contents: read
jobs:
  backend:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: backend } }
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-go@v7
        with: { go-version-file: backend/go.mod }
      - run: test -z "$(gofmt -l .)"
      - run: go vet ./...
      - run: go test -race -covermode=atomic -coverprofile=coverage.out ./...
      - run: go tool cover -func=coverage.out | tail -1
      - uses: actions/upload-artifact@v7
        with: { name: backend-coverage, path: backend/coverage.out }
  frontend:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: frontend } }
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 24, cache: npm, cache-dependency-path: frontend/package-lock.json }
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check
      - run: npm run typecheck
      - run: npm run test:coverage
      - uses: actions/upload-artifact@v7
        with: { name: frontend-coverage, path: frontend/coverage }
  docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - run: docker compose build
  deploy:
    needs: [backend, frontend, docker]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Trigger Coolify deploy
        env:
          COOLIFY_TOKEN: ${{ secrets.COOLIFY_TOKEN }}
          COOLIFY_WEBHOOK_URL: ${{ secrets.COOLIFY_WEBHOOK_URL }}
        run: |
          if [ -z "$COOLIFY_TOKEN" ] || [ -z "$COOLIFY_WEBHOOK_URL" ]; then
            echo "::notice::Coolify secrets not set, skipping deploy"
            exit 0
          fi
          curl --fail-with-body -sS -X POST "$COOLIFY_WEBHOOK_URL" -H "Authorization: Bearer $COOLIFY_TOKEN"
```

**Verify**: push, then `gh run watch` until all four jobs are green (deploy
prints the skip notice until Task 10).

**Commit**: `ci: test, build and deploy workflow`. Push.

---

## Task 9: README

**Files**: rewrite `README.md`.

Sections, in order: title and live-demo link; what it is and the
architecture diagram from DESIGN.md §3; quick start with Docker
(`docker compose up --build`, then http://localhost:3000); running the
backend (`make backend`) and the frontend (`make frontend`) separately,
with `VITE_API_PROXY_TARGET`; API reference (endpoints table, the curl
examples from DESIGN.md §6, the error-code table from §5.3); design
decisions and assumptions (DESIGN.md §12, including the proxy-instead-of-CORS
decision and where a CORS middleware would go); testing and coverage (the
commands, then a table with the numbers from `make coverage`, dated);
deployment (Coolify compose app, CI webhook, the two secrets and how to set
them); project structure; AI usage (Claude Code, link to `PROMPTS.md` and
`docs/DESIGN.md`, `docs/PLAN.md`); what was cut and what would come next.

**Verify**: every command in the README runs as written from a fresh clone
(`git clone` into the scratchpad, follow the quick start).

**Commit**: `docs: README with setup, API examples, design decisions and coverage`. Push.

---

## Task 10: Coolify deployment

Prerequisites from the user, done in the Coolify panel and their own
terminal, never in chat:

1. An API token with the `root` ability (or one allowed to create resources)
   saved to `~/.config/coolify/token` with mode 600. Used once, locally, to
   create the project and application.
2. A second API token with only the `deploy` ability, stored with
   `gh secret set COOLIFY_TOKEN` (interactive prompt).

Steps:

1. Read the server UUID with the Coolify MCP `list_servers` tool and confirm
   no project named `calculator-fullstack` exists with `list_projects`.
2. Create the project and the application through the API, reading the token
   with `$(cat ~/.config/coolify/token)` and never printing it:
   `POST /api/v1/projects` `{name: "calculator-fullstack"}`, then
   `POST /api/v1/applications/public` with `project_uuid`, `server_uuid`,
   `environment_name: "production"`, `git_repository:
   "https://github.com/zgrgrcn/calculator-fullstack"`, `git_branch: "main"`,
   `build_pack: "dockercompose"`, `docker_compose_location:
   "/docker-compose.yml"`, `docker_compose_domains: [{name: "frontend",
   domain: "https://calculator.ozgurgurcan.com"}]`, `instant_deploy: false`.
   Check the exact field names against the OpenAPI spec saved at
   `scratchpad/coolify-openapi/openapi.yaml` before sending. Record the
   application UUID.
3. `gh secret set COOLIFY_WEBHOOK_URL --body "https://coolify.ozgurgurcan.com/api/v1/deploy?uuid=<app uuid>&force=false"`.
4. Trigger the first deployment with the MCP `deploy` tool; follow it with
   `list_deployments` and `get_deployment`; on failure read `get_logs`.
5. Verify: `curl -s https://calculator.ozgurgurcan.com/healthz` → `ok`;
   the divide-by-zero curl through the domain → 422 JSON; open the site in
   the built-in browser, run `12 + 3 =`, screenshot; over SSH
   (`ssh oracle-server docker ps`) confirm neither container publishes a
   host port, which proves the override file was not picked up.
6. Push a trivial README touch (the dated coverage line) to `main`; confirm
   the CI deploy job calls the webhook and a second deployment appears.

**Commit** (if the README changed): `docs: confirm live deployment`. Push.

---

## Spec deltas discovered while planning

Applied to DESIGN.md in the same commit as this plan:

- Vite 8 template ships oxlint and TypeScript 6; the spec said ESLint and
  TypeScript 5. Prettier follows the template style (no semicolons, single
  quotes).
- The operand-count message is "wrong number of operands: sqrt expects 1
  operand, got 2", which is what wrapping the sentinel produces.
- The CI deploy step skips with a notice while the secrets are unset, so the
  workflow is green from Task 8 onward. Actions are pinned to v7.
