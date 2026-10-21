package main

import (
	"context"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestProbe(t *testing.T) {
	t.Parallel()
	ok := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }))
	defer ok.Close()
	bad := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusServiceUnavailable) }))
	defer bad.Close()
	closed := httptest.NewServer(http.NotFoundHandler())
	closed.Close()

	if got := probe(ok.URL); got != 0 {
		t.Errorf("probe(healthy) = %d, want 0", got)
	}
	if got := probe(bad.URL); got != 1 {
		t.Errorf("probe(503) = %d, want 1", got)
	}
	if got := probe(closed.URL); got != 1 {
		t.Errorf("probe(closed) = %d, want 1", got)
	}
}

func TestRunShutsDownOnCancel(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- run(ctx, slog.New(slog.NewTextHandler(io.Discard, nil)), "127.0.0.1:0") }()
	time.Sleep(50 * time.Millisecond)
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("run returned %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("run did not return after cancel")
	}
}

func TestRunReportsListenFailure(t *testing.T) {
	t.Parallel()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close()
	if err := run(context.Background(), slog.New(slog.NewTextHandler(io.Discard, nil)), l.Addr().String()); err == nil {
		t.Fatal("run on an occupied port returned nil")
	}
}
