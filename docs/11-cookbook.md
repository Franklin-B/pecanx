# 11 · Cookbook & Snippet Catalog

A categorized catalog of copy-pasteable PecanX snippets you can drop into your own modules, share with teammates, or paste into an issue when asking for help. Each entry has a short description, a `px` code block, and sometimes a note. Everything here is idiomatic and conforms to the language contract — but it assumes the surrounding `module`/`import` scaffolding you already know from [01-getting-started.md](01-getting-started.md) and [02-syntax-basics.md](02-syntax-basics.md). For the full story behind any recipe, follow the cross-links into the relevant chapter.

These snippets are deliberately small. Lift one out, rename the types to suit your domain, and let the compiler tell you what you missed.

---

## Types

The building blocks. See [03-types.md](03-types.md) for the complete treatment.

**Record type and construction**
A record groups named fields. Construct with `=`, read with `.`.

```px
type User = { name: String, age: Int, active: Bool }

fn alice(): User =
  { name = "Alice", age = 30, active = true }

fn greeting(u: User): String =
  "Hi, ${u.name}!"
```

> Note: record fields use `=`, never `:`. A `:` is only for type annotations.

**Record update (non-destructive)**
`{ ...r, field = new }` produces a new record sharing the untouched fields. The original is never mutated.

```px
fn deactivate(u: User): User =
  { ...u, active = false }
```

**Field punning**
When a local name matches a field name, `{ name }` is shorthand for `{ name = name }`.

```px
fn makeUser(name: String, age: Int): User =
  { name, age, active = true }
```

**Sum type with payloads**
A sum type enumerates alternatives. Constructors that carry data use parentheses.

```px
type Shape =
  | Circle(radius: Float)
  | Rect(width: Float, height: Float)
  | Point

fn area(s: Shape): Float =
  match s {
    Circle(r) -> 3.14159 * r * r
    Rect(w, h) -> w * h
    Point -> 0.0
  }
```

**Generic container type**
Type parameters are lowercase and live in `<...>`. Here `a` ranges over any element type.

```px
type Tree<a> =
  | Leaf
  | Node(left: Tree<a>, value: a, right: Tree<a>)

fn singleton(x: a): Tree<a> =
  Node(Leaf, x, Leaf)
```

**Type alias**
A transparent name for an existing type. Aliases do not create a new type — they document intent.

```px
type alias UserId = Int
type alias Headers = Dict<String, String>

fn fetchUrl(id: UserId): String =
  "/users/${Int.toString(id)}"
```

**Opaque type with a parser**
`opaque` hides the representation. The constructor is only in scope inside its `parse` block, so the only way to build a value is to validate it. See [05-errors-and-validation.md](05-errors-and-validation.md).

```px
opaque Email

parse email(raw: String): Result<FieldError, Email> =
  let s = String.trim(raw)
  if String.contains(s, "@") then Ok(Email(s))
  else Err(FieldError("email", "must contain @"))

fn emailToString(e: Email): String =
  Email.unwrap(e)
```

> Note: outside the parser you can only read an `Email` back through an accessor like `Email.unwrap`. You can never forge one — that is the whole point.

---

## Validation

Parse, don't validate. Push every check to the edge and carry proof in the type. See [05-errors-and-validation.md](05-errors-and-validation.md).

**Parse-don't-validate at the boundary**
Convert untrusted input into a domain type once; downstream code receives a value that is already known-good.

```px
opaque Age

parse age(raw: String): Result<FieldError, Age> =
  match Int.parse(raw) {
    None -> Err(FieldError("age", "must be a number"))
    Some(n) if n < 0 -> Err(FieldError("age", "must be non-negative"))
    Some(n) if n > 150 -> Err(FieldError("age", "out of range"))
    Some(n) -> Ok(Age(n))
  }
```

**Smart constructor: NonEmpty**
A string proven to contain at least one non-whitespace character.

```px
opaque NonEmpty

parse nonEmpty(raw: String): Result<FieldError, NonEmpty> =
  let s = String.trim(raw)
  if String.isEmpty(s) then Err(FieldError("value", "must not be empty"))
  else Ok(NonEmpty(s))
```

**Smart constructor: PositiveInt**
An integer guaranteed greater than zero.

```px
opaque PositiveInt

parse positiveInt(raw: String): Result<FieldError, PositiveInt> =
  match Int.parse(raw) {
    None -> Err(FieldError("n", "must be an integer"))
    Some(n) if n <= 0 -> Err(FieldError("n", "must be positive"))
    Some(n) -> Ok(PositiveInt(n))
  }
```

