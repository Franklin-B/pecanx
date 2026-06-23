# Appendix B · Tooling & Reference

This appendix is the quick-lookup half of the manual: the manifest schema, the
two command-line tools, the diagnostic catalog, a comparison with neighbouring
languages, and an honest account of what is real today versus what is still on
the drawing board.

A note on status before we begin. PecanX is a *designed* language. The grammar,
the type system, and the standard library described throughout this manual are
fixed and authoritative — they are the contract. The **toolchain** is now largely
built: a working compiler, **`pcx` v0.3**, lives in [`../compiler`](../compiler).
It lexes, parses, checks `match` exhaustiveness, **infers and checks types
whole-program (Hindley-Milner, `--types`, incl. cross-module errors)**, **links
multiple modules**, and compiles to **JavaScript, WebAssembly** (`Int`/`Float`/
records/sum-types/strings via WasmGC), **or a real-DOM browser app** with
virtual-DOM diffing and keyed reconciliation — plus a formatter (`pcx fmt`), a
language server (`pcx lsp`), a dev server (`pcx dev`), and the **Orchard** package
manager (`orchard`, local registry). Try `node pcx.js run examples/signup_demo.px`,
the `Demo.px` drivers under [`../examples`](../examples), `--target wasm` on
`examples/sumtypes.px`, or `--types`. What's *still* pending — Wasm closures /
first-class functions, the `?` operator, a networked Orchard registry, and richer
LSP features — is marked **(forward-looking)** where it appears. A second
runnable artifact is the TypeScript + Zod reference app at
[`../examples/pecanx-signup`](../examples/pecanx-signup), which demonstrates the
isomorphic-validation idea on a production stack today.

For the language itself, start at the [Overview](00-overview.md) and
[Getting Started](01-getting-started.md). For the concepts the tooling assumes,
see [Effects & Architecture](06-effects-and-architecture.md),
[Full-Stack](07-full-stack.md), and [FFI](08-ffi.md).

---

## B.1 The `pecanx.toml` manifest

Every PecanX package — application or library — is rooted at a `pecanx.toml`
manifest. It is the file `pcx` reads to learn what to build, where the entry
point lives, which compile targets are in play, and what the package depends on.

A complete, idiomatic manifest looks like this:

```toml
[package]
name = "pecanx-signup"
version = "0.1.0"
edition = "2026"
description = "Isomorphic signup form with shared validation"
authors = ["Franklin Brown <franklin.brown79@gmail.com>"]
license = "MIT"
entry = "src/Main.px"
kernel = "src/Kernel"

[targets]
js = true
wasm = true
server = true
optimize = "size"

[dependencies]
orchard-http = "1.2.0"
orchard-json = "^0.8"
pecan-ui = { version = "2.0.0", registry = "orchard" }
shared-validators = { path = "../shared-validators" }
```

### `[package]`

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `name` | `String` | *(required)* | Package identifier on Orchard. Lowercase, hyphen-separated. |
| `version` | `String` | *(required)* | Semantic version `MAJOR.MINOR.PATCH`. |
| `edition` | `String` | `"2026"` | Language edition the compiler enforces. |
| `description` | `String` | `""` | One-line summary shown in Orchard listings. |
| `authors` | `List<String>` | `[]` | Author lines, conventionally `Name <email>`. |
| `license` | `String` | `""` | SPDX license identifier (e.g. `"MIT"`, `"Apache-2.0"`). |
| `entry` | `String` | `"src/Main.px"` | Path to the module whose `init`/`update`/`view` drive an app. Ignored for libraries. |
| `kernel` | `String` | `"src/Kernel"` | Directory the compiler treats as the pure core. Modules here may not contain `extern`; impurity is a compile error. See [FFI](08-ffi.md). |

### `[targets]`

Controls which artifacts the compiler emits. Placement of individual functions
is still *inferred* (pure → Kernel/Wasm, view/DOM → JS, `server fn` → server);
these switches decide which outputs are produced at all.

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `js` | `Bool` | `true` | Emit the JavaScript bundle (views, DOM, Web APIs). |
| `wasm` | `Bool` | `true` | Emit the single shared WebAssembly module for the Kernel. |
| `server` | `Bool` | `false` | Emit the server build (so `server fn` bodies and `Db.*` resolve). |
| `optimize` | `String` | `"balanced"` | Optimization profile: `"none"`, `"size"`, `"speed"`, or `"balanced"`. |

