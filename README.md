# PecanX

[![Deploy site](https://github.com/Franklin-B/pecanx/actions/workflows/pages.yml/badge.svg)](https://github.com/Franklin-B/pecanx/actions/workflows/pages.yml)
[![Playground](https://img.shields.io/badge/playground-live-c98a3a)](https://franklin-b.github.io/pecanx/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**▶ Try it now — [franklin-b.github.io/pecanx](https://franklin-b.github.io/pecanx/)** — the playground runs the real `pcx` compiler entirely in your browser. No install, no account.

**A correctness-first language for full-stack web applications.** PecanX compiles
your pure logic to a single **Kernel** (a WebAssembly module that runs identically
on the client and the server) and your interface code to JavaScript — so the
validation, business rules, and types you write once can never drift between the
browser and the backend.

> Part of the PecanAI / PecanAI-X family.
> Compiler: `pcx` · Source files: `.px` · Package registry: **Orchard**

---

## Why PecanX exists

Most web bugs are not exotic. They are the same four families, over and over:

1. **`null` / `undefined`** where a value was expected.
2. **Unhandled errors** crashing a request or a render.
3. **"Impossible" UI states** — loading *and* error at once, data that's both present and absent.
4. **Client/server drift** — the front end and back end disagree about what's valid.

PecanX is designed so that **all four become compile errors instead of runtime
incidents.** It does this with a small, sharp set of ideas — sum types,
exhaustive matching, no `null`, errors-as-values, "parse, don't validate," and a
single shared Kernel — rather than a large feature surface.

It is not *more powerful* in the Turing sense (nothing is). It is more powerful in
the sense that matters in production: **fewer ways to be wrong.**

## The shell-and-kernel model

A pecan is a hard protective **shell** around an edible **kernel**. PecanX borrows
the metaphor literally:

- **Kernel** — the pure heart of your program: types, validation, business rules.
  It is side-effect-free, so the compiler can put it in one Wasm module and run it
  on *both* sides. Client-side and server-side validation are then the *same code*,
  not two implementations that hopefully agree.
- **Shell** — the type system and the **quarantined FFI**. Nothing reaches the
  Kernel without passing through the Shell. "Cracking the shell" (calling raw
  JavaScript) is possible but explicitly marked, typed, and contained — see
  [docs/08-ffi.md](docs/08-ffi.md).

```
        ┌──────────────────────────── Shell ────────────────────────────┐
        │  type system · exhaustiveness · quarantined JS interop         │
        │                                                                │
        │     ┌───────────────────── Kernel ──────────────────────┐      │
        │     │  pure logic → one Wasm module                      │      │
        │     │  the SAME validation runs on client AND server     │      │
        │     └────────────────────────────────────────────────────┘      │
        └────────────────────────────────────────────────────────────────┘
            view / DOM / Web APIs  →  JavaScript     server fn  →  backend
```

## A taste

```px
module Signup.Domain

-- A value of this type cannot exist unless it passed validation.
opaque Email

parse email(raw: String): Result<FieldError, Email> =
  let s = String.trim(raw)
  if String.isEmpty(s) then Err(Empty)
  else if not (String.contains(s, "@")) then Err(BadFormat)
  else Ok(Email(s))

-- Defined once. Runs in the browser for instant feedback AND on the
-- server as the authority. They cannot disagree — it's one Kernel.
fn validate(raw: RawSignup): Result<Errors, SignupRequest> = ...
```

The full worked example — a signup form whose validation runs on both sides — is in
[docs/10-tutorial-signup.md](docs/10-tutorial-signup.md), and a **runnable**
TypeScript + Zod implementation of the same idea lives in
[`examples/pecanx-signup`](examples/pecanx-signup) (the reference implementation you
can run today while the PecanX toolchain itself is built).

## Documentation

| # | Doc | What it covers |
|---|-----|----------------|
| 00 | [Overview](docs/00-overview.md) | Philosophy, the Kernel/Shell model, how PecanX compares to Elm, Rust, Gleam, F# |
| 01 | [Getting started](docs/01-getting-started.md) | Install `pcx`, project layout, the build model, `orchard` |
| 02 | [Syntax basics](docs/02-syntax-basics.md) | Values, bindings, functions, modules, operators |
| 03 | [Types](docs/03-types.md) | Records, sum types, generics, opaque types, no `null` |
| 04 | [Pattern matching](docs/04-pattern-matching.md) | `match`, exhaustiveness, guards, destructuring |
| 05 | [Errors & validation](docs/05-errors-and-validation.md) | `Result`, `Option`, "parse, don't validate" |
| 06 | [Effects & architecture](docs/06-effects-and-architecture.md) | Model / Msg / update / view, `Cmd`, `effect` blocks |
| 07 | [Full-stack](docs/07-full-stack.md) | `server fn`, the Kernel split, isomorphic validation |
| 08 | [FFI](docs/08-ffi.md) | The quarantined JavaScript boundary |
| 09 | [Standard library](docs/09-stdlib.md) | Core modules reference |
| 10 | [Tutorial: signup form](docs/10-tutorial-signup.md) | The whole thing, end to end |
| 11 | [Cookbook & snippet catalog](docs/11-cookbook.md) | 30+ categorized, copy-pasteable snippets for dissemination |

### Reference

| Doc | What it covers |
|-----|----------------|
| [Glossary](docs/glossary.md) | Definitions of every PecanX concept and term |
| [Language dictionary](docs/dictionary.md) | Every keyword, operator, and built-in type, plus a full stdlib symbol index |
| [Appendix A · Grammar & syntax](docs/appendix-a-grammar.md) | Lexical grammar, formal EBNF, reserved words, operator precedence, cheat sheet |
| [Appendix B · Tooling & reference](docs/appendix-b-reference.md) | `pecanx.toml` schema, `pcx`/`orchard` CLI, compiler diagnostic catalog, language comparison, roadmap |

### Examples

Complete example apps for dissemination live in [`examples/`](examples/README.md):

| Example | Demonstrates | Runnable? |
|---------|--------------|-----------|
| [pecanx-signup](examples/pecanx-signup) | Isomorphic client/server validation (TypeScript + Zod reference) | **Yes** — `cd examples/pecanx-signup && npm run dev` |
| [counter](examples/counter) | The Model / Msg / update / view architecture | Illustrative `.px` |
| [todo](examples/todo) | Opaque types + `parse`, sum types, list ops, exhaustive `match` | Illustrative `.px` |
| [remote-users](examples/remote-users) | `server fn` + `Server.call` + `Remote<e,a>` rendering | Illustrative `.px` |

## Status

PecanX is a **language design with a working compiler, a deployable web IDE, and a runnable reference app.**

- **`pcx` v0.4** — a real, zero-dependency compiler in [`compiler/`](compiler): it
  lexes, parses, checks `match` exhaustiveness, **infers and checks types
  whole-program** (Hindley-Milner, `--types`, including cross-module errors),
  lowers the **`?` operator** (early-return for `Result`/`Option`), **links
  multiple modules**, and compiles to **JavaScript**, **WebAssembly**
  (`Int`/`Float`/**records**/**sum types**/**strings** via WasmGC — real `.wasm`),
  or a **real-DOM browser app** (`--target dom`) with **virtual-DOM diffing** and
  **keyed reconciliation**. It also ships **`pcx new`** (project scaffolder),
  **`pcx test`** (a unit-test runner), a formatter (`fmt`), a language server
  (`lsp`) — diagnostics, hover, outline, **completion**, **go-to-definition**, and
  **formatting** — a dev server (`dev`), and **Orchard** (`orchard`) — a local
  package manager. The [counter](examples/counter), [todo](examples/todo), and
  [remote-users](examples/remote-users) apps each run via a `Demo.px` driver. Its
  test suite is 45 end-to-end cases.
- **A browser playground** ([playground](playground)) — the full `pcx` compiler as
  a polished, **statically-deployable** web IDE (light/dark, persistence, sharable
  links, live DOM preview, Wasm download). Build it with `npm run build` → `dist/`
  and deploy anywhere (Vercel / Netlify / GitHub Pages configs included).
- **A VS Code extension** ([editors/vscode](editors/vscode)) — live diagnostics,
  hover, outline, completion, and go-to-definition over `pcx lsp`; see *Write and
  compile it*, below.
- **`pecanx-signup`** — the TypeScript + Zod reference app demonstrating isomorphic
  validation on a production stack ([examples/pecanx-signup](examples/pecanx-signup)).

Still ahead: Wasm closures / first-class functions, a networked Orchard registry,
and rename refactoring — see [Appendix B · Roadmap](docs/appendix-b-reference.md).
These docs describe the language as designed; forward-looking parts are marked.

## Write and compile it

Two ways to write PecanX and compile it in one place, both built directly on `pcx`:

- **VS Code extension** — [`editors/vscode`](editors/vscode). Plugs `pcx lsp` in for
  **live diagnostics** (exhaustiveness + type errors squiggle the exact `match` or
  declaration as you type), adds `.px` **syntax highlighting**, **hover**, an
  **outline**, and wires **Run / Build (JS·Wasm·DOM) / Format / Dev-server** into
  the Command Palette. `cd editors/vscode && npm install`, then press <kbd>F5</kbd>.
- **Browser playground** — [`playground`](playground). The *same* compiler, running
  entirely client-side (it's pure, zero-dependency JS): type PecanX, hit **Run**,
  and see live diagnostics, a mounted DOM app, console output, the generated JS, or
  a real downloadable `.wasm` — no install. `node playground/serve.mjs`, then open
  <http://localhost:5173/playground/>. To ship it, `npm run build` assembles a
  self-contained static site in `dist/` (deployable to any static host — see
  [playground/README.md](playground/README.md)).
