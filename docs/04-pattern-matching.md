# 04 · Pattern matching

`match` is how you take a value apart. Its defining feature in PecanX is
**exhaustiveness**: the compiler proves you've handled every possible case, or it
refuses to build.

## Basics

```px
fn describe(s: Shape): String =
  match s {
    Circle(r)   -> "circle of radius ${Float.toString(r)}"
    Rect(w, h)  -> "rectangle ${Float.toString(w)}×${Float.toString(h)}"
    Point       -> "a point"
  }
```

Each arm is `pattern -> expression`. Every arm must produce the same type (here,
`String`), so the whole `match` is itself an expression with that type.

## Exhaustiveness — the safety net

Leave a case out and you get a compile error, not a silent fall-through:

```px
fn area(s: Shape): Float =
  match s {
    Circle(r)  -> 3.14159 * r * r
    Rect(w, h) -> w * h
    -- forgot Point
  }
```

```
error: this `match` does not cover all cases
  missing variant: Point
  --> kernel/Shape.px:3:3
```

The payoff compounds over time: **add a new variant to a sum type, and the
compiler walks you to every `match` that must now account for it.** Refactors that
would be terrifying in a dynamically typed codebase become mechanical.

## Wildcards

`_` matches anything and is how you opt out of exhaustiveness deliberately:

```px
match status {
  Active   -> "go"
  _        -> "stop"     -- everything else
}
```

Use `_` sparingly. An explicit list of variants keeps the compiler's help; a
wildcard throws it away for the cases it covers.

## Destructuring

Patterns nest, so you can reach into structure in one step.

### Records

```px
fn fullName(u: User): String =
  match u {
    { name, email } -> "${name} <${Email.unwrap(email)}>"
  }

-- more commonly, destructure directly in a binding or parameter:
let { name, email } = u
```

### Tuples

```px
fn quadrant(p: (Int, Int)): String =
  match p {
    (0, 0)            -> "origin"
    (x, 0)            -> "on the x-axis"
    (0, y)            -> "on the y-axis"
    (x, y) if x > 0 and y > 0 -> "first quadrant"
    (x, y)            -> "somewhere"
  }
```

### Nested constructors

```px
fn summarize(r: Remote<HttpError, List<User>>): String =
  match r {
    Success([])        -> "no users"          -- empty-list pattern
    Success([only])    -> "one user: ${only.name}"
    Success(users)     -> "${Int.toString(List.length(users))} users"
    Failure(NotFound)  -> "not found"          -- match inside the error
    Failure(_)         -> "request failed"
    Loading            -> "loading…"
    NotAsked           -> "idle"
  }
```

## Guards

A guard adds a boolean condition to an arm with `if`:

```px
match n {
  x if x < 0   -> "negative"
  0            -> "zero"
  _            -> "positive"
}
```

A guarded arm doesn't count toward exhaustiveness on its own (the guard might be
false), so you still need a fallback arm — the compiler checks this too.

## Literal & list patterns

```px
match command {
  "quit"  -> ...
  "help"  -> ...
  other   -> "unknown: ${other}"
}

match xs {
  []            -> "empty"
  [x]           -> "one element"
  [x, y]        -> "two"
  [first, ...rest] -> "head ${Int.toString(first)} + ${Int.toString(List.length(rest))} more"
}
```

`[first, ...rest]` binds the head and the remaining list — the standard way to
recurse over a list.

## `if let` shorthand

For the common "do something only in one case" pattern, `if let` avoids a full
`match`:

```px
if let Some(user) = findUser(id) then
  greet(user)
else
  showLogin()
```

## Why this matters

Exhaustive matching is the mechanism behind most of PecanX's correctness claims:

- It's how `Option` removes null errors — you *must* handle `None`.
- It's how `Result` removes unhandled errors — you *must* handle `Err`.
- It's how sum types remove impossible-state bugs — every real state is handled,
  and unreal ones don't typecheck.

## Next

[05 · Errors & validation](05-errors-and-validation.md) — `Result`, `Option`, and
the parsing discipline that ties it together.
