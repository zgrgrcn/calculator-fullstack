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
