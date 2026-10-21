package api

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRecovererReturnsJSON500(t *testing.T) {
	t.Parallel()
	var buf bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&buf, nil))
	h := recoverer(logger, http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("boom") }))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"INTERNAL_ERROR"`) {
		t.Errorf("body = %s", rec.Body.String())
	}
	if !strings.Contains(buf.String(), "boom") {
		t.Errorf("panic not logged: %s", buf.String())
	}
}

func TestRecovererLetsAbortHandlerThrough(t *testing.T) {
	t.Parallel()
	h := recoverer(slog.Default(), http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic(http.ErrAbortHandler) }))
	defer func() {
		if recover() != http.ErrAbortHandler {
			t.Fatal("ErrAbortHandler was swallowed")
		}
	}()
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/", nil))
}

func TestRequestLoggerLogsStatus(t *testing.T) {
	t.Parallel()
	var buf bytes.Buffer
	h := NewHandler(slog.New(slog.NewTextHandler(&buf, nil)))
	do(t, h, http.MethodGet, "/healthz", "")
	do(t, h, http.MethodGet, "/nope", "")
	logged := buf.String()
	for _, want := range []string{"method=GET", "path=/healthz", "status=200", "path=/nope", "status=404", "duration_ms="} {
		if !strings.Contains(logged, want) {
			t.Errorf("log is missing %q:\n%s", want, logged)
		}
	}
}