The Kernel Wasm module is, by design, compiled once and loaded on *both* client
and server — this is what lets validation run identically in the browser and on
the wire. See [Full-Stack](07-full-stack.md).

The single-entry form shown here (one `entry` in `[package]`, boolean target
switches in `[targets]`) is the canonical layout. The split-entry shorthand in
[Getting Started](01-getting-started.md) — naming a `client` and a `server`
entry point directly under `[targets]` — is sugar for a project with separate
client and server roots; it expands to the same emitted artifacts. Placement of
individual functions is inferred either way.

### `[dependencies]`

Maps a dependency name to a version requirement. Two forms are accepted:

```toml
[dependencies]
# Short form: a version requirement string.
orchard-http = "1.2.0"      # exact-ish (caret-compatible to 1.x)
orchard-json = "^0.8"       # caret range
orchard-time = "~1.4.2"     # tilde range

# Table form: extra keys.
pecan-ui = { version = "2.0.0", registry = "orchard" }
local-lib = { path = "../local-lib" }      # path dependency, no registry fetch
```

| Key (table form) | Type | Default | Meaning |
| --- | --- | --- | --- |
| `version` | `String` | *(required unless `path`)* | Semver requirement. `^` caret and `~` tilde ranges supported. |
| `registry` | `String` | `"orchard"` | Source registry. |
| `path` | `String` | — | Local filesystem path; overrides registry resolution for development. |

---

## B.2 The `pcx` CLI **(implemented in v0.3 — `check [--types]` / `build [--target js|wasm|dom]` / `run` / `fmt` / `lsp` / `dev`)**

`pcx` is the PecanX compiler and project driver. In v0.3, `check` (with optional
`--types`), `build` (targets `js` / `wasm` / `dom`), and `run` are implemented;
`dev`, `fmt`, and `lsp` below are forward-looking.

```bash
pcx <command> [options]
```

