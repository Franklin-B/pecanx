# PecanX Examples

A catalog of example applications, kept here for dissemination and as a learning companion to the [manual](../docs/00-overview.md). Each example pairs with a short tutorial-grade idea: validation, the client architecture, data modeling, and remote state.

Everything here is runnable. `pecanx-signup` is a TypeScript + Zod reference that realizes the isomorphic-validation idea (one set of rules, shared by client and server) using tools you can install right now. The three `.px` apps **compile and run headlessly** under the real `pcx` v0.1 compiler in [`../compiler`](../compiler): each ships a `Demo.px` driver that imports the app and scripts a sequence of messages through `pcx`'s minimal effect runtime, rendering the view to a string after each step. Run one with `node ../../compiler/pcx.js run Demo.px` from its folder (the real-DOM backend and networked effects are still pending). A pure validation program, [`compiler/examples/signup_demo.px`](../compiler/examples/signup_demo.px), also runs end to end.

| Example | Path | Demonstrates | Runnable? |
| --- | --- | --- | --- |
| pecanx-signup | [`examples/pecanx-signup`](./pecanx-signup) | Isomorphic client/server validation (Kernel rules shared across both ends) | **YES** — `cd pecanx/examples/pecanx-signup` then `npm run dev` |
| counter | [`examples/counter`](./counter) | The `Model` / `Msg` / `update` / `view` architecture | **Runs headlessly** — `pcx run counter/Demo.px` |
| todo | [`examples/todo`](./todo) | `opaque` + `parse`, sum types, list ops, exhaustive `match` | **Runs headlessly** — `pcx run todo/Demo.px` |
| remote-users | [`examples/remote-users`](./remote-users) | `server fn` + `Server.call` + `Remote<e, a>` rendering | **Runs headlessly** — `pcx run remote-users/Demo.px` |

## pecanx-signup

The reference application, and the only one that runs. It is a TypeScript + Zod realization of PecanX's central idea: the same validation rules live in one place and protect both the browser form and the server endpoint, so the client and server can never disagree about what a valid signup is. Start it with `cd pecanx/examples/pecanx-signup` then `npm run dev`. See its [folder README](./pecanx-signup/README.md) for setup and a walkthrough, and the matching [signup tutorial](../docs/10-tutorial-signup.md) for the PecanX version of the same design.

## counter

The smallest complete client app: a single `Int` in the `Model`, an `Increment` / `Decrement` `Msg`, a pure `update`, and a `view` that wires buttons to messages. It is the gentlest introduction to the architecture described in [06-effects-and-architecture.md](../docs/06-effects-and-architecture.md). See its [folder README](./counter/README.md).

## todo

A task list that leans on PecanX's modeling tools. Item text is an `opaque` type produced by a `parse` function (no empty todos can exist), items carry a sum-type status, and the list is transformed with `List.map` / `List.filter` and rendered through an exhaustive `match`. It draws on [03-types.md](../docs/03-types.md), [04-pattern-matching.md](../docs/04-pattern-matching.md), and [05-errors-and-validation.md](../docs/05-errors-and-validation.md). See its [folder README](./todo/README.md).

## remote-users

A full-stack example: a `server fn` fetches users from the database, the client invokes it with `Server.call`, and the result is held as a `Remote<e, a>` so the `view` can render the `NotAsked` / `Loading` / `Failure` / `Success` states explicitly with a single `match`. It builds on [07-full-stack.md](../docs/07-full-stack.md). See its [folder README](./remote-users/README.md).