**Smart constructor: Slug**
A lowercase, hyphenated identifier built from a raw title.

```px
opaque Slug

parse slug(raw: String): Result<FieldError, Slug> =
  let s = raw |> String.trim |> String.toLower
  let dashed = String.join("-", String.split(" ", s))
  if String.isEmpty(dashed) then Err(FieldError("slug", "empty after normalizing"))
  else Ok(Slug(dashed))
```

> Note: `String.split` takes the separator first, then the string. Same first-argument-is-the-data rule as the rest of the stdlib — see [09-stdlib.md](09-stdlib.md).

**Combine two validations (stop at first error)**
`Result.map2` runs the combining function only if both parts are `Ok`; otherwise it short-circuits to the first `Err`.

```px
type Credentials = { email: Email, age: Age }

fn parseCredentials(rawEmail: String, rawAge: String): Result<FieldError, Credentials> =
  Result.map2(
    \(e, a) -> { email = e, age = a },
    email(rawEmail),
    age(rawAge)
  )
```

**Combine three validations**
`Result.map3` extends the same pattern. There are `map2` through `map5`.

```px
type Profile = { name: NonEmpty, email: Email, age: Age }

fn parseProfile(rawName: String, rawEmail: String, rawAge: String): Result<FieldError, Profile> =
  Result.map3(
    \(n, e, a) -> { name = n, email = e, age = a },
    nonEmpty(rawName),
    email(rawEmail),
    age(rawAge)
  )
```

**Accumulate every error with Result.all**
`map*` stops at the first failure. When you want *all* errors at once for a homogeneous list, collect them and report the failures.

```px
fn parseAllAges(raws: List<String>): Result<List<FieldError>, List<Age>> =
  let results = List.map(age, raws)
  let errs = List.foldl(
    \(acc, r) -> match r { Err(e) -> List.append(acc, [e]) Ok(_) -> acc },
    [],
    results
  )
  if List.isEmpty(errs) then Result.all(results) |> Result.mapErr(\e -> [e])
  else Err(errs)
```

> Note: use the short-circuit `map*` family when one error is enough; collect into a `List<FieldError>` when a form needs to highlight every bad field at once.

---

## Pattern Matching

Exhaustive, total, and the compiler keeps you honest. See [04-pattern-matching.md](04-pattern-matching.md).

**Exhaustive match over a sum type**
Every constructor must be handled. Add a case to the type and the compiler flags every match that forgot it.

```px
type Status = | Draft | Published | Archived

fn label(s: Status): String =
  match s {
    Draft -> "draft"
    Published -> "live"
    Archived -> "archived"
  }
```

**Guards on a match arm**
A guard adds a boolean condition. Arms are tried top to bottom.

```px
fn classify(n: Int): String =
  match n {
    0 -> "zero"
    x if x < 0 -> "negative"
    x if x % 2 == 0 -> "positive even"
    _ -> "positive odd"
  }
```

**List patterns**
Destructure by shape: empty, single element, or head-and-rest.

```px
fn describe(xs: List<Int>): String =
  match xs {
    [] -> "empty"
    [x] -> "one element: ${Int.toString(x)}"
    [first, ...rest] -> "starts with ${Int.toString(first)}, ${Int.toString(List.length(rest))} more"
  }
```

**Recursion over a list pattern**
The `[first, ...rest]` pattern is the idiomatic way to walk a list by hand.

```px
fn sum(xs: List<Int>): Int =
  match xs {
    [] -> 0
    [first, ...rest] -> first + sum(rest)
  }
```

**Nested constructor patterns**
Match into wrapped values in one step instead of nesting `match` expressions.

```px
fn firstName(u: Option<User>): String =
  match u {
    Some({ name, ... }) -> name
    None -> "anonymous"
  }
```

**Record destructuring in a binding**
Pull fields out positionally by name.

```px
fn fullLine(u: User): String =
  let { name, age } = u
  "${name} (${Int.toString(age)})"
```

**if let for a single case**
When you only care about one constructor, `if let` is lighter than a full `match`.

```px
fn portOrDefault(parsed: Option<Int>): Int =
  if let Some(p) = parsed then p else 8080
```

---

## Errors

No exceptions, no `null`. Failure is a `Result`, absence is an `Option`. See [05-errors-and-validation.md](05-errors-and-validation.md).

**Returning a Result**
Model the success and failure types explicitly. `Result<e, a>` is `Err(e)` or `Ok(a)`.

```px
fn divide(a: Int, b: Int): Result<String, Int> =
  if b == 0 then Err("division by zero")
  else Ok(a / b)
```

