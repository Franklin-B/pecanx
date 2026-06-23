# Language Dictionary

This is the formal vocabulary of PecanX: the reserved words, operators, built-in
types, and standard-library functions that make up the language. It is a quick
reference, not a tutorial — for the why behind each item, follow the cross-links
into the rest of the manual.

The manual chapters: [00-overview](00-overview.md),
[01-getting-started](01-getting-started.md),
[02-syntax-basics](02-syntax-basics.md), [03-types](03-types.md),
[04-pattern-matching](04-pattern-matching.md),
[05-errors-and-validation](05-errors-and-validation.md),
[06-effects-and-architecture](06-effects-and-architecture.md),
[07-full-stack](07-full-stack.md), [08-ffi](08-ffi.md),
[09-stdlib](09-stdlib.md), [10-tutorial-signup](10-tutorial-signup.md).

---

## A. Keywords

Every reserved word in the language, alphabetized, plus the three annotations
that steer compilation placement. Reserved words may not be used as identifiers.

### `alias`

Introduces a transparent type alias — a new name for an existing type, with no
new identity. See [03-types](03-types.md).

```px
type alias UserId = Int
```

### `and`

Short-circuiting boolean conjunction. The right side is only evaluated if the
left side is `true`. See [02-syntax-basics](02-syntax-basics.md).

```px
let ok = isValid and isReady
```

### `as`

Renames an import so its members are qualified under a different module name. See
[02-syntax-basics](02-syntax-basics.md).

```px
import Data.Json as J
```

### `effect`

Opens a do-notation block for sequencing effectful steps; `let!` runs one step
and binds its result. Used in `server fn` bodies and when building a `Cmd`. See
[06-effects-and-architecture](06-effects-and-architecture.md) and
[07-full-stack](07-full-stack.md).

```px
effect {
  let! row = Db.find(users, id)
  Ok(row)
}
```

### `else`

The mandatory false branch of an `if` expression; both branches must share a
type. See [04-pattern-matching](04-pattern-matching.md).

```px
let label = if n > 0 then "positive" else "non-positive"
```

### `exposing`

Lists the names a module makes public (in a header) or pulls into local scope
(in an import). See [02-syntax-basics](02-syntax-basics.md).

```px
module Account.Email exposing (Email, parse)
```

### `extern`

Declares a foreign (JavaScript) function. Allowed only in JS-target modules,
never in the Kernel. See [08-ffi](08-ffi.md).

```px
extern fn now(): Float = js "Date.now()"
```

### `fn`

Defines a function. Public functions annotate their full signature. See
[02-syntax-basics](02-syntax-basics.md).

```px
fn double(n: Int): Int = n * 2
```

### `if`

Begins a conditional expression; pairs with `then` and a mandatory `else`. See
[04-pattern-matching](04-pattern-matching.md).

```px
let sign = if n < 0 then "neg" else "pos"
```

### `import`

Brings another module into scope so its members can be called, optionally
qualified or with `exposing`. See [02-syntax-basics](02-syntax-basics.md).

```px
import String exposing (trim, length)
```

### `let`

Introduces an immutable binding; the last expression in a block is its result.
See [02-syntax-basics](02-syntax-basics.md).

```px
let total = price + tax
```

### `match`

Pattern-matches a value against exhaustive cases, each `Pattern -> expr`. See
[04-pattern-matching](04-pattern-matching.md).

```px
match opt { None -> 0, Some(n) -> n }
```

### `module`

Declares the module a file belongs to; the first line of every source file. See
[02-syntax-basics](02-syntax-basics.md).

```px
module Account.Validation
```

### `not`

Boolean negation. See [02-syntax-basics](02-syntax-basics.md).

```px
let blocked = not allowed
```

### `opaque`

Declares a type whose internal representation is hidden; its constructor is
visible only inside the matching `parse`. See [05-errors-and-validation](05-errors-and-validation.md).

```px
opaque Email
```

### `or`

Short-circuiting boolean disjunction. The right side is only evaluated if the
left side is `false`. See [02-syntax-basics](02-syntax-basics.md).

```px
let lenient = isAdmin or isOwner
```

### `parse`

Defines the only constructor site for an `opaque` type: it validates raw input
and returns a `Result`. See [05-errors-and-validation](05-errors-and-validation.md).

```px
parse email(raw: String): Result<FieldError, Email> =
  if String.contains(raw, "@") then Ok(Email(raw)) else Err(NotAnEmail)
```

### `server`

Marks a function that runs only on the server, with an effectful body and access
to `Db.*`. See [07-full-stack](07-full-stack.md).

```px
server fn loadUser(id: UserId): Result<DbError, User> =
  effect { let! row = Db.find(users, id) ... }
```

