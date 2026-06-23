# Todo Example

A small, single-screen todo app written in PecanX. It is split the way
every PecanX app should be:

- **`Domain.px`** — the **Kernel**. Pure types and rules: the opaque
  `Title`, the `Todo` record, the `Filter` sum type, and the pure
  helpers `addTodo`, `toggle`, `remove`, and `visibleTodos`. No DOM, no
  effects, no FFI — so the compiler places it in the shared Wasm
  module.
- **`Main.px`** — the **JS-target** client: `Model`, `Msg`, `update`,
  and `view`. It owns the wiring and the markup, and calls into
  `Domain` for every decision that matters.

Nothing reaches the Kernel without passing the Shell: the only way to
get a `Title` is `parseTitle`, which rejects empty input.

## Concepts shown

- **Opaque type + `parse`** — `opaque Title` hides its constructor, and
  `parse parseTitle(raw): Result<TitleError, Title>` is the single
  validated doorway in. `update` calls it on submit and reads the text
  back out with `Title.unwrap`. See
  [`docs/05-errors-and-validation.md`](../../docs/05-errors-and-validation.md).
- **Sum types** — `Filter = | All | Active | Completed` and the `Msg`
  type drive the whole UI. See
  [`docs/03-types.md`](../../docs/03-types.md).
- **List operations** — `addTodo` prepends with `[x, ...list]`,
  `toggle` and `visibleTodos` use `List.map` / `List.filter`, and the
  view uses `List.isEmpty` and `List.map`. See
  [`docs/09-stdlib.md`](../../docs/09-stdlib.md).
- **Exhaustive `match`** — `visibleTodos` matches every `Filter`
  constructor, `update` matches every `Msg`, and `viewTodo` matches on
  the `done: Bool` to choose its label. The compiler rejects any
  missing case. See
  [`docs/04-pattern-matching.md`](../../docs/04-pattern-matching.md).

For the architecture behind `Model` / `Msg` / `update` / `view`, see
[`docs/06-effects-and-architecture.md`](../../docs/06-effects-and-architecture.md).

## Runs headlessly via `pcx`

The `pcx` v0.1 compiler ([`../../compiler`](../../compiler)) **compiles and runs**
this app through its headless effect runtime. [`Demo.px`](./Demo.px) links all
three modules (`Demo` → `Main` → `Domain`) and scripts messages — add two items,
toggle one done, switch to the `Active` filter:

```bash
node ../../compiler/pcx.js run Demo.px
```

`Html` renders to a string after each step. The real-DOM backend is still pending.
Another runnable, end-to-end example is the
signup app at
[`examples/pecanx-signup`](../pecanx-signup) (TypeScript + Zod), which
demonstrates the same isomorphic-validation idea on a stack that
actually executes.