**The ? early-exit operator**
Inside a `Result`-returning function, `?` unwraps an `Ok` or returns the `Err` immediately.

```px
fn parseSum(rawA: String, rawB: String): Result<FieldError, Int> =
  let a = age(rawA)?
  let b = age(rawB)?
  Ok(Age.unwrap(a) + Age.unwrap(b))
```

> Note: `?` works the same way inside an `Option`-returning function, short-circuiting on `None`.

**Option to Result**
Attach an error to an absence with `Option.toResult`.

```px
fn lookupPort(d: Dict<String, Int>): Result<String, Int> =
  Dict.get("port", d) |> Option.toResult("port not configured")
```

**Result to Option**
Discard the error detail when you only care whether it worked.

```px
fn maybePort(raw: String): Option<Int> =
  Int.parse(raw) |> Option.toResult("bad")
    |> Result.andThen(\n -> if n > 0 then Ok(n) else Err("non-positive"))
    |> Result.toOption
```

**withDefault for a fallback**
Collapse a `Result` or `Option` to a plain value.

```px
fn portOr8080(raw: String): Int =
  Int.parse(raw) |> Option.withDefault(8080)
```

**Chaining with Result.andThen**
`andThen` sequences steps where each can fail, threading the success forward.

```px
fn parsePositive(raw: String): Result<String, Int> =
  Int.parse(raw)
    |> Option.toResult("not a number")
    |> Result.andThen(\n -> if n > 0 then Ok(n) else Err("must be positive"))
```

**Mapping the error channel**
`Result.mapErr` rewrites the failure without touching success.

```px
fn parsePort(raw: String): Result<FieldError, Int> =
  parsePositive(raw) |> Result.mapErr(\msg -> FieldError("port", msg))
```

**Combining results with map2..map5**
`map2` through `map5` lift an N-ary function over that many results, short-circuiting on the first `Err`.

```px
type Point3 = { x: Int, y: Int, z: Int }

fn parsePoint(rx: String, ry: String, rz: String): Result<String, Point3> =
  Result.map3(
    \(x, y, z) -> { x = x, y = y, z = z },
    Int.parse(rx) |> Option.toResult("bad x"),
    Int.parse(ry) |> Option.toResult("bad y"),
    Int.parse(rz) |> Option.toResult("bad z")
  )
```

---

## Effects & Architecture

The Model / Msg / update / view loop. `view` is pure; effects are values of type `Cmd<Msg>`. See [06-effects-and-architecture.md](06-effects-and-architecture.md).

**Minimal Model / Msg / update / view skeleton**
The four pieces every client app needs. `update` returns the next model and a command.

```px
type Model = { count: Int }

type Msg = | Increment | Decrement

fn init(): (Model, Cmd<Msg>) =
  ({ count = 0 }, Cmd.none)

fn update(msg: Msg, model: Model): (Model, Cmd<Msg>) =
  match msg {
    Increment -> ({ ...model, count = model.count + 1 }, Cmd.none)
    Decrement -> ({ ...model, count = model.count - 1 }, Cmd.none)
  }

fn view(model: Model): Html<Msg> =
  Html.div([Attr.class("counter")], [
    Html.button([Event.onClick(Decrement)], [Html.text("-")]),
    Html.text(Int.toString(model.count)),
    Html.button([Event.onClick(Increment)], [Html.text("+")])
  ])
```

**Cmd.none and Cmd.batch**
Return `Cmd.none` for a pure state change; `Cmd.batch` to fire several effects at once.

```px
fn update(msg: Msg, model: Model): (Model, Cmd<Msg>) =
  match msg {
    Reset -> (
      { ...model, count = 0 },
      Cmd.batch([
        Console.log("reset pressed"),
        Nav.push("/home")
      ])
    )
  }
```

**HTTP GET tagged with a Msg**
`Http.get` describes a request; its result arrives later as the `Msg` you name.

```px
type Msg =
  | Load
  | Loaded(result: Result<HttpError, String>)

fn update(msg: Msg, model: Model): (Model, Cmd<Msg>) =
  match msg {
    Load -> (model, Http.get("/api/quote", Loaded))
    Loaded(Ok(body)) -> ({ ...model, quote = body }, Cmd.none)
    Loaded(Err(_)) -> ({ ...model, quote = "failed to load" }, Cmd.none)
  }
```

> Note: the effect carries no result by itself — it is tagged with the constructor (`Loaded`) the runtime will wrap the outcome in.

