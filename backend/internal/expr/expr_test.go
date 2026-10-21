package expr

import (
	"errors"
	"math"
	"testing"

	"github.com/zgrgrcn/calculator-fullstack/backend/internal/calc"
)

func num(v float64) Token        { return Token{Type: "number", Value: &v} }
func op(name string) Token       { return Token{Type: "operator", Op: name} }
func unary(name string) Token    { return Token{Type: "unary", Op: name} }
func tokens(ts ...Token) []Token { return ts }

func TestEvaluate(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name    string
		tokens  []Token
		want    float64
		wantErr error
	}{
		{"single number", tokens(num(2)), 2, nil},
		{"addition", tokens(num(12), op("add"), num(3)), 15, nil},
		{"multiplication before addition", tokens(num(2), op("add"), num(3), op("multiply"), num(4)), 14, nil},
		{"left operand reduced first", tokens(num(2), op("multiply"), num(3), op("add"), num(4)), 10, nil},
		{"subtraction is left-associative", tokens(num(8), op("subtract"), num(2), op("subtract"), num(1)), 5, nil},
		{"division is left-associative", tokens(num(8), op("divide"), num(2), op("divide"), num(2)), 2, nil},
		{"power is right-associative", tokens(num(2), op("power"), num(3), op("power"), num(2)), 512, nil},
		{"power binds tighter than multiplication", tokens(num(2), op("power"), num(3), op("multiply"), num(2)), 16, nil},
		{"square root", tokens(num(9), unary("sqrt")), 3, nil},
		{"nested square roots", tokens(num(81), unary("sqrt"), unary("sqrt")), 3, nil},
		{"percent then multiply", tokens(num(196), unary("percentage"), op("multiply"), num(5)), 9.8, nil},
		{"percent of percent", tokens(num(10), unary("percentage"), unary("percentage")), 0.001, nil},
		{"unary binds tighter than power", tokens(num(2), op("power"), num(16), unary("sqrt")), 16, nil},
		{"recording chain", tokens(num(9.8), op("subtract"), num(5), op("multiply"), num(5), op("divide"), num(5), op("add"), num(5)), 9.8, nil},
		{"division by zero", tokens(num(1), op("divide"), num(0)), 0, calc.ErrDivisionByZero},
		{"square root of a negative", tokens(num(-4), unary("sqrt")), 0, calc.ErrInvalidOperand},
		{"overflow", tokens(num(10), op("power"), num(400)), 0, calc.ErrNotFinite},
		{"unknown operator", tokens(num(1), op("modulo"), num(2)), 0, calc.ErrUnknownOperation},
		{"unary named as an operator", tokens(num(9), op("sqrt"), num(2)), 0, calc.ErrUnknownOperation},
		{"binary named as a unary", tokens(num(9), unary("add")), 0, calc.ErrOperandCount},
		{"empty", nil, 0, ErrSyntax},
		{"leading operator", tokens(op("add"), num(2)), 0, ErrSyntax},
		{"trailing operator", tokens(num(2), op("add")), 0, ErrSyntax},
		{"two operators", tokens(num(2), op("add"), op("add"), num(3)), 0, ErrSyntax},
		{"two numbers", tokens(num(2), num(3)), 0, ErrSyntax},
		{"unary with nothing before it", tokens(unary("sqrt")), 0, ErrSyntax},
		{"number without a value", tokens(Token{Type: "number"}), 0, ErrSyntax},
		{"unknown token type", tokens(Token{Type: "paren"}), 0, ErrSyntax},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got, err := Evaluate(tc.tokens)
			if tc.wantErr != nil {
				if !errors.Is(err, tc.wantErr) {
					t.Fatalf("Evaluate(%v) error = %v, want %v", tc.tokens, err, tc.wantErr)
				}
				if got != 0 {
					t.Fatalf("Evaluate(%v) = %v with an error, want the zero value", tc.tokens, got)
				}
				return
			}
			if err != nil {
				t.Fatalf("Evaluate(%v) unexpected error: %v", tc.tokens, err)
			}
			if math.Abs(got-tc.want) > 1e-12 {
				t.Fatalf("Evaluate(%v) = %v, want %v", tc.tokens, got, tc.want)
			}
		})
	}
}

func TestSyntaxMessages(t *testing.T) {
	t.Parallel()
	cases := map[string][]Token{
		"invalid expression: expression is empty":                nil,
		"invalid expression: expected a number at position 0":    tokens(op("add"), num(2)),
		"invalid expression: expression ends with an operator":   tokens(num(2), op("add")),
		"invalid expression: expected an operator at position 1": tokens(num(2), num(3)),
	}
	for want, ts := range cases {
		if _, err := Evaluate(ts); err == nil || err.Error() != want {
			t.Errorf("Evaluate(%v) error = %v, want %q", ts, err, want)
		}
	}
}
