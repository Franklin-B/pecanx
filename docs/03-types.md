# 03 · Types

Types are where PecanX does its real work. The guiding principle:

> **Make illegal states unrepresentable.** If a combination of values should never
> occur, design the type so it *can't* — then the compiler enforces it for free.

## Type inference

You rarely annotate locals; the compiler infers them (Hindley–Milner style).
Annotate **public function signatures** and **type declarations** — they're
documentation and they pin down intent — and let inference handle the rest.

```px
fn double(n: Int): Int = n * 2     -- signature annotated
let xs = [1, 2, 3]                 -- inferred: List<Int>
let ys = List.map(double, xs)      -- inferred: List<Int>
```

## Records

Records are product types — a fixed set of named fields.

```px
type User = {
  id: UserId,
  name: String,
  email: Email,
}

-- construction uses `=`
let u: User = { id = UserId(1), name = "Ada", email = someEmail }

-- access with dot
let n = u.name

-- update produces a NEW record (the original is untouched)
let renamed = { ...u, name = "Ada L." }
```

Field punning works in construction when a binding has the field's name:

```px
let name = "Ada"
let email = someEmail
let u = { id = UserId(1), name, email }   -- name = name, email = email
```

## Sum types (tagged unions)

Sum types are how you model "one of several shapes." Each variant may carry data.

```px
type Shape =
  | Circle(radius: Float)
  | Rect(width: Float, height: Float)
  | Point

fn area(s: Shape): Float =
  match s {
    Circle(r)    -> 3.14159 * r * r
    Rect(w, h)   -> w * h
    Point        -> 0.0
  }
```

This is the single most important tool for correctness. The canonical example —
a remote data value that can't be in two states at once:

```px
type Remote<e, a> =
  | NotAsked
  | Loading
  | Failure(e)
  | Success(a)
```

There is no way to represent "loading *and* failed," because the type only permits
exactly one variant at a time. A whole class of UI bugs is gone by construction.

## Generics

Type parameters are lowercase and listed in `< >`:

```px
type Pair<a, b> = { first: a, second: b }

fn swap(p: Pair<a, b>): Pair<b, a> =
  { first = p.second, second = p.first }
```

Built-in generic types you'll use constantly:

| Type | Meaning |
|---|---|
| `List<a>` | An ordered, immutable list |
| `Option<a>` | A value that may be absent (replaces `null`) |
| `Result<e, a>` | A success `a` or a failure `e` |
| `Dict<k, v>` | An immutable key/value map |
| `(a, b)` | A tuple (anonymous product) |

## No `null` — `Option` instead

PecanX has **no `null` and no `undefined`.** Absence is explicit:

```px
type Option<a> =
  | None
  | Some(a)

fn findUser(id: UserId): Option<User> = ...

-- You can't use the value without acknowledging it might be missing:
match findUser(id) {
  None      -> "no such user"
  Some(u)   -> u.name
}
```

Because absence is in the type, "cannot read property of undefined" is not a thing
that can happen.

## Opaque types — "parse, don't validate"

An `opaque` type hides its constructor. The **only** way to create one is through
its `parse` function, which validates first. So anywhere you *have* the type, it's
already valid — downstream code never re-checks.

```px
opaque Email          -- the representation (a String) is hidden

-- `parse` is the sole constructor for Email. The `Email(...)` constructor
-- is in scope ONLY inside this parser.
parse email(raw: String): Result<FieldError, Email> =
  let s = String.trim(raw)
  if String.contains(s, "@") then Ok(Email(s))
  else Err(BadEmailFormat)

-- read the wrapped value back out with an explicit accessor
fn emailToString(e: Email): String = Email.unwrap(e)
```

Contrast the two styles:

```px
-- validate (weak): returns a Bool, the String stays a String,
-- every later function must defend against bad input again.
fn isValidEmail(s: String): Bool = ...

-- parse (strong): returns Result<_, Email>. Once you hold an Email,
-- the type itself is the proof it's valid. No re-checking, ever.
parse email(raw: String): Result<FieldError, Email> = ...
```

Use opaque + `parse` for every domain value with rules: `Email`, `Password`,
`Age`, `Slug`, `NonEmpty<String>`, `PositiveInt`, and so on. This is the backbone
of [errors & validation](05-errors-and-validation.md).

## Type aliases

For naming without hiding the representation:

```px
type alias UserId = Int        -- UserId and Int are interchangeable
type alias Json = String
```

(Use `opaque` when you want the rules enforced; use `type alias` for pure
readability where any value of the underlying type is acceptable.)

## Records vs. sum types — a rule of thumb

- Use a **record** when you have *all* of these fields at once (a User *has* an id
  *and* a name *and* an email).
- Use a **sum type** when you have *one of* these shapes (a Payment *is* Cash *or*
  Card *or* Invoice).

Most good domain models are records of sum types of records. When a bug feels like
"this state shouldn't be possible," the fix is almost always to reshape the type so
it isn't.

## Next

[04 · Pattern matching](04-pattern-matching.md) — how you take these types apart
safely.
