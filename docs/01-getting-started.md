# 01 · Getting started

> **Status:** `pcx` **v0.3** is real — it lives in [`../compiler`](../compiler). It
> lexes, parses, checks `match` exhaustiveness, infers and checks types
> whole-program (Hindley-Milner, `--types`), links multiple modules, and compiles a
> useful subset of PecanX to **JavaScript, WebAssembly** (`Int`/`Float`/records/
> sum-types/strings via WasmGC), or a **virtual-DOM-diffing real-DOM app**
> (`--target dom`), then runs it. It also ships `fmt`, `lsp`, `dev`, and the
> **Orchard** package manager. The commands below describe the full intended
> experience; Wasm closures, the `?` operator, a networked registry, and richer
> LSP features are still pending (see [Appendix B](appendix-b-reference.md)). A
> second runnable artifact is the TypeScript + Zod app in
> [`../examples/pecanx-signup`](../examples/pecanx-signup).

## Install

```bash
# install the PecanX toolchain (compiler `pcx` + package manager `orchard`)
curl -fsSL https://get.pecanx.dev | sh

pcx --version
```

## Hello, world

Create `hello.px`:

```px
module Hello

fn main(): Unit =
  Console.log("Hello from the Kernel.")
```

Run it:

```bash
pcx run hello.px
```

`pcx run` type-checks, compiles, and executes. For a one-file program like this,
the whole thing is pure Kernel code.

## A new project

```bash
pcx new orchard-app
cd orchard-app
```

This scaffolds the standard full-stack layout:

```
orchard-app/
├── pecanx.toml          project + dependency manifest
├── kernel/              pure, shared code → compiles to one Wasm module
│   └── Domain.px
├── client/              views & event handling → compiles to JS
│   └── Main.px
├── server/              server fn implementations → backend
│   └── Api.px
└── tests/
```

The directory names are conventions, not magic: the compiler decides placement
from *what the code does* (see [Placement](#placement)). The folders just keep
intent obvious to humans.

## The manifest: `pecanx.toml`

```toml
[package]
name = "orchard-app"
version = "0.1.0"

[targets]
client = "client/Main.px"     # entry compiled to JS + Wasm bundle
server = "server/Api.px"      # entry compiled for the backend

[dependencies]
http = "1.2"                  # resolved from the Orchard registry
json = "1.0"
```

## Building & running

```bash
pcx check          # type-check only — fast, no output artifacts
pcx build          # compile: kernel → Wasm, client → JS, server → backend
pcx dev            # watch + hot reload, serves client and server together
pcx test           # run everything under tests/
pcx fmt            # format all .px files
```

`pcx dev` is the everyday loop: it serves the client, runs the server, wires
`server fn` calls between them, and reloads on change.

## Placement

By default you never assign code to a target — the compiler infers it:

- **Pure** functions (no effects, no DOM, no FFI) → **Kernel** (Wasm), available to
  both client and server.
- Functions that build `Html` or touch Web APIs → **JS** (client).
- `server fn` → **server** only, exposed to the client as a typed call.

Override only when you must:

```px
@kernel   -- force into the shared Wasm core (compiler will reject it if impure)
fn score(input: Answers): Int = ...

@js       -- force JS codegen (e.g. it must touch a browser-only API directly)
fn focusFirstField(): Unit = ...
```

If you mark something `@kernel` that isn't pure, **it won't compile** — the Shell
won't let impurity into the Kernel. That error is a feature.

## Managing dependencies with Orchard

```bash
orchard add http          # add a dependency, update pecanx.toml + lockfile
orchard add json@1.0
orchard remove http
orchard update            # update within semver ranges
orchard publish           # publish your own package to the registry
```

Packages are themselves PecanX code, so a dependency's purity and types are known
to the compiler — a Kernel-only library can be guaranteed to stay out of your JS
bundle.

## Editor support

`pcx lsp` starts a Language Server providing types-on-hover, exhaustiveness
diagnostics, go-to-definition, and inline error messages. Editor extensions wrap
it; the protocol is standard LSP.

## Next

Learn the language itself, starting with [02 · Syntax basics](02-syntax-basics.md).
