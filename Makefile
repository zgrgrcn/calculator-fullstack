.PHONY: help setup backend frontend test test-backend test-frontend coverage lint mutate e2e media docker-up docker-down

help:            ## list targets
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*##' '{printf "  %-16s %s\n", $$1, $$2}'
setup:           ## install frontend and e2e dependencies
	cd frontend && npm ci
	cd e2e && npm ci
backend:         ## run the API on :8080
	cd backend && go run ./cmd/server
frontend:        ## run the Vite dev server on :5173
	cd frontend && npm run dev
test: test-backend test-frontend ## run all tests
test-backend:
	cd backend && go vet ./... && go test -race -cover ./...
test-frontend:
	cd frontend && npm run typecheck && npm run lint && npm test
coverage:        ## write backend/coverage.html, docs/coverage.txt (go tool cover -func) and frontend/coverage/
	cd backend && go test -race -covermode=atomic -coverprofile=coverage.out ./cmd/... ./internal/... && go tool cover -html=coverage.out -o coverage.html && go tool cover -func=coverage.out > ../docs/coverage.txt && tail -1 ../docs/coverage.txt
	cd frontend && npm run test:coverage
lint:            ## formatting and static checks
	cd backend && test -z "$$(gofmt -l .)" && go vet ./...
	cd frontend && npm run lint && npm run format:check && npm run typecheck
e2e:             ## build the stack, run Playwright against it, tear it down
	docker compose up --build -d --wait
	cd e2e && npm test; status=$$?; cd .. && docker compose down; exit $$status
media:           ## record docs/media/demo.gif and docs/media/themes.png against the compose stack (needs ffmpeg)
	docker compose up --build -d --wait
	cd e2e && node demo/record.js; status=$$?; cd .. && docker compose down; exit $$status

mutate:          ## mutation-test internal/calc; fails if a mutant survives
	cd backend && go run ./tools/mutate ./internal/calc
docker-up:       ## build and start the stack on http://localhost:3000
	docker compose up --build -d
docker-down:
	docker compose down
