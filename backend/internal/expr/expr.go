// Package expr evaluates a calculator expression given as a token list,
// with the usual precedence, delegating every arithmetic step to calc so
// the validation and error vocabulary stay the same as for single
// operations.
//
// Grammar:
//
//	expression := operand { operator operand }
//	operand    := number { unary }
//
// Multiplication and division bind tighter than addition and subtraction,
// power binds tighter still and is right-associative, and a postfix unary
// (square root, percentage) applies to the operand before it.
package expr

import (
	"errors"
	"fmt"

	"github.com/zgrgrcn/calculator-fullstack/backend/internal/calc"
)

// Token is one element of an expression as the API receives it.
type Token struct {
	// Type is "number", "operator" or "unary".
	Type string `json:"type"`
	// Value is set for number tokens.
	Value *float64 `json:"value,omitempty"`
	// Op names a calc operation for operator and unary tokens.
	Op string `json:"op,omitempty"`
}

// ErrSyntax marks a token list that does not form an expression. The
// wrapped message says where it went wrong.
var ErrSyntax = errors.New("invalid expression")

var precedence = map[calc.Operation]int{
	calc.Add:      1,
	calc.Subtract: 1,
	calc.Multiply: 2,
	calc.Divide:   2,
	calc.Power:    3,
}

// Evaluate computes the value of tokens. Arithmetic errors come from calc
// (ErrDivisionByZero, ErrInvalidOperand, ErrNotFinite, ErrUnknownOperation,
// ErrOperandCount); malformed token lists return ErrSyntax.
func Evaluate(tokens []Token) (float64, error) {
	if len(tokens) == 0 {
		return 0, fmt.Errorf("%w: expression is empty", ErrSyntax)
	}
	p := &parser{tokens: tokens}
	value, err := p.expression(1)
	if err != nil {
		return 0, err
	}
	if p.pos != len(tokens) {
		return 0, fmt.Errorf("%w: expected an operator at position %d", ErrSyntax, p.pos)
	}
	return value, nil
}

type parser struct {
	tokens []Token
	pos    int
}

// expression parses operands joined by operators of at least minPrec,
// reducing each pair through calc as soon as precedence allows.
func (p *parser) expression(minPrec int) (float64, error) {
	left, err := p.operand()
	if err != nil {
		return 0, err
	}
	for p.pos < len(p.tokens) {
		t := p.tokens[p.pos]
		if t.Type != "operator" {
			return 0, fmt.Errorf("%w: expected an operator at position %d", ErrSyntax, p.pos)
		}
		op := calc.Operation(t.Op)
		prec, ok := precedence[op]
		if !ok {
			return 0, fmt.Errorf("%w: %q", calc.ErrUnknownOperation, t.Op)
		}
		if prec < minPrec {
			break
		}
		p.pos++
		next := prec + 1
		if op == calc.Power { // right-associative: 2 ^ 3 ^ 2 = 2 ^ 9
			next = prec
		}
		right, err := p.expression(next)
		if err != nil {
			return 0, err
		}
		if left, err = calc.Calculate(op, []float64{left, right}); err != nil {
			return 0, err
		}
	}
	return left, nil
}

// operand parses a number followed by any postfix unary operations.
func (p *parser) operand() (float64, error) {
	if p.pos >= len(p.tokens) {
		return 0, fmt.Errorf("%w: expression ends with an operator", ErrSyntax)
	}
	t := p.tokens[p.pos]
	if t.Type != "number" || t.Value == nil {
		return 0, fmt.Errorf("%w: expected a number at position %d", ErrSyntax, p.pos)
	}
	p.pos++
	value := *t.Value
	for p.pos < len(p.tokens) && p.tokens[p.pos].Type == "unary" {
		var err error
		if value, err = calc.Calculate(calc.Operation(p.tokens[p.pos].Op), []float64{value}); err != nil {
			return 0, err
		}
		p.pos++
	}
	return value, nil
}
