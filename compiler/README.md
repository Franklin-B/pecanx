# pcx — the PecanX compiler (v0.3)

A real, working compiler for a useful subset of PecanX. It lexes, parses, checks
(`match` exhaustiveness + optional Hindley-Milner type inference), links modules,
and compiles to **JavaScript, WebAssembly, or a real-DOM browser app** — then runs
it. Written in plain JavaScript with **zero dependencies** — runs on any Node ≥ 18.

```bash
# from this directory:
node pcx.js run   examples/signup_demo.px                  # compile + execute
node pcx.js check --types examples/types/ok.px             # exhaustiveness + type inference
node pcx.js build examples/sumtypes.px --target wasm -o s.wasm  # → real WebAssembly (WasmGC)
node pcx.js build ../examples/counter/Main.px --target dom  # → self-contained HTML app
node pcx.js fmt   examples/math.px                         # format source
node pcx.js dev   ../examples/counter/Main.px              # dev server (http://localhost:8080)
node orchard.js   add http --registry ./reg                # install a package
node tests/run.js                                          # run the test suite (36 cases)
```

## What it does today

```
$ node pcx.js run examples/signup_demo.px
OK   ada@example.com (age 21)
FAIL that does not look like an email
FAIL must be at least 18
FAIL a required field was empty
```

That program is real PecanX — opaque types with `parse`, sum types, records,
tuples, nested pattern matching, `Result`/`Option`, the standard library, string
interpolation — compiled to JavaScript and executed. It is the same
validation-as-data idea the whole language is built around, now actually running.

The checker enforces the language's signature guarantee:

```
$ node pcx.js check examples/nonexhaustive.px
examples/nonexhaustive.px: error [PX0001] Non-exhaustive match on Color: missing case Blue
```

And it **links multiple modules** and runs whole apps headlessly through a minimal
effect runtime (`Html` renders to a string; `Cmd` and `server fn` run synchronously):

```
$ node pcx.js run ../examples/counter/Demo.px
<div class="counter"><button>-</button><span class="count">Count: 0</span>...</div>
... Count: 1 ... Count: 2 ... Count: 3 ... Count: 2 ... Count: 0
```

The `counter`, `todo`, and `remote-users` apps each ship a `Demo.px` driver that
imports the app's `init`/`update`/`view` and scripts a sequence of messages through
the runtime — see [../examples](../examples/README.md).

It compiles the pure core to **real WebAssembly** (hand-emitted binary, no external
assembler) — `Int`, `Float`, **records** (WasmGC structs), **sum types** (tagged
structs + `match`), and **strings** (`array<i8>`):

```
$ node pcx.js build examples/sumtypes.px --target wasm -o sumtypes.wasm
✓ wrote sumtypes.wasm — exports: area, test, eval, demo
# in Node: test()=325, demo()=12  (builds variants, matches on the tag)
```

It emits a **real-DOM** browser app with **virtual-DOM diffing** — patches in place,
preserves node identity, and reconciles **keyed** lists across reorders — plus wired
events and asynchronous effects via `fetch`/`setTimeout`:

```
$ node pcx.js build ../examples/counter/Main.px --target dom -o counter.html
```

And it **infers and checks types** (Hindley-Milner) under `--types`:

```
$ node pcx.js check --types examples/types/bad_arith.px
... error [PX0200] in f: cannot unify Int with String
```

## Pipeline

```
entry.px ─▶ resolve modules ─▶ lexer ─▶ parser ─▶ checker ─▶ codegen + link ─▶ JavaScript ─▶ node
            (by module header)  tokens   AST       diagnostics  JS text          (+ runtime)
```

