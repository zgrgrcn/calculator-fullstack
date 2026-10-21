// Package calc implements the calculator's arithmetic: a registry of named
// operations and one entry point, Calculate, that validates operands and
// results. It performs no I/O and depends only on the standard library.
package calc

import (
	"errors"
	"fmt"
	"math"
)

// Operation names an arithmetic operation. The string values are the API
// vocabulary.
type Operation string

// Supported operations.
const (
	Add        Operation = "add"
	Subtract   Operation = "subtract"
	Multiply   Operation = "multiply"
	Divide     Operation = "divide"
	Power      Operation = "power"
	Sqrt       Operation = "sqrt"
	Percentage Operation = "percentage"
)

// Spec describes an operation for API consumers.
type Spec struct {
	Name   Operation `json:"name"`
	Arity  int       `json:"arity"`
	Symbol string    `json:"symbol"`
}

// Sentinel errors. Callers match them with errors.Is; the wrapped message
// carries the detail.
var (
	ErrUnknownOperation = errors.New("unknown operation")
	ErrOperandCount     = errors.New("wrong number of operands")
	ErrInvalidOperand   = errors.New("invalid operand")
	ErrDivisionByZero   = errors.New("cannot divide by zero")
	ErrNotFinite        = errors.New("result is not a finite number")
)

type spec struct {
	arity  int
	symbol string
	fn     func(args []float64) (float64, error)
}

var registry = map[Operation]spec{
	Add:        {2, "+", func(a []float64) (float64, error) { return a[0] + a[1], nil }},
	Subtract:   {2, "−", func(a []float64) (float64, error) { return a[0] - a[1], nil }},
	Multiply:   {2, "×", func(a []float64) (float64, error) { return a[0] * a[1], nil }},
	Divide:     {2, "÷", divide},
	Power:      {2, "^", func(a []float64) (float64, error) { return math.Pow(a[0], a[1]), nil }},
	Sqrt:       {1, "√", sqrt},
	Percentage: {1, "%", func(a []float64) (float64, error) { return a[0] / 100, nil }},
}

// order fixes the sequence Operations returns.
var order = []Operation{Add, Subtract, Multiply, Divide, Power, Sqrt, Percentage}

// Operations lists every supported operation in a stable order.
func Operations() []Spec {
	specs := make([]Spec, 0, len(order))
	for _, name := range order {
		s := registry[name]
		specs = append(specs, Spec{Name: name, Arity: s.arity, Symbol: s.symbol})
	}
	return specs
}

// Calculate applies op to operands. It rejects unknown operations, a wrong
// operand count, non-finite operands, and any result that is NaN or infinite,
// so a successful result is always a finite float64 that JSON can carry.
func Calculate(op Operation, operands []float64) (float64, error) {
	s, ok := registry[op]
	if !ok {
		return 0, fmt.Errorf("%w: %q", ErrUnknownOperation, op)
	}
	if len(operands) != s.arity {
		return 0, fmt.Errorf("%w: %s expects %s, got %d", ErrOperandCount, op, plural(s.arity, "operand"), len(operands))
	}
	for i, v := range operands {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return 0, fmt.Errorf("%w: operand %d is not a finite number", ErrInvalidOperand, i)
		}
	}
	result, err := s.fn(operands)
	if err != nil {
		return 0, err
	}
	if math.IsNaN(result) || math.IsInf(result, 0) {
		return 0, ErrNotFinite
	}
	return result, nil
}

func divide(a []float64) (float64, error) {
	if a[1] == 0 { // also true for negative zero
		return 0, ErrDivisionByZero
	}
	return a[0] / a[1], nil
}

func sqrt(a []float64) (float64, error) {
	if a[0] < 0 {
		return 0, fmt.Errorf("%w: square root of a negative number", ErrInvalidOperand)
	}
	return math.Sqrt(a[0]), nil
}

func plural(n int, word string) string {
	if n == 1 {
		return fmt.Sprintf("%d %s", n, word)
	}
	return fmt.Sprintf("%d %ss", n, word)
}
