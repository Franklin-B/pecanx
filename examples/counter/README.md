# Counter Example

The smallest complete PecanX client app. It demonstrates the four pieces of
the PecanX client architecture working together with nothing else in the way:

- **`Model`** — the entire application state. Here it is a record with one
  field, `count: Int`.
- **`Msg`** — a sum type enumerating every way the state can change:
  `Increment`, `Decrement`, and `Reset`.
- **`init`** — produces the starting `Model` plus a `Cmd<Msg>` of effects to
  run on launch. This counter starts at `0` with `Cmd.none`.
- **`update`** — a **pure** function `(Msg, Model) -> (Model, Cmd<Msg>)`. It
  matches exhaustively over `Msg`, returning a new `Model` (state is
  immutable, so it builds one with `{ ...model, count = ... }`) and any
  follow-up command.
- **`view`** — a **pure** function `Model -> Html<Msg>`. It renders three
  buttons and a label; each button wires a `Msg` via `Event.onClick`, which
  flows back into `update`.

The data loop is: `view` emits a `Msg` on click -> `update` folds it into a
new `Model` -> `view` re-renders. Because `update` and `view` are pure and
side-effect-free, the whole core compiles to the Kernel (one WebAssembly
module) and is trivially testable.

## Files

```text
counter/
  Main.px     # module Counter.Main — Model, Msg, init, update, view
  README.md   # this file
```

`Main.px` is the only source file; the app needs nothing more.

## Runs headlessly via `pcx`

The `pcx` v0.1 compiler ([`../../compiler`](../../compiler)) **compiles and runs**
this app through its headless effect runtime. [`Demo.px`](./Demo.px) imports
`init` / `update` / `view` and scripts a sequence of messages:

```bash
node ../../compiler/pcx.js run Demo.px
```

`Html` renders to a string, so you see the view after each message (count
0 → 1 → 2 → 3 → 2 → 0). The real-DOM backend is still pending — see
[Appendix B](../../docs/appendix-b-reference.md).

For a version that actually runs today, see the
[`pecanx-signup`](../pecanx-signup) example (a TypeScript + Zod realization of
the same isomorphic ideas).

## Learn more

- [`../../docs/06-effects-and-architecture.md`](../../docs/06-effects-and-architecture.md)
  — `Model` / `Msg` / `init` / `update` / `view`, `Cmd`, and the update loop.
- [`../../docs/02-syntax-basics.md`](../../docs/02-syntax-basics.md)
  — bindings, functions, records, and string interpolation.
- [`../../docs/04-pattern-matching.md`](../../docs/04-pattern-matching.md)
  — exhaustive `match` over sum types like `Msg`.
