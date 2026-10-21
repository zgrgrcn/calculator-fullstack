package api

import (
	"log/slog"
	"net/http"
	"runtime/debug"
	"time"
)

// statusWriter records the status code for the request log.
type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

// requestLogger writes one log line per request.
func requestLogger(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(sw, r)
		logger.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", sw.status,
			"duration_ms", time.Since(start).Milliseconds(),
		)
	})
}

// recoverer turns a panic into a JSON 500 and logs the stack. It re-raises
// http.ErrAbortHandler, which net/http uses to abort a response on purpose.
func recoverer(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			rec := recover()
			if rec == nil {
				return
			}
			if rec == http.ErrAbortHandler {
				panic(rec)
			}
			logger.Error("panic", "err", rec, "stack", string(debug.Stack()))
			writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "internal error")
		}()
		next.ServeHTTP(w, r)
	})
}
