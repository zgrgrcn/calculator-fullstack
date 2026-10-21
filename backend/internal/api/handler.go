// Package api exposes the calculator over HTTP: single operations on
// /calculate, whole expressions on /evaluate. Every response, including
// errors, is JSON.
package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"github.com/zgrgrcn/calculator-fullstack/backend/internal/calc"
	"github.com/zgrgrcn/calculator-fullstack/backend/internal/expr"
)

const maxBodyBytes = 1 << 20 // 1 MiB

type handler struct {
	logger *slog.Logger
}

type calculateRequest struct {
	Operation string    `json:"operation"`
	Operands  []float64 `json:"operands"`
}

type calculateResponse struct {
	Operation string    `json:"operation"`
	Operands  []float64 `json:"operands"`
	Result    float64   `json:"result"`
}

type operationsResponse struct {
	Operations []calc.Spec `json:"operations"`
}

type evaluateRequest struct {
	Tokens []expr.Token `json:"tokens"`
}

type evaluateResponse struct {
	Result float64 `json:"result"`
}

// NewHandler wires every route and middleware.
func NewHandler(logger *slog.Logger) http.Handler {
	h := &handler{logger: logger}
	mux := http.NewServeMux()
	route(mux, http.MethodPost, "/api/v1/calculate", h.calculate)
	route(mux, http.MethodPost, "/api/v1/evaluate", h.evaluate)
	route(mux, http.MethodGet, "/api/v1/operations", h.operations)
	route(mux, http.MethodGet, "/healthz", h.healthz)
	mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "no such route")
	})
	return recoverer(logger, requestLogger(logger, mux))
}

// route registers the method-specific pattern plus a fallback for the same
// path that answers 405 with an Allow header, so the response stays JSON.
func route(mux *http.ServeMux, method, path string, fn http.HandlerFunc) {
	mux.HandleFunc(method+" "+path, fn)
	mux.HandleFunc(path, func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Allow", method)
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "use "+method)
	})
}

func (h *handler) calculate(w http.ResponseWriter, r *http.Request) {
	var req calculateRequest
	if rerr := decodeBody(w, r, &req); rerr != nil {
		writeError(w, rerr.status, rerr.code, rerr.message)
		return
	}
	if req.Operation == "" {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "operation is required")
		return
	}
	result, err := calc.Calculate(calc.Operation(req.Operation), req.Operands)
	if err != nil {
		h.writeCalcError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, calculateResponse{Operation: req.Operation, Operands: req.Operands, Result: result})
}

// evaluate computes a whole expression, given as a token list, in one request.
func (h *handler) evaluate(w http.ResponseWriter, r *http.Request) {
	var req evaluateRequest
	if rerr := decodeBody(w, r, &req); rerr != nil {
		writeError(w, rerr.status, rerr.code, rerr.message)
		return
	}
	result, err := expr.Evaluate(req.Tokens)
	if err != nil {
		h.writeCalcError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, evaluateResponse{Result: result})
}

// writeCalcError maps an evaluation error to its status and code; anything
// unexpected becomes a logged 500 with a generic message.
func (h *handler) writeCalcError(w http.ResponseWriter, err error) {
	status, code := statusFor(err)
	if status == http.StatusInternalServerError {
		h.logger.Error("evaluation failed", "err", err)
		writeError(w, status, code, "internal error")
		return
	}
	writeError(w, status, code, err.Error())
}

func (h *handler) operations(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, operationsResponse{Operations: calc.Operations()})
}

func (h *handler) healthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type requestError struct {
	status  int
	code    string
	message string
}

// decodeBody reads exactly one JSON object of at most maxBodyBytes into dst,
// rejecting unknown fields. Both Decode calls go through the same mapping:
// a valid object padded past the size limit trips MaxBytesReader only on the
// second one.
func decodeBody(w http.ResponseWriter, r *http.Request, dst any) *requestError {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return classifyDecodeError(err)
	}
	switch err := dec.Decode(&struct{}{}); {
	case err == nil:
		return &requestError{http.StatusBadRequest, "INVALID_REQUEST", "body must contain a single JSON object"}
	case errors.Is(err, io.EOF):
		return nil
	default:
		return classifyDecodeError(err)
	}
}

func classifyDecodeError(err error) *requestError {
	var maxErr *http.MaxBytesError
	var typeErr *json.UnmarshalTypeError
	switch {
	case errors.As(err, &maxErr):
		return &requestError{http.StatusRequestEntityTooLarge, "PAYLOAD_TOO_LARGE", fmt.Sprintf("body must be at most %d bytes", maxBodyBytes)}
	case errors.As(err, &typeErr):
		switch {
		case typeErr.Field == "":
			return &requestError{http.StatusBadRequest, "INVALID_REQUEST", "body must be a JSON object"}
		case strings.HasPrefix(typeErr.Field, "operands"):
			return &requestError{http.StatusBadRequest, "INVALID_REQUEST", "operands must be numbers within float64 range"}
		case typeErr.Field == "operation":
			return &requestError{http.StatusBadRequest, "INVALID_REQUEST", "operation must be a string"}
		case strings.HasPrefix(typeErr.Field, "tokens"):
			return &requestError{http.StatusBadRequest, "INVALID_REQUEST", "tokens must be objects with a type and a numeric value or an op"}
		default:
			return &requestError{http.StatusBadRequest, "INVALID_REQUEST", fmt.Sprintf("%s has the wrong type", typeErr.Field)}
		}
	case strings.HasPrefix(err.Error(), "json: unknown field "):
		// encoding/json has no typed error for this case.
		return &requestError{http.StatusBadRequest, "INVALID_REQUEST", "unknown field " + strings.TrimPrefix(err.Error(), "json: unknown field ")}
	default:
		return &requestError{http.StatusBadRequest, "INVALID_REQUEST", "invalid JSON body"}
	}
}