| Command | Common flags | Behavior |
| --- | --- | --- |
| `pcx new <name>` | `--lib`, `--app` (default), `--no-git` | Scaffold a new package: `pecanx.toml`, `src/Main.px` (or `src/<Name>.px` for a lib), and a starter `src/Kernel/`. |
| `pcx check` | `--watch`, `--target <js\|wasm\|server>` | Type-check and run all diagnostics without emitting code. Fast feedback loop; honours the [diagnostic catalog](#b4-compiler-diagnostic-catalog). |
| `pcx build` | `--release`, `--target <…>`, `--out <dir>` | Compile to the targets enabled in `[targets]`. `--release` applies the `optimize` profile and strips debug info. |
| `pcx dev` | `--port <n>`, `--open` | Start the development server with hot reload: re-checks on save, rebuilds the JS bundle and Kernel Wasm, serves the app. |
| `pcx run` | `--target <js\|server>`, `-- <args>` | Build then execute an executable package (e.g. a server entry). Arguments after `--` are passed through. |
| `pcx test` | `--filter <pat>`, `--watch` | Discover and run tests (modules/functions under `tests/`). Reports pass/fail counts. |
| `pcx fmt` | `--check`, `--stdin` | Format `.px` sources to canonical style (2-space indent, the conventions in this manual). `--check` exits non-zero if any file would change. |
| `pcx lsp` | `--stdio` | Run the language server for editor integration: diagnostics, hover types, go-to-definition, completion. |

Global flags accepted by every command: `--manifest <path>` (point at a
non-default `pecanx.toml`), `--quiet`, `--verbose`, `--version`, `--help`.

---

## B.3 The `orchard` CLI **(implemented in v0.3 — local file registry)**

Orchard is the PecanX package registry; `orchard` is its client. It manages the
`[dependencies]` table and the lockfile. Not yet implemented.

```bash
orchard <command> [options]
```

| Command | Common flags | Behavior |
| --- | --- | --- |
| `orchard add <pkg>` | `--version <req>`, `--dev`, `--path <p>` | Add a dependency to `pecanx.toml`, resolve it, and update the lockfile. |
| `orchard remove <pkg>` | — | Drop a dependency from the manifest and lockfile. |
| `orchard update` | `<pkg>`, `--dry-run` | Re-resolve dependencies to the newest versions allowed by the manifest ranges. With no argument, updates all. |
| `orchard install` | `--frozen` | Resolve and fetch exactly what the lockfile pins. `--frozen` fails if the manifest and lockfile disagree (CI mode). |
| `orchard publish` | `--dry-run`, `--token <t>` | Package the current crate and upload it to Orchard. Requires a clean build and a valid `version`. |
| `orchard search <query>` | `--limit <n>` | Search the registry for packages matching a query. |
| `orchard info <pkg>` | `--versions` | Show metadata for a package: description, latest version, authors, license. |
| `orchard login` | `--token <t>` | Store registry credentials for `publish`. |

---

## B.4 Compiler diagnostic catalog

PecanX leans hard on the compiler: the language deliberately removes whole
classes of failure (no `null`, no exceptions, mandatory exhaustiveness) so that
mistakes surface as diagnostics rather than runtime surprises. The table below
lists representative codes and the typical fix. **(`pcx` v0.3 already emits
`PX0001` — non-exhaustive match — `PX0200` for type errors (`--types`), and
`PX0100` for the unsupported `?`; the
remaining codes are forward-looking, but each maps directly to a rule stated
elsewhere in this manual.)**

| Code | Diagnostic | Typical fix |
| --- | --- | --- |
| `PX0001` | Non-exhaustive `match`: not all constructors are covered. | Add the missing arms, or a `_` wildcard arm. See [Pattern Matching](04-pattern-matching.md). |
| `PX0002` | Impure expression in `@kernel` code (effect or side-effect reached the pure core). | Move the effect into `update`/a `Cmd`, or drop `@kernel`. Impurity in the Kernel is always an error — see [Effects & Architecture](06-effects-and-architecture.md). |
| `PX0003` | Unhandled `Result`: an `Err` case is ignored. | `match` both cases, use `?` for early-exit, or `Result.withDefault`. See [Errors & Validation](05-errors-and-validation.md). |
| `PX0004` | `null` / `undefined` is not a value in PecanX. | Model absence with `Option` (`None` / `Some(x)`). See [Types](03-types.md). |
| `PX0005` | Type mismatch: expected `T`, found `U`. | Adjust the expression or the annotation so both sides agree. |
| `PX0006` | Unknown record field `x` on type `R`. | Fix the field name or extend the record type. See [Types](03-types.md). |
| `PX0007` | `extern` declared inside the Kernel. | Move the `extern` into a JS-target module; the Kernel may never name foreign code. See [FFI](08-ffi.md). |
| `PX0008` | A `Foreign` value is used without decoding. | Run it through `Decode.run(decoder)` and `match` the `Result` before use. See [FFI](08-ffi.md). |
| `PX0009` | Missing `else` branch in `if`. | Provide an `else`; both branches must exist and share a type. See [Syntax Basics](02-syntax-basics.md). |
| `PX0010` | Unused binding `name`. | Remove it, or prefix with `_` to mark it intentionally unused. |

---

## B.5 Language comparison

How PecanX positions itself relative to its influences. (Rust is included as the
systems-language reference point; TypeScript as the incumbent it most directly
competes with for full-stack web work.)

| Concern | PecanX | Elm | Rust | TypeScript | Gleam |
| --- | --- | --- | --- | --- | --- |
| Null handling | No `null`; absence is `Option` | No `null`; `Maybe` | No `null`; `Option` | `null`/`undefined` exist (tamed by strict mode) | No `null`; `Option` |
| Error handling | No exceptions; `Result` + `?` | No exceptions; `Result` | `panic!` exists; `Result` + `?` | `throw`/`try`/`catch` | No exceptions; `Result` |
| Exhaustiveness | Enforced on `match` | Enforced on `case` | Enforced on `match` | Not enforced (best-effort) | Enforced on `case` |
| Compile targets | JavaScript **and** WebAssembly | JavaScript | Native, WebAssembly | JavaScript | Erlang **and** JavaScript |
| Full-stack / shared validation | First-class: one Kernel Wasm module runs on client **and** server | Client only | Possible, but not a built-in story | Possible via shared code; no enforced purity boundary | Possible across BEAM/JS; not an enforced boundary |
| Purity | Enforced: pure Kernel, effects via `Cmd`, Shell quarantines FFI | Enforced (managed effects) | Not enforced | Not enforced | Not enforced |

---

## B.6 Roadmap & status

This section tracks the gap between the *language contract* (fixed) and the
*running tooling*. Much of the toolchain now exists (first item); the rest is
forward-looking.

- **The `pcx` toolchain — shipped (v0.3).** [`../compiler`](../compiler) lexes,
  parses, checks `match` exhaustiveness, **infers and checks types whole-program**
  (Hindley-Milner, `--types`: unbound vars, mismatches, arity, occurs check, **and
  cross-module errors**), **links multiple modules**, and compiles to **JavaScript**,
  **WebAssembly** (real `.wasm` over `Int`, `Float`, **records, sum types, and
  strings** via WasmGC structs / tagged structs / `array<i8>`), or a **real-DOM
  browser app** (`--target dom`) whose runtime **diffs the virtual tree and patches
  in place** with **keyed reconciliation** for reordered lists, wiring events and
  asynchronous `fetch`/`setTimeout` effects via `Program.mount`. It also ships a
  **formatter** (`pcx fmt`), a **language server** (`pcx lsp`, diagnostics over
  stdio), a **dev server** (`pcx dev`), and **Orchard** (`orchard`), a local
  file-based package manager that installs into `orchard_modules/` (auto-linked).
  *Still pending:* Wasm closures / first-class functions (closure-conversion +
  `call_ref`); the `?` operator's lowering; a networked Orchard registry (version
  solving, lockfiles); and richer LSP features (hover, completion, semantic ranges).
