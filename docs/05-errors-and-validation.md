# 05 · Errors & validation

PecanX has **no exceptions.** Anything that can fail says so in its type, and the
compiler makes you handle it. This document covers `Result`, `Option`, the
`?` operator, and the validation discipline that is PecanX's signature feature.

## `Result<e, a>`

```px
type Result<e, a> =
  | Ok(a)
  | Err(e)
```

A function that can fail returns a `Result`. The caller cannot reach the success
value without confronting the failure:

```px
fn divide(a: Int, b: Int): Result<MathError, Int> =
  if b == 0 then Err(DivByZero)
  else Ok(a / b)

match divide(10, x) {
  Ok(n)          -> "got ${Int.toString(n)}"
  Err(DivByZero) -> "can't divide by zero"
}
```

Errors are **typed** — `MathError` is a sum type you define — so "what can go
wrong here" is documented and exhaustively handled, not a stringly-typed mystery.

## `Option<a>` vs `Result<e, a>`

- `Option<a>` — a value is present or absent, and absence needs no explanation
  (a lookup that found nothing).
- `Result<e, a>` — an operation succeeded or failed *for a reason* you want to
  carry.

Convert between them when the reason matters:

```px
findUser(id)                         -- Option<User>
  |> Option.toResult(UserNotFound)   -- Result<AppError, User>
```

## The `?` operator — early-exit on error

Chaining `Result`-returning calls by hand is verbose. The `?` operator unwraps an
`Ok`, or short-circuits the whole function by returning the `Err`:

```px
fn parseConfig(raw: String): Result<ConfigError, Config> =
  let json = Json.parse(raw)?           -- if Err, return it now
  let host = Json.field("host", json)?
  let port = Json.field("port", json)?
  Ok({ host = host, port = port })
```

Without `?`, that's a four-level nested `match`. With it, the happy path reads
linearly and the error path is still fully typed and total. `?` is only usable in a
function whose return type is a `Result` (or `Option`) with a compatible error type.

## Combining many results

When you want **all** the errors, not just the first (e.g. validating a form),
collect them instead of short-circuiting:

```px
-- Result.map3 succeeds only if all three do; otherwise it gathers errors.
Result.map3(
  email(raw.email),
  password(raw.password),
  age(raw.age),
  \e, p, a -> { email = e, password = p, age = a }
)
```

There are `map2`…`mapN`, plus `Result.all : List<Result<e, a>> -> Result<List<e>, List<a>>`
for homogeneous collections. The form tutorial uses this to report every invalid
field at once.

## Parse, don't validate

This is the discipline that makes the type system pay off. Stated as a rule:

> **A function that checks data should also *return the refined type*, not a
> boolean.** Push validation to the boundary; trust the types within.

### The weak way (don't)

```px
fn isValidEmail(s: String): Bool = ...

-- now EVERY function downstream still takes a raw String and must
-- wonder whether it was checked. The knowledge is lost immediately.
fn sendWelcome(to: String): Result<SendError, Unit> = ...
```

### The PecanX way

```px
opaque Email
parse email(raw: String): Result<FieldError, Email> = ...

-- downstream takes Email, not String. The type is the proof.
-- It is impossible to call this with an unvalidated address.
fn sendWelcome(to: Email): Result<SendError, Unit> = ...
```

You validate **once**, at the edge of the system, and convert raw input into
precise types. Everything inside the boundary operates on those types and never
re-checks — because the types already guarantee what would have been re-checked.

### A small validation module

```px
module Signup.Domain

opaque Email
opaque Password
opaque Age

type FieldError =
  | Empty
  | BadEmailFormat
  | TooShort(min: Int)
  | TooWeak
  | TooYoung(min: Int)

parse email(raw: String): Result<FieldError, Email> =
  let s = String.trim(raw)
  if String.isEmpty(s) then Err(Empty)
  else if not (String.contains(s, "@") and String.contains(s, ".")) then Err(BadEmailFormat)
  else Ok(Email(s))

parse password(raw: String): Result<FieldError, Password> =
  if String.length(raw) < 8 then Err(TooShort(min = 8))
  else if not (hasLetter(raw) and hasDigit(raw)) then Err(TooWeak)
  else Ok(Password(raw))

parse age(raw: String): Result<FieldError, Age> =
  match Int.parse(raw) {
    None    -> Err(Empty)
    Some(n) -> if n < 18 then Err(TooYoung(min = 18)) else Ok(Age(n))
  }
```

Because this module is **pure**, it compiles to the Kernel and runs on both the
client (instant feedback) and the server (authority) — the same code, so they can
never disagree. That cross-target story is the subject of
[07 · Full-stack](07-full-stack.md), and the full form is built in the
[tutorial](10-tutorial-signup.md).

## What you never write

- `try` / `catch` — there are no exceptions.
- `throw` — failures are returned, not thrown.
- `x != null` guards — absence is `Option`, handled by `match`.
- defensive re-validation deep in the call stack — the types already proved it.

## Next

[06 · Effects & architecture](06-effects-and-architecture.md) — how pure code talks
to an impure world.
