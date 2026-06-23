# 07 · Full-stack

This is the payoff document. PecanX treats the client and server as **one program**
with a typed boundary, and it guarantees that shared logic is *literally the same
compiled code* on both sides.

## `server fn` — a function that runs on the server

Mark a function `server fn` and its body runs only on the backend, but it's
**callable from the client as an ordinary, fully-typed function**:

```px
-- server/Api.px
server fn getUser(id: UserId): Result<NotFound, User> =
  effect {
    let! row = Db.findUser(id)
    match row {
      None    -> Err(NotFound)
      Some(u) -> Ok(u)
    }
  }
```

The *type* of `getUser` is the contract. The compiler generates:

- a real handler on the server (the body above), and
- a typed client stub that performs the HTTP round-trip and decodes the response.

You call it from `update` like any effect:

```px
-- client/Main.px
ClickedUser(id) ->
  ({ ...model, status = Loading }, Server.call(getUser(id), GotUser))
```

There is no hand-written route, no URL string, no manual JSON decoding, and no
chance for the client's idea of the response shape to drift from the server's —
they're derived from the same signature. (This mirrors Leptos's `#[server]`
functions and the SAFE Stack's shared contracts, unified at the language level.)

## The Kernel split, concretely

Recall the placement rules from [01](01-getting-started.md):

| Your code | Compiles to | Runs on |
|---|---|---|
| Pure logic (validation, rules, pure transforms) | **Kernel** (one Wasm module) | **client *and* server** |
| `view`, event handlers, DOM/Web API glue | **JavaScript** | client |
| `server fn` bodies | server backend | server |

The Kernel is the crucial part. Here's the diagram for a signup:

```
   kernel/Signup/Domain.px   (pure: parse email/password/age, validate)
                 │  compiled ONCE to Wasm
        ┌────────┴─────────┐
        ▼                  ▼
   browser bundle      server process
   imports Kernel      imports the SAME Kernel
        │                  │
   live per-keystroke   authoritative check
   feedback             on submit
```

Both sides import the same Wasm module, so the validation rules and even the error
*messages* are guaranteed identical. There is no second implementation to keep in
sync, because there is no second implementation.

## Isomorphic validation — the canonical pattern

```px
-- kernel/Signup/Domain.px   (pure → Kernel → runs everywhere)
module Signup.Domain exposing (validate, RawSignup, SignupRequest, Errors)

fn validate(raw: RawSignup): Result<Errors, SignupRequest> = ...   -- see doc 05
```

```px
-- client/Main.px   (JS) — instant feedback, blocks bad submits
Changed(field, value) ->
  let form = setField(model.form, field, value)
  let errors = match validate(form) { Err(e) -> e, Ok(_) -> Errors.empty }
  ({ ...model, form, errors }, Cmd.none)
```

```px
-- server/Api.px   (server) — the authority; SAME validate()
server fn signup(raw: RawSignup): Result<Errors, UserId> =
  match validate(raw) {
    Err(errs) -> Err(errs)
    Ok(req)   ->
      effect {
        let! taken = Db.emailExists(req.email)
        if taken then Err({ ...Errors.empty, email = Some(BadEmailFormat) })
        else
          let! id = Db.insertUser(req)
          Ok(id)
      }
  }
```

The client check is a courtesy for UX; the server check is the law. They use one
`validate`. A malicious client that skips the browser entirely still hits the exact
same rules on the server — and the server adds checks only *it* can do (uniqueness,
the database), which the type system also forces you to handle.

## Shared types across the wire

Types used by a `server fn` signature are automatically shared. `RawSignup`,
`Errors`, and `User` above are defined once (in the Kernel) and used by client,
server, and the generated transport. Serialization/deserialization is derived from
the types — you never write a DTO twice or a decoder by hand.

```px
-- one definition, used on both sides and on the wire
type User = { id: UserId, email: Email, name: NonEmpty<String> }
```

## What this eliminates

- **Schema drift** between front and back end — structurally impossible.
- **Hand-written API clients** and the bugs in them — generated from signatures.
- **Duplicated validation** — one Kernel, two runtimes.
- **Untyped JSON at the boundary** — encode/decode is derived and checked.

## Performance notes

- Kernel code is Wasm: fast and deterministic, ideal for validation and number
  crunching.
- View code is JS, to avoid the Wasm↔DOM boundary cost (Wasm can't touch the DOM
  directly yet; going through JS for I/O-bound render code is the pragmatic choice).
- The compiler accounts for boundary-crossing cost when placing borderline code,
  and you can override with `@kernel` / `@js` when you know better.

## Next

[08 · FFI](08-ffi.md) — how to call JavaScript when you must, without losing the
guarantees.