### `then`

The true branch separator of an `if` expression. See [04-pattern-matching](04-pattern-matching.md).

```px
let n = if ready then 1 else 0
```

### `type`

Defines a record, sum type, or (with `alias`) a type alias. See [03-types](03-types.md).

```px
type Point = { x: Int, y: Int }
```

### `@kernel`

Annotation forcing a definition into the pure Kernel (Wasm). Applying it to
impure code is a compile error. See [00-overview](00-overview.md).

```px
@kernel
fn score(n: Int): Int = n * n
```

### `@js`

Annotation forcing a definition to compile to the JavaScript target. See
[00-overview](00-overview.md).

```px
@js
fn focusInput(): Unit = unit
```

### `@export`

Annotation exposing a PecanX function to JavaScript under the given name. See
[08-ffi](08-ffi.md).

```px
@export("validateEmail")
fn validateEmail(raw: String): Bool = ...
```

---

## B. Operators

Higher precedence binds tighter. Within a precedence level, associativity decides
grouping. See [02-syntax-basics](02-syntax-basics.md) for usage details.

| Operator | Meaning | Arity | Precedence | Associativity |
|----------|---------|-------|-----------|---------------|
| `.` | Field / member access | Binary | 10 | Left |
| `\` | Lambda introducer (`\x -> e`) | Prefix | 9 | n/a |
| `*` | Multiplication | Binary | 7 | Left |
| `/` | Division | Binary | 7 | Left |
| `%` | Modulo / remainder | Binary | 7 | Left |
| `+` | Addition | Binary | 6 | Left |
| `-` | Subtraction | Binary | 6 | Left |
| `++` | String / list concatenation | Binary | 5 | Right |
| `==` | Equality | Binary | 4 | Non-associative |
| `/=` | Inequality | Binary | 4 | Non-associative |
| `<` | Less than | Binary | 4 | Non-associative |
| `<=` | Less than or equal | Binary | 4 | Non-associative |
| `>` | Greater than | Binary | 4 | Non-associative |
| `>=` | Greater than or equal | Binary | 4 | Non-associative |
| `not` | Boolean negation | Prefix | 4 | n/a |
| `and` | Short-circuiting conjunction | Binary | 3 | Right |
| `or` | Short-circuiting disjunction | Binary | 2 | Right |
| `?` | Early-exit on `Err` / `None` | Postfix | 2 | n/a |
| `|>` | Pipeline (`x |> f` means `f(x)`) | Binary | 1 | Left |
| `->` | Match-arm / lambda arrow | Binary | 0 | Right |

---

## C. Built-in types

The core types every PecanX program can use without importing. See
[03-types](03-types.md).

| Type | One-line meaning |
|------|------------------|
| `Int` | A signed integer number. |
| `Float` | A floating-point number. |
| `Bool` | A truth value, `true` or `false`. |
| `String` | A sequence of Unicode text; interpolate with `"...${s}..."`. |
| `Char` | A single Unicode character. |
| `Unit` | The trivial type with one value, `unit` (signals "no useful result"). |
| `List<a>` | An ordered, immutable collection of `a` values. |
| `Option<a>` | Presence or absence: `None | Some(a)` — how PecanX models a missing value (there is no null). |
| `Result<e, a>` | Success or failure: `Err(e) | Ok(a)` — how PecanX models failure (there are no exceptions). |
| `Dict<k, v>` | An immutable key/value map from `k` to `v`. |
| `(a, b)` | A tuple — a fixed-size grouping of values of possibly different types. |
| `Remote<e, a>` | Async request state: `NotAsked | Loading | Failure(e) | Success(a)`. |
| `Html<msg>` | A pure description of DOM that emits messages of type `msg`. |
| `Cmd<msg>` | A description of an effect whose result becomes a `msg`. |
| `Foreign` | An untrusted value from JS; may only leave via `Decode.run`. |

---

## D. Standard-library index

Every standard-library function named in the language contract, alphabetized,
module-qualified, with exact argument order. See [09-stdlib](09-stdlib.md) for
examples and discussion.

| Symbol | Signature | Summary |
|--------|-----------|---------|
| `Char.isAlpha` | `Char.isAlpha(c: Char): Bool` | True if `c` is an alphabetic character. |
| `Char.isDigit` | `Char.isDigit(c: Char): Bool` | True if `c` is a decimal digit. |
| `Cmd.batch` | `Cmd.batch(cmds: List<Cmd<msg>>): Cmd<msg>` | Combine many commands into one. |
| `Cmd.none` | `Cmd.none: Cmd<msg>` | The command that does nothing. |
| `Console.log` | `Console.log(s: String): Cmd<msg>` | Log a string to the console. |
| `Decode.bool` | `Decode.bool: Decoder<Bool>` | Decoder for a JS boolean. |
| `Decode.html` | `Decode.html: Decoder<Html<msg>>` | Decoder for foreign HTML. |
| `Decode.int` | `Decode.int: Decoder<Int>` | Decoder for a JS integer. |
| `Decode.run` | `Decode.run(decoder: Decoder<a>, value: Foreign): Result<DecodeError, a>` | Run a decoder over a `Foreign` value. |
| `Decode.string` | `Decode.string: Decoder<String>` | Decoder for a JS string. |
| `Dict.empty` | `Dict.empty: Dict<k, v>` | The empty dictionary. |
| `Dict.get` | `Dict.get(k: k, d: Dict<k, v>): Option<v>` | Look up a key, returning `Option`. |
| `Dict.insert` | `Dict.insert(k: k, v: v, d: Dict<k, v>): Dict<k, v>` | Add or replace a key/value pair. |
| `Dict.keys` | `Dict.keys(d: Dict<k, v>): List<k>` | All keys in the dictionary. |
| `Dict.member` | `Dict.member(k: k, d: Dict<k, v>): Bool` | True if the key is present. |
| `Dict.remove` | `Dict.remove(k: k, d: Dict<k, v>): Dict<k, v>` | Remove a key if present. |
| `Dict.toList` | `Dict.toList(d: Dict<k, v>): List<(k, v)>` | All entries as a list of tuples. |
| `Dict.values` | `Dict.values(d: Dict<k, v>): List<v>` | All values in the dictionary. |
| `Float.abs` | `Float.abs(x: Float): Float` | Absolute value. |
| `Float.ceil` | `Float.ceil(x: Float): Float` | Round up to a whole number. |
| `Float.floor` | `Float.floor(x: Float): Float` | Round down to a whole number. |
| `Float.parse` | `Float.parse(s: String): Option<Float>` | Parse a float, `None` on failure. |
| `Float.round` | `Float.round(x: Float): Float` | Round to the nearest whole number. |
| `Float.sqrt` | `Float.sqrt(x: Float): Float` | Square root. |
| `Float.toString` | `Float.toString(x: Float): String` | Render a float as text. |
| `Http.get` | `Http.get(url: String, toMsg: \Result<HttpError, a> -> msg): Cmd<msg>` | Issue a GET request. |
| `Http.post` | `Http.post(url: String, body: Body, toMsg: \Result<HttpError, a> -> msg): Cmd<msg>` | Issue a POST request. |
| `Int.abs` | `Int.abs(n: Int): Int` | Absolute value. |
| `Int.clamp` | `Int.clamp(lo: Int, hi: Int, n: Int): Int` | Constrain `n` to `[lo, hi]`. |
| `Int.max` | `Int.max(a: Int, b: Int): Int` | The larger of two integers. |
| `Int.min` | `Int.min(a: Int, b: Int): Int` | The smaller of two integers. |
| `Int.parse` | `Int.parse(s: String): Option<Int>` | Parse an integer, `None` on failure. |
| `Int.toFloat` | `Int.toFloat(n: Int): Float` | Widen an integer to a float. |
| `Int.toString` | `Int.toString(n: Int): String` | Render an integer as text. |
| `Json.decode` | `Json.decode(decoder: Decoder<a>, v: Json): Result<DecodeError, a>` | Decode a JSON value. |
| `Json.encode` | `Json.encode(v: a): Json` | Encode a value to JSON. |
| `Json.field` | `Json.field(name: String, v: Json): Option<Json>` | Extract a named field. |
| `Json.parse` | `Json.parse(s: String): Result<JsonError, Json>` | Parse a JSON string. |
| `List.all` | `List.all(pred: \a -> Bool, list: List<a>): Bool` | True if every element satisfies `pred`. |
| `List.any` | `List.any(pred: \a -> Bool, list: List<a>): Bool` | True if any element satisfies `pred`. |
| `List.append` | `List.append(a: List<a>, b: List<a>): List<a>` | Concatenate two lists. |
| `List.filter` | `List.filter(pred: \a -> Bool, list: List<a>): List<a>` | Keep elements satisfying `pred`. |
| `List.find` | `List.find(pred: \a -> Bool, list: List<a>): Option<a>` | First element satisfying `pred`. |
| `List.foldl` | `List.foldl(fn: \a, b -> b, init: b, list: List<a>): b` | Left fold over a list. |
| `List.head` | `List.head(list: List<a>): Option<a>` | First element, if any. |
| `List.isEmpty` | `List.isEmpty(list: List<a>): Bool` | True if the list has no elements. |
| `List.last` | `List.last(list: List<a>): Option<a>` | Last element, if any. |
| `List.length` | `List.length(list: List<a>): Int` | Number of elements. |
| `List.map` | `List.map(fn: \a -> b, list: List<a>): List<b>` | Transform every element. |
| `List.range` | `List.range(lo: Int, hi: Int): List<Int>` | Integers from `lo` to `hi`. |
| `List.reverse` | `List.reverse(list: List<a>): List<a>` | Reverse the list. |
| `List.sortBy` | `List.sortBy(fn: \a -> b, list: List<a>): List<a>` | Sort by a derived key. |
| `Nav.push` | `Nav.push(url: String): Cmd<msg>` | Navigate to a new URL. |
| `Option.andThen` | `Option.andThen(fn: \a -> Option<b>, opt: Option<a>): Option<b>` | Chain an `Option`-returning step. |
| `Option.isNone` | `Option.isNone(opt: Option<a>): Bool` | True if the option is `None`. |
| `Option.isSome` | `Option.isSome(opt: Option<a>): Bool` | True if the option is `Some`. |
| `Option.map` | `Option.map(fn: \a -> b, opt: Option<a>): Option<b>` | Transform the contained value. |
| `Option.toResult` | `Option.toResult(err: e, opt: Option<a>): Result<e, a>` | Convert to `Result`, using `err` for `None`. |
| `Option.withDefault` | `Option.withDefault(default: a, opt: Option<a>): a` | Unwrap, or use `default`. |
| `Random.int` | `Random.int(lo: Int, hi: Int, toMsg: \Int -> msg): Cmd<msg>` | Generate a random integer in range. |
| `Result.all` | `Result.all(list: List<Result<e, a>>): Result<e, List<a>>` | Collect oks, or first error. |
| `Result.andThen` | `Result.andThen(fn: \a -> Result<e, b>, res: Result<e, a>): Result<e, b>` | Chain a `Result`-returning step. |
| `Result.map` | `Result.map(fn: \a -> b, res: Result<e, a>): Result<e, b>` | Transform the ok value. |
| `Result.map2` | `Result.map2(fn: \a, b -> c, r1: Result<e, a>, r2: Result<e, b>): Result<e, c>` | Combine two oks. |
| `Result.map3` | `Result.map3(fn: \a, b, c -> d, r1: Result<e, a>, r2: Result<e, b>, r3: Result<e, c>): Result<e, d>` | Combine three oks. |
| `Result.map4` | `Result.map4(fn: \a, b, c, d -> r, r1: Result<e, a>, r2: Result<e, b>, r3: Result<e, c>, r4: Result<e, d>): Result<e, r>` | Combine four oks. |
| `Result.map5` | `Result.map5(fn: \a, b, c, d, e2 -> r, r1: Result<e, a>, r2: Result<e, b>, r3: Result<e, c>, r4: Result<e, d>, r5: Result<e, e2>): Result<e, r>` | Combine five oks. |
| `Result.mapErr` | `Result.mapErr(fn: \e -> f, res: Result<e, a>): Result<f, a>` | Transform the error value. |
| `Result.toOption` | `Result.toOption(res: Result<e, a>): Option<a>` | Drop the error, keeping `Some` on ok. |
| `Result.withDefault` | `Result.withDefault(default: a, res: Result<e, a>): a` | Unwrap, or use `default`. |
| `String.contains` | `String.contains(hay: String, needle: String): Bool` | True if `hay` contains `needle`. |
| `String.endsWith` | `String.endsWith(suffix: String, s: String): Bool` | True if `s` ends with `suffix`. |
| `String.isEmpty` | `String.isEmpty(s: String): Bool` | True if the string has no characters. |
| `String.join` | `String.join(sep: String, list: List<String>): String` | Join strings with a separator. |
| `String.length` | `String.length(s: String): Int` | Number of characters. |
| `String.slice` | `String.slice(start: Int, end: Int, s: String): String` | Substring from `start` to `end`. |
| `String.split` | `String.split(sep: String, s: String): List<String>` | Split on a separator. |
| `String.startsWith` | `String.startsWith(prefix: String, s: String): Bool` | True if `s` starts with `prefix`. |
| `String.toList` | `String.toList(s: String): List<Char>` | Characters as a list. |
| `String.toLower` | `String.toLower(s: String): String` | Lowercase the string. |
| `String.toUpper` | `String.toUpper(s: String): String` | Uppercase the string. |
| `String.trim` | `String.trim(s: String): String` | Remove leading and trailing whitespace. |
| `Time.every` | `Time.every(ms: Float, toMsg: \Float -> msg): Cmd<msg>` | Emit a message every `ms` milliseconds. |
| `Time.now` | `Time.now(toMsg: \Float -> msg): Cmd<msg>` | Get the current time. |
