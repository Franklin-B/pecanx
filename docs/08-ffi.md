# 08 · FFI — the quarantined JavaScript boundary

PecanX must interoperate with JavaScript: to reach the DOM, Web APIs, and the npm
ecosystem. This is the single most dangerous thing the language does, because JS
has `null`, exceptions, and `any` — exactly the things PecanX exists to remove. So
the FFI is **the Shell's job**: every crossing is explicitly marked, typed at the
boundary, and prevented from leaking untyped values into the Kernel.

> Rule of the Shell: **nothing reaches the Kernel without passing through the
> Shell.** The FFI is where you crack the shell, and the language makes that act
> visible and contained.

## Declaring an external function

You bind a JS function with `extern`, giving it a PecanX type. The compiler trusts
that type at the boundary and holds you to it everywhere else:

```px
-- A foreign import. The string is the JS to call; the signature is the
-- contract PecanX enforces on the PecanX side.
extern fn now(): Float =
  js "Date.now()"

extern fn setTitle(title: String): Unit =
  js "(t) => { document.title = t; }"
```

`extern fn` declarations are only allowed in modules compiled to **JS** (client or
server), never in the Kernel — purity forbids it. The compiler enforces this.

## Quarantine: foreign values are untrusted

A value coming back from JS could be `null`, the wrong shape, or throw on access.
PecanX refuses to let such a value masquerade as a trusted type. Foreign results
must enter through a **decoder**, which turns the wild JS value into a typed
`Result`:

```px
extern fn rawGetItem(key: String): Foreign =     -- `Foreign` = "untrusted JS value"
  js "(k) => window.localStorage.getItem(k)"

-- The ONLY way to turn a Foreign into a real type is to decode it.
fn getFlag(key: String): Result<DecodeError, Bool> =
  rawGetItem(key)
    |> Decode.run(Decode.bool)

-- localStorage may return null → Decode handles it as a typed failure,
-- not a crash.
```

`Foreign` is a special opaque type meaning "a JS value we have not validated yet."
You cannot pattern-match it, call methods on it, or pass it where a real type is
expected. Its only exit is `Decode.run`, which yields a `Result`. That's the
quarantine: untyped data is boxed until it's been checked.

## Calls that can throw

JS throws exceptions; PecanX doesn't have them. Wrap a throwing import so the throw
becomes an `Err`:

```px
extern fn parseJsonUnsafe(s: String): Foreign =
  js throws "(s) => JSON.parse(s)"      -- `throws` marks it as exception-capable

-- `throws` forces the result into Result; a thrown error becomes Err(JsException).
fn parseJson(s: String): Result<JsException, Foreign> =
  parseJsonUnsafe(s)
```

Marking an import `js throws` makes the compiler require you to handle the failure
path — a JS exception can never silently propagate into PecanX code.

## Wrapping an npm package

The idiomatic pattern is a thin, typed wrapper module that is the *only* place the
package is touched. The rest of your code imports the wrapper and sees clean types:

```px
module Ext.Marked   -- typed wrapper around the `marked` markdown library

extern fn rawParse(md: String): Foreign =
  js throws "import('marked').then(m => m.parse)"   -- (illustrative)

-- the public, trustworthy surface:
fn toHtml(md: String): Result<RenderError, Html> =
  rawParse(md)
    |> Result.mapErr(\_ -> RenderError.Failed)
    |> Result.andThen(Decode.run(Decode.html))
```

Now `Ext.Marked.toHtml` is a normal PecanX function. The `extern`, the `Foreign`,
and the `throws` are all sealed inside one audited module. If markdown rendering
ever misbehaves, you know exactly where to look — the blast radius is one file.

## Exposing PecanX to JS

The reverse direction (letting hand-written JS call your PecanX code) uses
`@export`:

```px
@export("scoreAnswers")
fn scoreAnswers(input: Answers): Int = ...
```

This emits `scoreAnswers` on the module's JS exports with a generated, type-checked
wrapper that marshals arguments and results.

## Guidelines

1. **Keep `extern` at the leaves.** One wrapper module per external dependency.
2. **Never return `Foreign` from a public function.** Decode it first; expose real
   types.
3. **Mark anything that can throw `js throws`.** Let the type system force handling.
4. **Audit wrappers like security boundaries** — because they are. Every guarantee
   in the rest of the program depends on the wrappers being honest about their
   types.

The FFI is the one place PecanX's guarantees can leak. The language can't make raw
JS safe — but it makes the unsafe surface *small, explicit, and contained*, instead
of letting `any` seep through the whole codebase.

## Next

[09 · Standard library](09-stdlib.md).