- **Algebraic effects.** The current effect model is the Elm-style
  `Cmd<Msg>` / `update` loop (see
  [Effects & Architecture](06-effects-and-architecture.md)). A more general
  algebraic-effects system — letting libraries define and handle their own
  effects — is under consideration but not part of the v1 contract.
- **Direct Wasm DOM access.** Today the Kernel is pure and view/DOM work is
  inferred onto the JS target; the Wasm module never touches the DOM directly.
  Letting the Kernel drive the DOM without the JS hop is a future possibility,
  pending browser-side ergonomics.
- **The Orchard registry.** The `orchard` client in
  [B.3](#b3-the-orchard-cli-implemented-in-v03--local-file-registry) is implemented
  against a **local file registry** (`orchard add` / `install` / `list` →
  `orchard_modules/`, auto-linked by `pcx`). A *networked* registry with version
  solving, lockfiles, publishing, and search remains future work.

---

## B.7 Further reading & influences

PecanX is a synthesis, not an invention from nothing. The ideas it leans on:

- **Elm** — the `Model`/`Msg`/`update`/`view` architecture, managed effects via
  commands, mandatory `else`, exhaustive case analysis, and the "no runtime
  exceptions" promise. PecanX's client architecture is directly descended from
  it.
- **Rust** — `Result`/`Option` as ordinary types, the `?` early-exit operator,
  pattern matching with exhaustiveness, and the discipline of pushing failure
  into the type system rather than into control flow.
- **Gleam** — the proof that a small, friendly, strongly-typed functional
  language can target more than one backend cleanly; PecanX's dual JS/Wasm story
  shares that spirit.
- **"Parse, don't validate"** — the opaque-type-plus-parser pattern in
  [Errors & Validation](05-errors-and-validation.md), where a value's type is
  evidence that it has already been checked.
- **Isomorphic / shared validation** — the central PecanX bet: compile the pure
  core to one WebAssembly module and run it identically on client and server.
  The reference app at [`../examples/pecanx-signup`](../examples/pecanx-signup)
  demonstrates the idea concretely.

To continue in the manual, return to the [Overview](00-overview.md), work
through the [Signup Tutorial](10-tutorial-signup.md), or browse the
[Standard Library](09-stdlib.md).
