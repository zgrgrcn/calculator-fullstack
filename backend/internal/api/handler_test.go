package api

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func newTestHandler() http.Handler {
	return NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)))
}

// do performs a request and parses the JSON body, if any.
func do(t *testing.T, h http.Handler, method, path, body string) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var parsed map[string]any
	if rec.Body.Len() > 0 {
		if err := json.Unmarshal(rec.Body.Bytes(), &parsed); err != nil {
			t.Fatalf("%s %s: response is not JSON: %v: %s", method, path, err, rec.Body.String())
		}
	}
	return rec, parsed
}

func errorField(t *testing.T, body map[string]any, key string) string {
	t.Helper()
	e, ok := body["error"].(map[string]any)
	if !ok {
		t.Fatalf("no error object in %v", body)
	}
	s, _ := e[key].(string)
	return s
}

func TestCalculateHappyPaths(t *testing.T) {
	t.Parallel()
	h := newTestHandler()
	tests := []struct {
		op       string
		operands string
		want     float64
	}{
		{"add", "[1.5,2.25]", 3.75},
		{"subtract", "[5,7.5]", -2.5},
		{"multiply", "[-3,4]", -12},
		{"divide", "[10,4]", 2.5},
		{"power", "[2,10]", 1024},
		{"sqrt", "[144]", 12},
		{"percentage", "[50]", 0.5},
	}
	for _, tc := range tests {
		t.Run(tc.op, func(t *testing.T) {
			t.Parallel()
			rec, body := do(t, h, http.MethodPost, "/api/v1/calculate", fmt.Sprintf(`{"operation":%q,"operands":%s}`, tc.op, tc.operands))
			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
			}
			if ct := rec.Header().Get("Content-Type"); ct != "application/json; charset=utf-8" {
				t.Errorf("Content-Type = %q", ct)
			}
			if body["operation"] != tc.op {
				t.Errorf("operation = %v, want %s", body["operation"], tc.op)
			}
			if body["result"] != tc.want {
				t.Errorf("result = %v, want %v", body["result"], tc.want)
			}
			if _, ok := body["operands"].([]any); !ok {
				t.Errorf("operands not echoed: %v", body)
			}
		})
	}
}

func TestCalculateErrors(t *testing.T) {
	t.Parallel()
	h := newTestHandler()
	oversized := `{"operation":"add","operands":[` + strings.Repeat("1,", maxBodyBytes/2) + `1]}`
	padded := `{"operation":"add","operands":[1,2]}` + strings.Repeat(" ", maxBodyBytes)
	tests := []struct {
		name    string
		body    string
		status  int
		code    string
		message string
	}{
		{"division by zero", `{"operation":"divide","operands":[1,0]}`, 422, "DIVISION_BY_ZERO", "cannot divide by zero"},
		{"sqrt of negative", `{"operation":"sqrt","operands":[-1]}`, 422, "INVALID_OPERAND", "invalid operand: square root of a negative number"},
		{"overflow", `{"operation":"power","operands":[10,400]}`, 422, "RESULT_NOT_FINITE", "result is not a finite number"},
		{"unknown operation", `{"operation":"modulo","operands":[1,2]}`, 400, "UNKNOWN_OPERATION", ""},
		{"wrong arity", `{"operation":"sqrt","operands":[1,2]}`, 400, "INVALID_OPERAND_COUNT", "wrong number of operands: sqrt expects 1 operand, got 2"},
		{"missing operands", `{"operation":"add"}`, 400, "INVALID_OPERAND_COUNT", ""},
		{"null operands", `{"operation":"add","operands":null}`, 400, "INVALID_OPERAND_COUNT", ""},
		{"missing operation", `{"operands":[1,2]}`, 400, "INVALID_REQUEST", "operation is required"},
		{"string operands", `{"operation":"add","operands":["1","2"]}`, 400, "INVALID_REQUEST", "operands must be numbers within float64 range"},
		{"out of range literal", `{"operation":"add","operands":[1e999,1]}`, 400, "INVALID_REQUEST", "operands must be numbers within float64 range"},
		{"numeric operation", `{"operation":5,"operands":[1,2]}`, 400, "INVALID_REQUEST", "operation must be a string"},
		{"array body", `[1,2]`, 400, "INVALID_REQUEST", "body must be a JSON object"},
		{"unknown field", `{"operation":"add","operands":[1,2],"x":1}`, 400, "INVALID_REQUEST", `unknown field "x"`},
		{"two objects", `{"operation":"add","operands":[1,2]} {}`, 400, "INVALID_REQUEST", "body must contain a single JSON object"},
		{"trailing garbage", `{"operation":"add","operands":[1,2]} xyz`, 400, "INVALID_REQUEST", "invalid JSON body"},
		{"not json", `not json`, 400, "INVALID_REQUEST", "invalid JSON body"},
		{"empty body", ``, 400, "INVALID_REQUEST", "invalid JSON body"},
		{"oversized operands", oversized, 413, "PAYLOAD_TOO_LARGE", ""},
		{"padded past the limit", padded, 413, "PAYLOAD_TOO_LARGE", ""},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			rec, body := do(t, h, http.MethodPost, "/api/v1/calculate", tc.body)
			if rec.Code != tc.status {
				t.Fatalf("status = %d, want %d; body = %s", rec.Code, tc.status, rec.Body.String())
			}
			if got := errorField(t, body, "code"); got != tc.code {
				t.Errorf("code = %q, want %q", got, tc.code)
			}
			if tc.message != "" {
				if got := errorField(t, body, "message"); got != tc.message {
					t.Errorf("message = %q, want %q", got, tc.message)
				}
			}
		})
	}
}

