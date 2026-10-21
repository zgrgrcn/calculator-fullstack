// Command mutate is a small mutation tester for one Go package.
//
// It parses the package's non-test sources, generates one mutant per site
// by flipping a binary operator (+ - * / < <= > >= == != && ||) or bumping
// a numeric constant by one, runs the package's tests against each mutant
// in a scratch copy of the module, and exits 1 if any mutant survives. A
// surviving mutant is a behaviour change the tests did not notice.
//
//	go run ./tools/mutate ./internal/calc
package main

import (
	"bytes"
	"flag"
	"fmt"
	"go/ast"
	"go/format"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type mutant struct {
	file  *ast.File
	path  string // absolute path of the source file
	pos   token.Position
	what  string
	apply func()
	undo  func()
}

type outcome int

const (
	killed outcome = iota
	survived
	notViable
)

var binaryFlips = map[token.Token]token.Token{
	token.ADD: token.SUB, token.SUB: token.ADD,
	token.MUL: token.QUO, token.QUO: token.MUL,
	token.LSS: token.LEQ, token.LEQ: token.LSS,
	token.GTR: token.GEQ, token.GEQ: token.GTR,
	token.EQL: token.NEQ, token.NEQ: token.EQL,
	token.LAND: token.LOR, token.LOR: token.LAND,
}

func main() {
	verbose := flag.Bool("v", false, "print the test output of surviving mutants")
	flag.Parse()
	if flag.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: mutate [-v] <package directory, for example ./internal/calc>")
		os.Exit(2)
	}
	if err := run(flag.Arg(0), *verbose); err != nil {
		fmt.Fprintln(os.Stderr, "mutate:", err)
		os.Exit(1)
	}
}

func run(pkgDir string, verbose bool) error {
	start := time.Now()
	modRoot, err := moduleRoot()
	if err != nil {
		return err
	}
	absPkg, err := filepath.Abs(pkgDir)
	if err != nil {
		return err
	}
	relPkg, err := filepath.Rel(modRoot, absPkg)
	if err != nil || strings.HasPrefix(relPkg, "..") {
		return fmt.Errorf("%s is not inside the module at %s", pkgDir, modRoot)
	}

	fset := token.NewFileSet()
	mutants, err := collectMutants(fset, absPkg)
	if err != nil {
		return err
	}
	if len(mutants) == 0 {
		return fmt.Errorf("no mutation sites found in %s", pkgDir)
	}

	scratch, err := os.MkdirTemp("", "mutate-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(scratch)
	if err := copyModule(modRoot, scratch); err != nil {
		return err
	}
	pkgPattern := "./" + filepath.ToSlash(relPkg)

	counts := map[outcome]int{}
	for _, m := range mutants {
		src, err := m.render(fset)
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(modRoot, m.path)
		target := filepath.Join(scratch, rel)
		original, err := os.ReadFile(target)
		if err != nil {
			return err
		}
		if err := os.WriteFile(target, src, 0o644); err != nil {
			return err
		}
		result, output := runTests(scratch, pkgPattern)
		if err := os.WriteFile(target, original, 0o644); err != nil {
			return err
		}
		counts[result]++
		fmt.Printf("%-10s %s:%d:%d  %s\n", label(result), filepath.Base(m.path), m.pos.Line, m.pos.Column, m.what)
		if result == survived && verbose {
			fmt.Println(indent(output))
		}
	}

	fmt.Printf("\n%d mutants: %d killed, %d survived, %d not viable (%s)\n",
		len(mutants), counts[killed], counts[survived], counts[notViable], time.Since(start).Round(time.Second))
	if counts[survived] > 0 {
		return fmt.Errorf("%d mutant(s) survived: the tests do not constrain that behaviour", counts[survived])
	}
	return nil
}

// collectMutants parses every non-test Go file in dir and returns one
// mutant per operator or numeric constant.
func collectMutants(fset *token.FileSet, dir string) ([]*mutant, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var mutants []*mutant
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue
		}
		path := filepath.Join(dir, name)
		file, err := parser.ParseFile(fset, path, nil, parser.ParseComments)
		if err != nil {
			return nil, err
		}
		ast.Inspect(file, func(n ast.Node) bool {
			switch node := n.(type) {
			case *ast.BinaryExpr:
				if to, ok := binaryFlips[node.Op]; ok {
					from := node.Op
					mutants = append(mutants, &mutant{
						file: file, path: path, pos: fset.Position(node.OpPos),
						what:  fmt.Sprintf("%s → %s", from, to),
						apply: func() { node.Op = to },
						undo:  func() { node.Op = from },
					})
				}
			case *ast.BasicLit:
				if next, ok := bump(node); ok {
					was := node.Value
					mutants = append(mutants, &mutant{
						file: file, path: path, pos: fset.Position(node.ValuePos),
						what:  fmt.Sprintf("%s → %s", was, next),
						apply: func() { node.Value = next },
						undo:  func() { node.Value = was },
					})
				}
			}
			return true
		})
	}
	return mutants, nil
}

// bump returns the literal increased by one, for decimal integer and float
// literals.
func bump(lit *ast.BasicLit) (string, bool) {
	switch lit.Kind {
	case token.INT:
		n, err := strconv.ParseInt(lit.Value, 10, 64)
		if err != nil {
			return "", false
		}
		return strconv.FormatInt(n+1, 10), true
	case token.FLOAT:
		f, err := strconv.ParseFloat(lit.Value, 64)
		if err != nil {
			return "", false
		}
		return strconv.FormatFloat(f+1, 'g', -1, 64), true
	}
	return "", false
}

// render applies the mutation, prints the file, and undoes the mutation, so
// every mutant is generated from the same pristine AST.
func (m *mutant) render(fset *token.FileSet) ([]byte, error) {
	m.apply()
	defer m.undo()
	var buf bytes.Buffer
	if err := format.Node(&buf, fset, m.file); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func runTests(dir, pkg string) (outcome, string) {
	cmd := exec.Command("go", "test", "-count=1", pkg)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	switch {
	case err == nil:
		return survived, string(out)
	case bytes.Contains(out, []byte("[build failed]")) || bytes.Contains(out, []byte("setup failed")):
		return notViable, string(out)
	default:
		return killed, string(out)
	}
}

func moduleRoot() (string, error) {
	out, err := exec.Command("go", "list", "-m", "-f", "{{.Dir}}").Output()
	if err != nil {
		return "", fmt.Errorf("go list -m: %w (run from inside the module)", err)
	}
	return strings.TrimSpace(string(out)), nil
}

// copyModule copies the module sources into dst, skipping VCS metadata and
// build output, so mutants never touch the real tree.
func copyModule(src, dst string) error {
	return filepath.WalkDir(src, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, path)
		if d.IsDir() {
			if rel != "." && (strings.HasPrefix(d.Name(), ".") || d.Name() == "bin") {
				return filepath.SkipDir
			}
			return os.MkdirAll(filepath.Join(dst, rel), 0o755)
		}
		if strings.HasPrefix(d.Name(), "coverage.") {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(filepath.Join(dst, rel), data, 0o644)
	})
}

func label(o outcome) string {
	switch o {
	case killed:
		return "killed"
	case survived:
		return "SURVIVED"
	default:
		return "not viable"
	}
}

func indent(s string) string {
	return "    " + strings.ReplaceAll(strings.TrimSpace(s), "\n", "\n    ")
}
