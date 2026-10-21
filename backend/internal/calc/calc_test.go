package calc

import (
	"errors"
	"math"
	"testing"
)

func TestCalculate(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name     string
		op       Operation
		operands []float64
		want     float64
		wantErr  error
	}{
		{"add", Add, []float64{1.5, 2.25}, 3.75, nil},
		{"add negatives cancel", Add, []float64{-1, 1}, 0, nil},
		{"subtract", Subtract, []float64{5, 7.5}, -2.5, nil},
		{"multiply", Multiply, []float64{-3, 4}, -12, nil},
		{"multiply overflow", Multiply, []float64{1e308, 10}, 0, ErrNotFinite},
		{"divide", Divide, []float64{10, 4}, 2.5, nil},
		{"divide by zero", Divide, []float64{1, 0}, 0, ErrDivisionByZero},
		{"divide by negative zero", Divide, []float64{1, math.Copysign(0, -1)}, 0, ErrDivisionByZero},
		{"power", Power, []float64{2, 10}, 1024, nil},
		{"power fractional exponent", Power, []float64{2, 0.5}, math.Sqrt2, nil},
		{"power zero to negative", Power, []float64{0, -1}, 0, ErrNotFinite},
		{"power negative base fractional exponent", Power, []float64{-8, 1.0 / 3}, 0, ErrNotFinite},
		{"power overflow", Power, []float64{10, 400}, 0, ErrNotFinite},
		{"sqrt", Sqrt, []float64{144}, 12, nil},
		{"sqrt zero", Sqrt, []float64{0}, 0, nil},
		{"sqrt negative", Sqrt, []float64{-1}, 0, ErrInvalidOperand},
		{"percentage", Percentage, []float64{50}, 0.5, nil},
		{"percentage negative", Percentage, []float64{-200}, -2, nil},
		{"unknown operation", Operation("modulo"), []float64{1, 2}, 0, ErrUnknownOperation},
		{"too few operands", Add, []float64{1}, 0, ErrOperandCount},
		{"no operands", Add, nil, 0, ErrOperandCount},
		{"too many operands", Sqrt, []float64{1, 2}, 0, ErrOperandCount},
		{"nan operand", Add, []float64{math.NaN(), 1}, 0, ErrInvalidOperand},
		{"inf operand", Add, []float64{math.Inf(1), 1}, 0, ErrInvalidOperand},
		{"negative inf operand", Add, []float64{math.Inf(-1), 1}, 0, ErrInvalidOperand},
		{"multiply overflow negative", Multiply, []float64{-1e308, 10}, 0, ErrNotFinite},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got, err := Calculate(tc.op, tc.operands)
			if tc.wantErr != nil {
				if !errors.Is(err, tc.wantErr) {
					t.Fatalf("Calculate(%s, %v) error = %v, want %v", tc.op, tc.operands, err, tc.wantErr)
				}
				if got != 0 {
					t.Fatalf("Calculate(%s, %v) = %v with an error, want the zero value", tc.op, tc.operands, got)
				}
				return
			}
			if err != nil {
				t.Fatalf("Calculate(%s, %v) unexpected error: %v", tc.op, tc.operands, err)
			}
			if math.Abs(got-tc.want) > 1e-12 {
				t.Fatalf("Calculate(%s, %v) = %v, want %v", tc.op, tc.operands, got, tc.want)
			}
		})
	}
}

func TestOperandCountMessage(t *testing.T) {
	t.Parallel()
	_, err := Calculate(Sqrt, []float64{1, 2})
	if got, want := err.Error(), "wrong number of operands: sqrt expects 1 operand, got 2"; got != want {
		t.Fatalf("message = %q, want %q", got, want)
	}
	_, err = Calculate(Add, []float64{1})
	if got, want := err.Error(), "wrong number of operands: add expects 2 operands, got 1"; got != want {
		t.Fatalf("message = %q, want %q", got, want)
	}
}

func TestOperations(t *testing.T) {
	t.Parallel()
	want := []Spec{
		{Add, 2, "+"}, {Subtract, 2, "−"}, {Multiply, 2, "×"}, {Divide, 2, "÷"},
		{Power, 2, "^"}, {Sqrt, 1, "√"}, {Percentage, 1, "%"},
	}
	got := Operations()
	if len(got) != len(want) {
		t.Fatalf("Operations() returned %d specs, want %d", len(got), len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("Operations()[%d] = %+v, want %+v", i, got[i], want[i])
		}
	}
}

// The helpers behind divide and sqrt follow the Go convention of returning
// the zero value with an error; Calculate discards their result on error, so
// only a direct test can hold them to it.
func TestHelpersReturnZeroWithError(t *testing.T) {
	t.Parallel()
	if got, err := divide([]float64{1, 0}); got != 0 || !errors.Is(err, ErrDivisionByZero) {
		t.Errorf("divide(1, 0) = %v, %v; want 0, ErrDivisionByZero", got, err)
	}
	if got, err := sqrt([]float64{-4}); got != 0 || !errors.Is(err, ErrInvalidOperand) {
		t.Errorf("sqrt(-4) = %v, %v; want 0, ErrInvalidOperand", got, err)
	}
}