**Remote data in the Model**
`Remote<e, a>` models the full lifecycle: not asked, loading, failure, success.

```px
type Model = { quote: Remote<HttpError, String> }

fn view(model: Model): Html<Msg> =
  match model.quote {
    NotAsked -> Html.button([Event.onClick(Load)], [Html.text("Load")])
    Loading -> Html.text("loading...")
    Failure(_) -> Html.text("error")
    Success(q) -> Html.text(q)
  }
```

**Time.every for a recurring tick**
Subscribe to a clock that emits a `Msg` every N milliseconds.

```px
type Msg = | Tick(now: Float)

fn update(msg: Msg, model: Model): (Model, Cmd<Msg>) =
  match msg {
    Tick(t) -> ({ ...model, lastTick = t }, Cmd.none)
  }

fn pollClock(): Cmd<Msg> =
  Time.every(1000.0, Tick)
```

**Random within a range**
`Random.int` produces a command whose result is delivered as a `Msg`.

```px
type Msg = | Roll | Rolled(value: Int)

fn update(msg: Msg, model: Model): (Model, Cmd<Msg>) =
  match msg {
    Roll -> (model, Random.int(1, 6, Rolled))
    Rolled(n) -> ({ ...model, die = n }, Cmd.none)
  }
```

**Text input wired to a Msg**
`Event.onInput` passes the current field value to a lambda that builds the message.

```px
type Msg = | NameChanged(value: String)

fn view(model: Model): Html<Msg> =
  Html.input([
    Attr.value(model.name),
    Attr.placeholder("your name"),
    Event.onInput(\s -> NameChanged(s))
  ])
```

---

## Full-Stack

One Kernel, shared across the wire. Server functions run only on the server; the validation in between runs on both. See [07-full-stack.md](07-full-stack.md).

**A server function**
`server fn` bodies use `effect { }` do-notation and the `Db.*` API. They never reach the client.

```px
server fn saveUser(profile: Profile): Result<DbError, UserId> =
  effect {
    let! id = Db.insert("users", profile)
    Ok(id)
  }
```

**Calling a server function from update**
`Server.call` turns a server endpoint into a `Cmd<Msg>`, tagging the response.

```px
type Msg =
  | Submit
  | Saved(result: Result<DbError, UserId>)

fn update(msg: Msg, model: Model): (Model, Cmd<Msg>) =
  match msg {
    Submit -> (model, Server.call(saveUser(model.profile), Saved))
    Saved(Ok(id)) -> ({ ...model, savedId = Some(id) }, Cmd.none)
    Saved(Err(_)) -> ({ ...model, error = Some("save failed") }, Cmd.none)
  }
```

**Isomorphic validation**
The same parser is the trust boundary on the client (fast feedback) and on the server (authority). Because it lives in the Kernel, it compiles once and runs in both places.

```px
@kernel
parse signupForm(rawEmail: String, rawAge: String): Result<FieldError, Credentials> =
  Result.map2(
    \(e, a) -> { email = e, age = a },
    email(rawEmail),
    age(rawAge)
  )

server fn signup(rawEmail: String, rawAge: String): Result<FieldError, UserId> =
  effect {
    let creds = signupForm(rawEmail, rawAge)?
    let! id = Db.insert("users", creds)
    Ok(id)
  }
```

> Note: the client may call `signupForm` for instant feedback, but the server re-runs it before touching the database. Identical code, single source of truth — see [07-full-stack.md](07-full-stack.md).

**Shared types across the wire**
A type defined in a pure Kernel module is the contract for both ends — no hand-written DTOs to keep in sync.

```px
module App.Shared exposing (Credentials, FieldError)

type alias FieldName = String

type FieldError = | FieldError(field: FieldName, message: String)

type Credentials = { email: Email, age: Age }
```

---

## FFI

The quarantined edge. `extern` is only allowed in JS-target modules — never the Kernel. Untrusted values are `Foreign` and may only leave through a decoder. See [08-ffi.md](08-ffi.md).

**Typed wrapper around an npm lib**
Bind a JS expression to a typed PecanX signature with `extern fn ... = js "..."`.

```px
@js
extern fn nowMs(): Float = js "Date.now()"

fn timestamp(): String =
  Float.toString(nowMs())
```

**Foreign plus Decode at the boundary**
A `Foreign` value (anything coming from JS) can only become a typed value through `Decode.run`, which yields a `Result`.

```px
@js
extern fn readConfig(): Foreign = js "window.__CONFIG__"

fn loadPort(): Result<DecodeError, Int> =
  Decode.run(Decode.int, readConfig())
```

