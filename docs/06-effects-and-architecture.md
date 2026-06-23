# 06 · Effects & architecture

If everything is pure, how does anything *happen* — HTTP, time, randomness, the
DOM? PecanX uses **managed effects**: your code never performs a side effect
directly; it *describes* one as a value, and the runtime performs it. This keeps
the Kernel pure (and therefore shareable and testable) while still doing real work.

## The application loop: Model / Msg / update / view

A PecanX client app is four pieces, the same shape Elm popularized:

```px
type Model = ...                       -- all your state, in one immutable value
type Msg   = ...                       -- everything that can happen, as a sum type

fn init(): (Model, Cmd<Msg>)           -- starting state + initial effects
fn update(msg: Msg, model: Model): (Model, Cmd<Msg>)   -- how state evolves
fn view(model: Model): Html<Msg>       -- pure render of state to UI
```

The runtime wires them together:

```
        ┌─────────────┐   Msg    ┌──────────┐
        │   runtime    │ ───────▶ │  update  │
        │ (performs    │          └────┬─────┘
        │  effects,    │   (Model, Cmd)│
        │  renders)    │ ◀─────────────┘
        └──────┬───────┘
               │ Html<Msg>      ▲
               ▼                │ Msg (from clicks, responses, timers)
            the DOM ────────────┘
```

- `view` turns the current `Model` into `Html`. It is **pure** — no fetching, no
  mutation — so it's trivial to reason about and test.
- User interaction and effect results arrive as `Msg` values.
- `update` is the *only* place state changes, and it changes by returning a **new**
  `Model` plus a `Cmd` describing any effects to run next.

Because `update` and `view` are pure functions of their inputs, the entire UI is
deterministic: same `Model`, same screen; same `(Msg, Model)`, same transition.

## `Cmd<Msg>` — effects as values

A `Cmd<Msg>` is a *description* of work to perform, tagged with the `Msg` its result
should become. Your code builds `Cmd`s; the runtime runs them and feeds results
back through `update`.

```px
fn update(msg: Msg, model: Model): (Model, Cmd<Msg>) =
  match msg {
    ClickedLoad ->
      ({ ...model, status = Loading }, Http.get("/api/users", GotUsers))
      --                               └ a Cmd<Msg>: "fetch, then send GotUsers"

    GotUsers(result) ->
      match result {
        Ok(users) -> ({ ...model, status = Success(users) }, Cmd.none)
        Err(e)    -> ({ ...model, status = Failure(e) }, Cmd.none)
      }

    Tick ->
      (model, Cmd.none)
  }
```

Useful combinators:

| Cmd | Meaning |
|---|---|
| `Cmd.none` | do nothing |
| `Cmd.batch([c1, c2])` | run several effects |
| `Http.get(url, toMsg)` / `Http.post(...)` | HTTP, result → `toMsg` |
| `Time.now(toMsg)` | read the clock (effects, not a pure call) |
| `Random.int(lo, hi, toMsg)` | randomness |
| `Nav.push(url)` | client-side navigation |

Note what's *not* here: there's no way to "just fetch" inside `view` or a pure
function. Effects can only enter through `Cmd`, returned from `update`. That's what
keeps purity honest.

## `effect { }` blocks & `let!`

Some code is legitimately a sequence of effects — most often a `server fn` talking
to a database. An `effect { }` block provides do-notation: `let!` runs an effectful
step and binds its result before the next line.

```px
server fn placeOrder(cart: Cart): Result<OrderError, OrderId> =
  effect {
    let! stock = Db.checkStock(cart)         -- await an effect
    if not stock.ok then
      Err(OutOfStock)
    else
      let! id = Db.insertOrder(cart)         -- await the next
      let! _  = Email.sendReceipt(cart.user, id)
      Ok(id)
  }
```

`let!` is to effects what `?` is to `Result`: it sequences them readably while the
types stay precise. An `effect` block's own type is still a `Result`/value — the
effects are tracked by the type system, not hidden.

## Why managed effects?

- **The Kernel stays pure.** Validation and business logic never touch I/O, so the
  exact same code runs on client and server (see [07](07-full-stack.md)).
- **Testing is trivial.** `update` is `(Msg, Model) -> (Model, Cmd)`. You assert on
  the returned `Model` and `Cmd` *without* performing any effect — no mocks, no
  network, no clock.
- **Time-travel & replay.** Since state transitions are pure and driven by `Msg`
  values, the runtime can record and replay them — the basis for great debugging
  tools.

## A note on the model

PecanX's documented effect system is the **centralized** one above (simple,
predictable, Elm-like). A more flexible **algebraic effects** model — where you can
define and handle your own effect types — is a planned extension. The centralized
model is the recommended default and the one the tutorial uses.

## Next

[07 · Full-stack](07-full-stack.md) — `server fn` and the one-Kernel-two-runtimes
payoff.
