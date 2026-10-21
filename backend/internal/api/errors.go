package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/zgrgrcn/calculator-fullstack/backend/internal/calc"
	"github.com/zgrgrcn/calculator-fullstack/backend/internal/expr"
)

type errorBody struct {
	Error apiError `json:"error"`
}

type apiError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	// Bodies are small structs built here; an encode failure would mean the
	// client went away, and there is nobody left to report it to.
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, errorBody{Error: apiError{Code: code, Message: message}})
}

// statusFor maps a calc or expr error to an HTTP status and error code. 400 means the
// request named something that does not exist or has the wrong shape; 422
// means the request was well-formed but the mathematics is impossible.
func statusFor(err error) (int, string) {
	switch {
	case errors.Is(err, expr.ErrSyntax):
		return http.StatusBadRequest, "INVALID_EXPRESSION"
	case errors.Is(err, calc.ErrUnknownOperation):
		return http.StatusBadRequest, "UNKNOWN_OPERATION"
	case errors.Is(err, calc.ErrOperandCount):
		return http.StatusBadRequest, "INVALID_OPERAND_COUNT"
	case errors.Is(err, calc.ErrInvalidOperand):
		return http.StatusUnprocessableEntity, "INVALID_OPERAND"
	case errors.Is(err, calc.ErrDivisionByZero):
		return http.StatusUnprocessableEntity, "DIVISION_BY_ZERO"
	case errors.Is(err, calc.ErrNotFinite):
		return http.StatusUnprocessableEntity, "RESULT_NOT_FINITE"
	default:
		return http.StatusInternalServerError, "INTERNAL_ERROR"
	}
}