| File | Role |
|------|------|
| [`src/lexer.js`](src/lexer.js) | Tokenizer. Newline-agnostic except it records `nlBefore` so a call's `(` binds only on the same line. Handles `${...}` string interpolation (incl. nested strings). |
| [`src/parser.js`](src/parser.js) | Recursive-descent + precedence-climbing parser → AST. |
| [`src/link.js`](src/link.js) | Resolves `import`s to sibling modules by their `module` header and orders them dependency-first. |
| [`src/check.js`](src/check.js) | `match` exhaustiveness (PX0001), conservatively (no false positives). |
| [`src/types.js`](src/types.js) | Hindley-Milner inference (`--types`): unification, let-generalization, occurs check; **whole-program / cross-module** via `inferTypesLinked`; reports PX0200. |
| [`src/codegen.js`](src/codegen.js) | AST → JavaScript. Sum types → tagged objects, `match` → guarded `if`-chains, records → objects; each module → an IIFE that returns its exports. |
| [`src/wasm.js`](src/wasm.js) | AST → WebAssembly binary (hand-emitted, no assembler). Type-directed: `Int`→i32, `Float`→f64, **records, sum types, and strings → WasmGC** (structs, tagged structs, `array<i8>`). |
| [`src/runtime.js`](src/runtime.js) | Standard library, constructors, **and the effect runtime** — `Html` renderer (string + **VDOM-diffing** real DOM with **keyed** reconciliation), `Cmd`, async `Http`/`Time`, `Server`/`Db`, `Program.run` (headless) and `Program.mount` (DOM). |
| [`src/format.js`](src/format.js) | `pcx fmt`: precedence-aware AST pretty-printer (idempotent, re-parseable). |
| [`src/lsp.js`](src/lsp.js) | `pcx lsp`: Language Server over stdio — publishes diagnostics from `check` + inference. |
| [`src/dev.js`](src/dev.js) | `pcx dev`: build-on-request development server for the real-DOM target. |
| [`pcx.js`](pcx.js) | CLI: `check [--types]` / `build [--target js\|wasm\|dom]` / `run` / `fmt` / `lsp` / `dev`. |
| [`orchard.js`](orchard.js) | `orchard` package manager: local file registry → `orchard_modules/` (auto-linked by `pcx`). |

## Supported language (v0.3)

**Multi-module linking** (`import` resolved across sibling files by each file's
`module` header), `fn` / `let` / `type` / `type alias` / `opaque` / `parse` /
`server fn`; records (construct/access/update/punning), sum types (positional
**and** named-field construction), tuples, lists (incl. `[x, ...rest]`); `match`
with constructor/tuple/list/record/literal/wildcard/var patterns and guards;
`if/then/else`; lambdas; `effect { let! ... }` blocks; the operators
`+ - * / % == /= < <= > >= and or not ++ |>`; string interpolation; a standard
library (`String`, `Int`, `Float`, `List`, `Option`, `Result`, `Char`, `Console`,
`Dict`); and a **headless effect runtime** — `Html` renders to a string, and
`Program.run(init, update, view, msgs)` drives the Model/Msg/update/view loop
headlessly, while `Program.mount` drives it against a real DOM.

### Three backends / two checkers

- **JavaScript** (`build`/`run`) — the default; links modules, runs apps headlessly.
- **WebAssembly** (`build --target wasm`) — real `.wasm` for the pure core over
  `Int`, `Float`, **records** (WasmGC structs), **sum types** (tagged structs +
  `match`), and **strings** (`array<i8>` + `array.len`).
- **Real DOM** (`build --target dom`) — a self-contained HTML page; `Program.mount`
  **diffs the virtual tree and patches in place** (node identity preserved, **keyed**
  reconciliation for reordered lists), wires events with persistent listeners, and
  performs async `Cmd`s (`Http` via `fetch`, `Time` via `setTimeout`).
- **Exhaustiveness** (`check`) and **whole-program type inference** (`check --types`,
  catches cross-module errors).
- **Tooling** — `fmt` (formatter), `lsp` (language server), `dev` (dev server), and
  `orchard` (package manager).

## Not yet implemented (see ../docs/appendix-b-reference.md · B.6)

- **Wasm closures / function values** — `Int`/`Float`/records/sum-types/strings
  compile to WasmGC; first-class functions need closure-conversion + `call_ref`, so
  functions that take function parameters stay on the JS backend.
- **The `?` operator** — parsed and flagged (PX0100); not yet lowered.
- **A networked Orchard registry** — the package manager is local/file-based today
  (no version solving, lockfiles, or remote registry).
- **Richer LSP** — diagnostics work; hover, completion, go-to-definition, and
  precise semantic ranges are future work.

## Tests

`node tests/run.js` runs 36 end-to-end cases covering: exact-output programs and
the Demo apps; exhaustiveness (accept + PX0001 reject); whole-program type
inference (accept incl. multi-module, reject incl. a cross-module mismatch);
**WebAssembly** modules for integers, **Float + records**, **sum types**, and
**strings**, instantiated and called in Node; the **VDOM-diffing real-DOM** runtime
(events, async, node identity, and **keyed reconciliation**) under a DOM shim;
`fmt` idempotence; `lsp` publishing diagnostics over stdio; the `dev` server; and
`orchard` installing a package that `pcx` then links.
