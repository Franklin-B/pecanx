# remote-users

A small full-stack PecanX example: click a button, fetch a list of users
from the server, and render every state of that request exhaustively.

## What it shows

- **`server fn`** — `listUsers` in [`Api.px`](Api.px) is a server-only
  function. Its body is an `effect { }` block, which is the only place
  `Db.*` calls are allowed. It returns a `Result<LoadError, List<User>>`,
  and the `match` over the `Db.query` outcome handles both the failure
  and success branches (no catch-all). See
  [06-effects-and-architecture.md](../../docs/06-effects-and-architecture.md)
  and [07-full-stack.md](../../docs/07-full-stack.md).

- **`Server.call`** — In [`Main.px`](Main.px), `update` reacts to
  `ClickedLoad` by issuing `Server.call(listUsers(), GotUsers)`. The
  helper takes the server endpoint plus a `Msg` constructor; when the
  call resolves, its `Result<LoadError, List<User>>` arrives back in
  `update` as `GotUsers(result)`. No exceptions, no promises — just a
  tagged effect described by a `Cmd<Msg>`.

- **The `Remote` type** — `Model.users` has type
  `Remote<LoadError, List<User>>`. `Remote` has exactly four
  constructors — `NotAsked`, `Loading`, `Failure(e)`, `Success(a)` — so
  the request lifecycle lives in one field and the illegal states
  (loaded-but-no-data, error-and-data-at-once) cannot be represented.
  `ClickedLoad` moves it to `Loading`; `GotUsers` folds the returned
  `Result` into `Success`/`Failure`.

- **Exhaustive rendering** — `viewUsers` is a single `match` over the
  `Remote` value. The compiler refuses to build if any of the four
  states is missing, so the loading spinner, the error message, the
  empty-vs-populated list, and the "not asked yet" prompt all have a
  home. `errorToString` is likewise exhaustive over `LoadError`. See
  [04-pattern-matching.md](../../docs/04-pattern-matching.md) and
  [05-errors-and-validation.md](../../docs/05-errors-and-validation.md).

## The shared `User` type

`User` is a plain record of primitives, so PecanX places it in the
Kernel — the one WebAssembly module shared by client and server. The
server fills it from a database row; the client renders it. There is no
second definition to keep in sync.

## Files

- [`Api.px`](Api.px) — `User`, `LoadError`, and the `server fn listUsers`.
- [`Main.px`](Main.px) — `Model` / `Msg` / `init` / `update` / `view`.

## Runs headlessly via `pcx`

The `pcx` v0.1 compiler ([`../../compiler`](../../compiler)) **compiles and runs**
this full-stack app through its headless effect runtime. [`Demo.px`](./Demo.px)
dispatches `ClickedLoad`, which triggers the `server fn` (synchronous in-memory
`Db`); its `Result` flows back as `GotUsers`, and the view renders `NotAsked`,
then `Loading`, then the `Success` list:

```bash
node ../../compiler/pcx.js run Demo.px
```

Asynchronous/networked effects and a real DOM are still pending. A second runnable
artifact is the reference app at [`../pecanx-signup`](../pecanx-signup) (a
TypeScript + Zod realization of the same isomorphic-validation idea). Start the tour with
[00-overview.md](../../docs/00-overview.md).
