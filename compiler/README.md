# pcx — the PecanX compiler (v0.1)

A real, working compiler for a useful subset of PecanX. It lexes, parses, checks
(`match` exhaustiveness + optional Hindley-Milner type inference), links modules,
and compiles to **JavaScript, WebAssembly, or a real-DOM browser app** — then runs
it. Written in plain JavaScript with **zero dependencies** — runs on any Node ≥ 18.

```bash
# from this directory:
node pcx.js run   examples/signup_demo.px                  # compile + execute
node pcx.js check --types examples/types/ok.px             # exhaustiveness + type inference
node pcx.js build examples/math.px --target wasm -o m.wasm # → real WebAssembly
node pcx.js build ../examples/counter/Main.px --target dom # → self-contained HTML app
node tests/run.js                                          # run the test suite (24 cases)
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

It compiles the pure-integer Kernel to **real WebAssembly** (hand-emitted binary,
no external assembler):

```
$ node pcx.js build examples/math.px --target wasm -o math.wasm
✓ wrote math.wasm — exports: fib, fact, gcd, poly; skipped (not pure-integer): greet
# instantiated in Node: fib(10)=55, fact(5)=120, gcd(48,36)=12, poly(3)=37
```

It emits a **real-DOM** browser app (wired events + asynchronous effects via
`fetch`/`setTimeout`):

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
| [`src/types.js`](src/types.js) | Hindley-Milner type inference (`--types`): unification, let-generalization, occurs check; reports PX0200. |
| [`src/codegen.js`](src/codegen.js) | AST → JavaScript. Sum types → tagged objects, `match` → guarded `if`-chains, records → objects; each module → an IIFE that returns its exports. |
| [`src/wasm.js`](src/wasm.js) | AST → WebAssembly binary for the pure-integer subset (hand-emitted, no assembler). |
| [`src/runtime.js`](src/runtime.js) | Standard library, constructors, **and the effect runtime** — `Html` renderer (string + real-DOM), `Cmd`, async `Http`/`Time`, `Server`/`Db`, `Program.run` (headless) and `Program.mount` (DOM). |
| [`pcx.js`](pcx.js) | CLI: `check [--types]` / `build [--target js\|wasm\|dom]` / `run`. |

## Supported language (v0.1)

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
- **WebAssembly** (`build --target wasm`) — real `.wasm` for the pure-integer Kernel.
- **Real DOM** (`build --target dom`) — a self-contained HTML page; `Program.mount`
  wires events and performs async `Cmd`s (`Http` via `fetch`, `Time` via `setTimeout`).
- **Exhaustiveness** (`check`) and **type inference** (`check --types`).

## Not yet implemented (see ../docs/appendix-b-reference.md · B.6)

- **Wasm beyond integers** — records, sum types, strings, and closures stay on the
  JS backend; the Wasm path covers pure `Int` functions (WasmGC is the path forward).
- **Cross-module type inference** — `--types` checks each module independently;
  imported names are trusted. Whole-program inference is next.
- **A production browser runtime** — the DOM runtime re-renders the whole tree
  (no virtual-DOM diffing), and `Random`/`Decode`/`Json` remain stubbed.
- **The `?` operator** — parsed and flagged (PX0100); not yet lowered.
- **`pcx fmt` / `lsp` / `dev`** and the **Orchard** registry.

## Tests

`node tests/run.js` runs 24 end-to-end cases: exact-output programs; the three
apps run headlessly via their `Demo.px` drivers; exhaustiveness acceptance + a
PX0001 rejection; **type inference** (5 well-typed accepted, 4 ill-typed rejected
with PX0200); the **WebAssembly** module instantiated and called in Node; and the
**real-DOM** runtime exercised under a minimal DOM shim (click events + async).
