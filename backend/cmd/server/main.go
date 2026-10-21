// Command server runs the calculator API.
//
// Configuration comes from the environment: PORT (default 8080). The
// -healthcheck flag probes a running server instead, for container
// healthchecks in images that ship no shell or curl.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/zgrgrcn/calculator-fullstack/backend/internal/api"
)

func main() {
	os.Exit(realMain(context.Background(), os.Args[1:], os.Getenv, os.Stdout))
}

// realMain is main without the process-global edges, so it can be tested:
// it parses args, reads PORT through getenv, logs to stdout and returns the
// exit code.
func realMain(ctx context.Context, args []string, getenv func(string) string, stdout io.Writer) int {
	flags := flag.NewFlagSet("server", flag.ContinueOnError)
	flags.SetOutput(stdout)
	healthcheck := flags.Bool("healthcheck", false, "probe the running server's /healthz and exit 0 when healthy")
	if err := flags.Parse(args); err != nil {
		return 2
	}

	port := getenv("PORT")
	if port == "" {
		port = "8080"
	}
	if *healthcheck {
		return probe("http://127.0.0.1:" + port + "/healthz")
	}

	logger := slog.New(slog.NewJSONHandler(stdout, nil))
	if err := run(ctx, logger, ":"+port); err != nil {
		logger.Error("server failed", "err", err)
		return 1
	}
	return 0
}

// run serves on addr until ctx is cancelled or SIGINT/SIGTERM arrives, then
// drains in-flight requests for up to ten seconds.
func run(ctx context.Context, logger *slog.Logger, addr string) error {
	ctx, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stop()

	srv := &http.Server{
		Addr:              addr,
		Handler:           api.NewHandler(logger),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("listening", "addr", addr)
		errCh <- srv.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
	}

	logger.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("shutdown: %w", err)
	}
	if err := <-errCh; !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

// probe returns 0 when url answers 200 within three seconds, otherwise 1.
func probe(url string) int {
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return 1
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}