func TestMethodNotAllowed(t *testing.T) {
	t.Parallel()
	h := newTestHandler()
	rec, body := do(t, h, http.MethodGet, "/api/v1/calculate", "")
	if rec.Code != http.StatusMethodNotAllowed || rec.Header().Get("Allow") != "POST" {
		t.Fatalf("status = %d, Allow = %q", rec.Code, rec.Header().Get("Allow"))
	}
	if got := errorField(t, body, "code"); got != "METHOD_NOT_ALLOWED" {
		t.Errorf("code = %q", got)
	}
	rec, _ = do(t, h, http.MethodPost, "/api/v1/operations", `{}`)
	if rec.Code != http.StatusMethodNotAllowed || rec.Header().Get("Allow") != "GET" {
		t.Fatalf("operations: status = %d, Allow = %q", rec.Code, rec.Header().Get("Allow"))
	}
}

func TestOperations(t *testing.T) {
	t.Parallel()
	rec, body := do(t, newTestHandler(), http.MethodGet, "/api/v1/operations", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	ops, ok := body["operations"].([]any)
	if !ok || len(ops) != 7 {
		t.Fatalf("operations = %v", body["operations"])
	}
	first, _ := ops[0].(map[string]any)
	if first["name"] != "add" || first["arity"] != 2.0 || first["symbol"] != "+" {
		t.Errorf("first operation = %v", first)
	}
}

func TestHealthz(t *testing.T) {
	t.Parallel()
	rec, body := do(t, newTestHandler(), http.MethodGet, "/healthz", "")
	if rec.Code != http.StatusOK || body["status"] != "ok" {
		t.Fatalf("status = %d, body = %v", rec.Code, body)
	}
}

func TestNotFound(t *testing.T) {
	t.Parallel()
	h := newTestHandler()
	for _, path := range []string{"/nope", "/api/v1/calculate/extra", "/api"} {
		rec, body := do(t, h, http.MethodGet, path, "")
		if rec.Code != http.StatusNotFound {
			t.Errorf("%s: status = %d", path, rec.Code)
		}
		if got := errorField(t, body, "code"); got != "NOT_FOUND" {
			t.Errorf("%s: code = %q", path, got)
		}
	}
}
