# 00 · Overview

PecanX is a statically typed, pure, full-stack language whose single goal is to
make **incorrect programs hard to write**. This document explains the philosophy,
the core model, and how PecanX relates to the languages it borrows from.

## The thesis

> Most production web bugs are not algorithmic mistakes. They are *representation*
> mistakes — a value that shouldn't exist, a case that wasn't handled, a contract
> that two sides interpreted differently.

PecanX attacks representation directly. Its features are chosen so that the
*types* carry the rules, and the compiler refuses to build a program that breaks
them.

| Bug family | How PecanX removes it |
|---|---|
| `null` / `undefined` | There is no `null`. Absence is the explicit type `Option<a>`, which you must unwrap. |
| Unhandled errors | Failure is a value: `Result<e, a>`. There are no exceptions to forget. |
| Impossible states | Sum types + exhaustive `match` make "loading *and* error" unrepresentable. |
| Client/server drift | Shared logic compiles to one **Kernel** (Wasm) that both sides run. |

## The Kernel / Shell model

PecanX splits every program into two conceptual regions.

### Kernel — the pure core

Your types, validation, parsing, and business rules are **pure**: same inputs,
same outputs, no side effects. Because they're pure, the compiler can compile them
once to a **single WebAssembly module** and execute that module *anywhere* —
in the browser for instant feedback, on the server as the source of truth.

This is the property that makes "validation that runs identically on client and
server" structural rather than aspirational: it is *literally the same compiled
code*, so the two sides cannot disagree.

### Shell — the protective boundary

Everything dangerous lives in the Shell:

- The **type system** and **exhaustiveness checker** — nothing ill-typed or
  unhandled gets through.
- The **quarantined FFI** — calls into raw JavaScript (to reach the DOM, Web APIs,
  or the npm ecosystem) are explicitly marked, fully typed at the boundary, and
  prevented from leaking `any`/exceptions into the Kernel. See
  [08-ffi.md](08-ffi.md).

The rule: **nothing reaches the Kernel without passing the Shell.**

## Dual targets: JS *and* Wasm

PecanX deliberately targets both, and lets the compiler decide placement:

| Code | Target | Why |
|---|---|---|
| Pure logic (Kernel) | **Wasm** | Fast, deterministic, shared between client & server |
| Views, DOM, event handlers, Web API glue | **JavaScript** | Avoids the Wasm↔DOM boundary tax; this code is I/O-bound anyway |
| `server fn` bodies | **Server** (JS or native) | Runs only on the backend; callable type-safely from the client |

Because Kernel code is pure, *which* target it lands on is an optimization detail
with no observable effect — the semantics are identical either way. You can nudge
placement with `@kernel` / `@js` annotations, but you rarely need to. See
[07-full-stack.md](07-full-stack.md).

## What PecanX is *not*

- **Not object-oriented.** No classes, inheritance, or `this`. Data is records and
  sum types; behavior is functions.
- **Not exception-based.** Errors are ordinary values you must handle.
- **Not mutable-by-default.** Bindings are immutable; "updating" produces a new value.
- **Not a framework on top of JS.** Reactivity and the client/server boundary are
  language-level, not library conventions.

## How it relates to existing languages

PecanX is a synthesis, not an invention from nothing. Honest lineage:

| Influence | What PecanX takes |
|---|---|
| **Elm** | The Model/Msg/update/view architecture, "no runtime exceptions," friendly errors, the centralized-effects model. |
| **Rust** | `Result`/`Option` as the error and absence story, a serious type system, `server fn` ≈ Leptos server functions, Wasm as a first-class target. |
| **Gleam / F# (Fable)** | One language, multiple targets, shared types across the client/server boundary. |
| **Haskell / ML** | Sum types, type inference, "parse, don't validate," purity. |
| **TypeScript + Zod** | The pragmatic proof that one schema on both sides works — the basis of the runnable reference implementation. |

The combination PecanX targets — *pure + sound + automatic JS/Wasm split + unified
full-stack with one shared Kernel* — is not something any single shipping language
gives you today. That gap is the reason it's worth building.

## Reading order

If you're new, read in numeric order: [01-getting-started.md](01-getting-started.md)
→ [02](02-syntax-basics.md) → [03](03-types.md) → [04](04-pattern-matching.md) →
[05](05-errors-and-validation.md). Then the system-level docs:
[06 effects/architecture](06-effects-and-architecture.md),
[07 full-stack](07-full-stack.md), [08 FFI](08-ffi.md). Keep
[09 stdlib](09-stdlib.md) as a reference and finish with the
[10 tutorial](10-tutorial-signup.md).
