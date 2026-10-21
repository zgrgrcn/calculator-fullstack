# Calculator Full-Stack

[![ci](https://github.com/zgrgrcn/calculator-fullstack/actions/workflows/ci.yml/badge.svg)](https://github.com/zgrgrcn/calculator-fullstack/actions/workflows/ci.yml)

**Live demo:** https://calculator.ozgurgurcan.com

A keypad calculator. The React + TypeScript frontend owns the interaction
state machine; every arithmetic operation is sent to a Go REST microservice
that validates the input, computes one operation per request and answers in
JSON.

- Add, subtract, multiply, divide, power, square root, percentage
- Operator precedence as on iOS (`2 + 3 × 4 = 14`), right-associative power
  (`2 ^ 3 ^ 2 = 512`)
- Keyboard support, responsive layout from 320px up, light and dark themes
- Every backend response is JSON, including 404, 405, 413 and 500
- Statement coverage: 100% on the Go `calc` package, 95% on the HTTP layer,
  96% on the frontend

## Architecture

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

A key press goes into a pure reducer. When arithmetic is needed the reducer
places exactly one `request` in its state; a hook runs it against the API and
dispatches `resolved` or `failed`; the reducer updates the display and may
emit the next request (a chain such as `2 + 3 × 4 =` takes two requests).
Dependencies point one way: `calc ← api ← cmd/server` in Go, and
`reducer, format, client ← useCalculator ← components` in TypeScript, so each
unit is tested on its own.

On start the frontend calls `GET /api/v1/operations` and enables only the
operation keys the backend advertises; the call doubles as a connectivity
check and shows a "Backend unreachable" line with a Retry button when it
fails.

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
make setup      # npm ci in frontend/
make backend    # Go API on http://localhost:8080
make frontend   # Vite dev server on http://localhost:5173, proxies /api to the backend
```

Run the two in separate terminals. The dev proxy target can be changed with
`VITE_API_PROXY_TARGET=http://host:port make frontend`. Other targets:
`make test`, `make coverage`, `make lint`, `make help`.

The backend reads one environment variable, `PORT` (default `8080`).

## API

Base path `/api/v1`. Every response is `application/json; charset=utf-8`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/calculate` | Run one operation |
| `GET` | `/api/v1/operations` | List operations with arity and symbol |
| `GET` | `/healthz` | Liveness, `{"status":"ok"}` |

Operations and operand counts: `add`, `subtract`, `multiply`, `divide`,
`power` take two operands; `sqrt` and `percentage` take one.
`percentage` is `a ÷ 100`, like the `%` key on the iOS calculator.

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
# {"operations":[{"name":"add","arity":2,"symbol":"+"},{"name":"subtract","arity":2,"symbol":"−"}, ...]}
```

Errors always have the shape `{"error":{"code":"...","message":"..."}}`.
400 means the request itself is malformed or names something that does not
exist; 422 means the request is well-formed but the mathematics is
impossible.

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_REQUEST` | Malformed JSON, unknown field, non-numeric or out-of-range operand (`1e999`), missing operation, more than one JSON value in the body |
| 400 | `UNKNOWN_OPERATION` | `operation` is not in the registry |
| 400 | `INVALID_OPERAND_COUNT` | Wrong number of operands for the operation |
| 422 | `INVALID_OPERAND` | Square root of a negative number |
| 422 | `DIVISION_BY_ZERO` | Divisor is 0 (or −0) |
| 422 | `RESULT_NOT_FINITE` | Result overflows or is undefined, such as `10^400` or `0^-1` |
| 404 | `NOT_FOUND` | Unknown route |
| 405 | `METHOD_NOT_ALLOWED` | Wrong method; the `Allow` header names the right one |
| 413 | `PAYLOAD_TOO_LARGE` | Body over 1 MiB |
| 500 | `INTERNAL_ERROR` | A panic, recovered and logged; never a stack trace |

Numbers are IEEE 754 doubles, returned raw: `0.1 + 0.2` is
`0.30000000000000004` at the API, and the frontend rounds to 12 significant
digits for display. Integers are exact up to 2^53. Results that are NaN or
infinite are rejected before encoding, so a successful response always
carries a finite number.

## Design decisions and assumptions

1. **One endpoint per operation call, not an expression evaluator.** The
   backend stays a small arithmetic service with one validation path; the
   frontend owns the calculator semantics in a pure, fully unit-tested
   reducer. The trade-off is that a chain issues a few sequential requests.
2. **Precedence and associativity.** `+ −` bind weaker than `× ÷`, which
   bind weaker than `^`; `^` is right-associative like scientific
   calculators. This landed as its own commit (`156951c`) so it can be
   reverted to classic four-function behaviour in one step.
3. **Percentage is unary** (`a ÷ 100`), following the iOS calculator.
   Negation (`±`) is a display edit and never calls the API.
4. **Validation on both layers.** The keypad constrains entry (15 digits,
   one decimal point, no leading zeros, operators replace a pending operator
   instead of stacking); the API re-validates everything and the UI shows the
   backend's own error message.
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
10. **Not built:** history, memory keys, repeat-equals, authentication, rate
    limiting, persistence.

The full design is in [docs/DESIGN.md](docs/DESIGN.md) and the task plan in
[docs/PLAN.md](docs/PLAN.md).

## Testing and coverage

```bash
make test       # go vet + go test -race, then typecheck + lint + vitest
make coverage   # backend/coverage.html and frontend/coverage/index.html
```

Backend: table-driven tests for every operation and edge case in `calc`
(division by zero and by −0, negative square root, overflow, NaN and Inf
operands, arity, unknown operation), and `httptest` tests for every route,
status code and error code in `api`, including malformed JSON, unknown
fields, trailing data, oversized bodies and the recover middleware.

Frontend: the reducer (entry rules, negate, clear, operator replacement,
precedence request sequences, unary operations, failure and recovery, stale
request ids), display formatting, the API client (every error path and
abort), and the `Calculator` component against a fake backend (chains,
division by zero, unreachable backend, keyboard input, disabled keypad while
a request is pending, operations handshake and Retry).

Coverage on 2026-10-21 (`make coverage`; CI uploads both reports as
artifacts on every run):

| Layer | Statements | Lines | Notes |
|---|---|---|---|
| Go `internal/calc` | 100% | | |
| Go `internal/api` | 94.9% | | |
| Go `cmd/server` | 63.9% | | `run` and `probe` are tested; `main` is wiring |
| Go total | 88.0% | | |
| Frontend | 96.3% | 98.7% | branches 93.6%, functions 98.1%; 85% thresholds enforced |

## Deployment

The live demo runs the compose stack on a self-hosted Coolify server as a
Docker Compose application built from this repository's `main` branch, with
the domain attached to the `frontend` service. The backend is reachable only
inside the compose network.

Deploys are gated by CI: the `deploy` job in
[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs after the
backend, frontend and docker jobs succeed on a push to `main` and calls the
Coolify deploy webhook. It needs two repository secrets, `COOLIFY_TOKEN`
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
  internal/api/        HTTP handler, JSON decoding, error mapping, middleware
frontend/
  src/api/             typed client: calculate(), operations(), ApiError, NetworkError
  src/calculator/      reducer (pure state machine), format, hooks
  src/components/      Calculator, Display, Keypad, Key, key layout
  nginx.conf           static files + /api proxy for the container
docker-compose.yml     deploy-ready stack; docker-compose.override.yml adds local ports
.github/workflows/     CI: test, build, deploy
docs/                  DESIGN.md (spec), PLAN.md (task plan)
PROMPTS.md             every prompt used, verbatim
```

## AI usage

Built with Claude Code (model Fable 5.1) in the Claude desktop app. The
workflow was: a structured brainstorming session that produced the spec
([docs/DESIGN.md](docs/DESIGN.md)), a task plan derived from it
([docs/PLAN.md](docs/PLAN.md)), then execution task by task with tests
written first and one commit per task. Every prompt I sent, including
multiple-choice answers, is in [PROMPTS.md](PROMPTS.md), verbatim and in
order.

## What would come next

- Calculation history and repeat-equals
- A CORS middleware if the API gets external clients
- Request ids and metrics on the backend
- Browser end-to-end tests with Playwright against the compose stack
- Decimal arithmetic for exact money-style results
