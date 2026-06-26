# Contributing to PecanX

Thanks for your interest in PecanX! It's a correctness-first language for full-stack
web apps — a zero-dependency compiler (`pcx`) plus a browser playground. This guide
gets you productive quickly.

## Prerequisites

- **Node.js ≥ 18** to run `pcx`. The test suite instantiates real WasmGC modules, so
  **Node 22+ is recommended** (on Node 18/20, run tests with `--experimental-wasm-gc`).
- No other dependencies — the compiler and playground are dependency-free.

## Getting started

```bash
git clone https://github.com/Franklin-B/pecanx
cd pecanx
npm test                 # run the full suite (should be all green)
npm run dev              # serve the playground at http://localhost:5173/playground/
node compiler/pcx.js new myapp   # scaffold a project to play with
```

## Project layout

| Path | What it is |
|------|------------|
| `compiler/pcx.js` | the CLI (`new`, `check`, `build`, `run`, `test`, `fmt`, `lsp`, `dev`) |
| `compiler/src/` | lexer, parser, checker, type inference, JS/Wasm codegen, runtime, LSP, formatter |
| `compiler/tests/run.js` | the end-to-end test suite |
| `compiler/examples/` | example `.px` programs used by tests |
| `playground/` | the in-browser IDE + `build.mjs` (the deployable static site) |
| `docs/` | the language manual and reference |
| `editors/vscode/` | the VS Code extension |

## Making a change

1. **Branch** off `master` (e.g. `feat/...`, `fix/...`, `docs/...`).
2. **Keep it dependency-free.** No npm packages in `compiler/` or `playground/`.
3. **Browser-safety:** modules the playground imports (`lexer`, `parser`, `check`,
   `types`, `codegen`, `wasm`, `format`) must not use Node-only globals
   (`Buffer`, `node:*`, `__dirname`, …). A test guards this.
4. **Match the surrounding style** — small functions, terse names, comments only where
   intent isn't obvious.
5. **Add a test** in `compiler/tests/run.js` (and an example under `compiler/examples/`
   if useful). New diagnostics get a `PXNNNN` code — see
   [`docs/appendix-b-reference.md`](docs/appendix-b-reference.md).
6. **Run `npm test`** — it must stay green. Run `node compiler/pcx.js fmt -w <file>`
   to format `.px` sources.

## Commit & PR conventions

- Conventional-commit style subjects: `feat(compiler): …`, `fix(lsp): …`,
  `docs: …`, `ci: …`.
- One logical change per PR; describe the *why*. CI (GitHub Actions) runs the test
  suite on every push and PR.

## License

By contributing, you agree your contributions are licensed under the project's
[MIT License](LICENSE).
