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

func TestRealMain(t *testing.T) {
	t.Parallel()
	healthy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }))
	defer healthy.Close()
	_, healthyPort, _ := net.SplitHostPort(healthy.Listener.Addr().String())
	envWithPort := func(port string) func(string) string {
		return func(key string) string {
			if key == "PORT" {
				return port
			}
			return ""
		}
	}

	if got := realMain(context.Background(), []string{"-healthcheck"}, envWithPort(healthyPort), io.Discard); got != 0 {
		t.Errorf("healthcheck against a healthy server = %d, want 0", got)
	}
	if got := realMain(context.Background(), []string{"-nope"}, envWithPort(healthyPort), io.Discard); got != 2 {
		t.Errorf("unknown flag = %d, want 2", got)
	}

	// Occupy a port on the wildcard address, as the server binds, so the
	// listen fails on every platform (a 127.0.0.1 bind does not block a
	// wildcard bind on macOS).
	taken, err := net.Listen("tcp", ":0")
	if err != nil {
		t.Fatal(err)
	}
	defer taken.Close()
	_, takenPort, _ := net.SplitHostPort(taken.Addr().String())
	if got := exitWithin(t, 5*time.Second, func(ctx context.Context) int {
		return realMain(ctx, nil, envWithPort(takenPort), io.Discard)
	}); got != 1 {
		t.Errorf("occupied port = %d, want 1", got)
	}

	// A free port: serve, then cancel and expect a clean exit.
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan int, 1)
	go func() { done <- realMain(ctx, nil, envWithPort("0"), io.Discard) }()
	time.Sleep(50 * time.Millisecond)
	cancel()
	select {
	case code := <-done:
		if code != 0 {
			t.Errorf("cancelled server exit = %d, want 0", code)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("realMain did not return after cancel")
	}
}

// exitWithin runs fn and returns its exit code, cancelling and failing the
// test if it is still running after d.
func exitWithin(t *testing.T, d time.Duration, fn func(context.Context) int) int {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan int, 1)
	go func() { done <- fn(ctx) }()
	select {
	case code := <-done:
		return code
	case <-time.After(d):
		cancel()
		t.Fatalf("still running after %s", d)
		return -1
	}
}