> Note: `Decode.run` returns `Result<DecodeError, a>`, so a malformed value becomes a handled `Err` instead of a runtime explosion.

**Decoding a string field**
Compose decoders to pull a typed field out of a foreign object.

```px
@js
extern fn rawUser(): Foreign = js "window.currentUser"

fn userName(): Result<DecodeError, String> =
  Decode.run(Decode.field("name", Decode.string), rawUser())
```

**Throwing import**
A JS call that can throw is declared with `js throws`. The `throws` marker forces the result into a `Result`: a thrown exception becomes `Err(JsException)`, success is `Ok(Foreign)`. Map the exception into your own error type, then decode the `Foreign`.

```px
@js
extern fn parseJson(s: String): Foreign = js throws "JSON.parse(s)"

fn decodeFlag(s: String): Result<DecodeError, Bool> =
  parseJson(s)
    |> Result.mapErr(\_ -> DecodeError.NotJson)
    |> Result.andThen(Decode.run(Decode.bool))
```

> Note: the two failure modes are distinct — `JsException` from a thrown call versus `DecodeError` from a wrong shape. Here both are folded into `DecodeError`; see [08-ffi.md](08-ffi.md) for the full quarantine pattern.

**Exposing PecanX to JS**
`@export` makes a PecanX function callable from JavaScript under a chosen name.

```px
@export("validateAge")
fn validateAge(raw: String): Bool =
  match age(raw) {
    Ok(_) -> true
    Err(_) -> false
  }
```

> Note: `extern` and `@export` belong to JS-target modules. Put them in a thin shell around your Kernel — the Kernel itself stays pure.

---

## Stdlib Recipes

Module-qualified, first-argument-is-the-data. Full reference in [09-stdlib.md](09-stdlib.md).

**List.map / filter / foldl**
The three workhorses: transform, keep, reduce.

```px
fn evenDoubles(xs: List<Int>): Int =
  xs
    |> List.filter(\n -> n % 2 == 0)
    |> List.map(\n -> n * 2)
    |> List.foldl(\(acc, n) -> acc + n, 0)
```

**List.find and List.any**
`find` returns the first match as an `Option`; `any` returns a `Bool`.

```px
fn firstAdult(ages: List<Int>): Option<Int> =
  List.find(\a -> a >= 18, ages)

fn hasMinor(ages: List<Int>): Bool =
  List.any(\a -> a < 18, ages)
```

**List.range and List.sortBy**
Build a sequence and sort it by a derived key.

```px
fn descending(): List<Int> =
  List.range(1, 5) |> List.sortBy(\n -> 0 - n)
```

**Dict usage**
`Dict.get` returns an `Option`; `insert` and `remove` return new dicts.

```px
fn counts(): Dict<String, Int> =
  Dict.empty
    |> Dict.insert("apples", 3)
    |> Dict.insert("pears", 7)

fn applesOr0(d: Dict<String, Int>): Int =
  Dict.get("apples", d) |> Option.withDefault(0)
```

**Dict membership and keys**
Check presence with `member`; list keys with `keys`.

```px
fn hasPears(d: Dict<String, Int>): Bool =
  Dict.member("pears", d)

fn fruitNames(d: Dict<String, Int>): List<String> =
  Dict.keys(d)
```

**String split / join**
Split on a separator, transform the pieces, join them back.

```px
fn titleCaseWords(s: String): String =
  String.split(" ", s)
    |> List.map(String.toUpper)
    |> String.join(" ")
```

**String interpolation (no implicit stringify)**
Interpolation only accepts `String`. Convert numbers explicitly first.

```px
fn summary(name: String, count: Int): String =
  "${name} has ${Int.toString(count)} items"
```

> Note: there is no implicit stringification — `Int.toString` / `Float.toString` are required. Use `++` for plain concatenation.

**Pipeline composition**
`x |> f` is `f(x)`. Chains read top-to-bottom in data-flow order.

```px
fn normalize(raw: String): String =
  raw
    |> String.trim
    |> String.toLower
    |> \s -> String.split(" ", s)
    |> String.join("-")
```

**Option.map and Option.andThen**
`map` transforms a present value; `andThen` chains another `Option`-returning step.

```px
fn doublePort(d: Dict<String, String>): Option<Int> =
  Dict.get("port", d)
    |> Option.andThen(Int.parse)
    |> Option.map(\n -> n * 2)
```

---

See also: [00-overview.md](00-overview.md) for the big picture, and [10-tutorial-signup.md](10-tutorial-signup.md) for a worked end-to-end example that uses many of these snippets together.
