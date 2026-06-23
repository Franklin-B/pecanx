# 02 · Syntax basics

PecanX syntax is small and expression-oriented: almost everything is an expression
that produces a value, and there are no statements that mutate in place.

## Comments

```px
-- line comment

{- block comment,
   which can span lines -}
```

## Modules & imports

Every file begins with a `module` declaration. The module path mirrors the file
path (`kernel/Signup/Domain.px` → `module Signup.Domain`).

```px
module Signup.Domain

import Http                              -- qualified: Http.get(...)
import String                           -- qualified: String.trim(...)
import Signup.Types exposing (Email)    -- bring `Email` into scope unqualified
import Json as J                        -- alias: J.decode(...)
```

Anything declared at the top level is private to its module unless it appears in an
`exposing` list on the module header:

```px
module Signup.Domain exposing (validate, Email, FieldError)
```

## Values & bindings

Top-level and local bindings use `let`. Bindings are **immutable** — there is no
reassignment.

```px
let pi = 3.14159              -- type inferred as Float
let name: String = "Ada"      -- optional explicit annotation

fn area(r: Float): Float =
  let r2 = r * r              -- local binding
  pi * r2                     -- the last expression is the result
```

There is no `return`. A function body *is* an expression; its value is the result.

## Functions

```px
fn add(a: Int, b: Int): Int =
  a + b

-- calling
let five = add(2, 3)
```

Anonymous functions (lambdas) use `\args -> body`:

```px
let inc = \x -> x + 1
let pair = \(a: Int, b: Int) -> a * b
List.map(\n -> n * 2, [1, 2, 3])        -- => [2, 4, 6]
```

Functions are first-class values and can be passed, returned, and stored.

## Primitive types & literals

| Type | Literals |
|---|---|
| `Int` | `0`, `42`, `-7`, `1_000_000` |
| `Float` | `3.14`, `-0.5`, `6.0e23` |
| `Bool` | `true`, `false` |
| `String` | `"hello"`, `"line\nbreak"` |
| `Char` | `'a'`, `'\n'` |
| `Unit` | `unit` (the single value of type `Unit`) |

## Strings

Strings support interpolation with `${ ... }`:

```px
let who = "world"
let greeting = "Hello, ${who}! 1 + 1 = ${Int.toString(1 + 1)}"
```

Interpolation only accepts `String` expressions — there is no implicit
stringification of other types (you call `Int.toString`, `Float.toString`, etc.).
This keeps `"" + 1`-style surprises out of the language.

## Operators

```px
-- arithmetic (Int and Float do not mix implicitly)
1 + 2     3 - 1     4 * 5     10 / 3     10 % 3

-- comparison (work on any comparable type)
a == b    a /= b    a < b    a <= b    a > b    a >= b

-- boolean
not flag        a and b        a or b      -- `and`/`or` short-circuit

-- string / list
"foo" ++ "bar"          -- concatenation
[1, 2] ++ [3, 4]        -- => [1, 2, 3, 4]

-- pipeline: `x |> f` means `f(x)`; reads left-to-right
raw
  |> String.trim
  |> String.toLower
```

`/=` is "not equal." Equality `==` is structural (deep) and only compiles for types
that support it — you can't accidentally compare two functions.

## Conditionals

`if` is an expression and **must** have an `else` (both branches produce a value of
the same type):

```px
fn sign(n: Int): String =
  if n > 0 then "positive"
  else if n < 0 then "negative"
  else "zero"
```

For anything with more than two or three cases, prefer
[`match`](04-pattern-matching.md) over chained `if`.

## Collections

```px
let nums: List<Int> = [1, 2, 3]
let pair: (Int, String) = (1, "one")       -- tuple
let user = { id = 1, name = "Ada" }         -- record (see 03-types)
```

## Blocks & scope

A sequence of `let` bindings followed by a final expression forms a block. Bindings
are visible to everything after them in the same block:

```px
fn discounted(price: Float, pct: Float): Float =
  let rate = pct / 100.0
  let off = price * rate
  price - off
```

Indentation is for humans; blocks are delimited by the binding/expression structure,
not by significant whitespace rules you have to memorize. `pcx fmt` enforces a
canonical layout.

## Next

[03 · Types](03-types.md) — the heart of how PecanX prevents bugs.
