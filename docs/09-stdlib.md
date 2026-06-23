# 09 · Standard library reference

A reference for the core modules. Signatures use PecanX syntax; `a`, `b`, `e`, `k`,
`v` are type variables. Pure modules live in the **Kernel** (run on client and
server); effectful modules (`Http`, `Time`, `Random`, `Nav`, `Console`) produce
`Cmd`s and are client/server runtime modules.

## Prelude (always in scope)

These types and constructors need no import:

```px
Option<a>   = None | Some(a)
Result<e,a> = Err(e) | Ok(a)
Bool        = false | true
Unit        -- the value `unit`
```

Plus `identity`, `always`, `(|>)`, and the comparison/boolean operators.

## `Int`

| Function | Type |
|---|---|
| `Int.parse` | `String -> Option<Int>` |
| `Int.toString` | `Int -> String` |
| `Int.toFloat` | `Int -> Float` |
| `Int.abs` | `Int -> Int` |
| `Int.min` / `Int.max` | `(Int, Int) -> Int` |
| `Int.clamp` | `(Int, Int, Int) -> Int` (lo, hi, x) |

## `Float`

| Function | Type |
|---|---|
| `Float.parse` | `String -> Option<Float>` |
| `Float.toString` | `Float -> String` |
| `Float.round` / `floor` / `ceil` | `Float -> Int` |
| `Float.sqrt` / `abs` | `Float -> Float` |

## `String`

| Function | Type |
|---|---|
| `String.length` | `String -> Int` |
| `String.isEmpty` | `String -> Bool` |
| `String.trim` | `String -> String` |
| `String.toLower` / `toUpper` | `String -> String` |
| `String.contains` | `(String, String) -> Bool` (haystack, needle) |
| `String.startsWith` / `endsWith` | `(String, String) -> Bool` |
| `String.split` | `(String, String) -> List<String>` |
| `String.join` | `(String, List<String>) -> String` |
| `String.replace` | `(String, String, String) -> String` |
| `String.slice` | `(Int, Int, String) -> String` |
| `String.toList` | `String -> List<Char>` |

## `List`

| Function | Type |
|---|---|
| `List.length` | `List<a> -> Int` |
| `List.isEmpty` | `List<a> -> Bool` |
| `List.map` | `((a -> b), List<a>) -> List<b>` |
| `List.filter` | `((a -> Bool), List<a>) -> List<a>` |
| `List.foldl` | `(((a, b) -> b), b, List<a>) -> b` |
| `List.find` | `((a -> Bool), List<a>) -> Option<a>` |
| `List.any` / `List.all` | `((a -> Bool), List<a>) -> Bool` |
| `List.head` / `List.last` | `List<a> -> Option<a>` |
| `List.reverse` | `List<a> -> List<a>` |
| `List.append` | `(List<a>, List<a>) -> List<a>` (or `++`) |
| `List.sortBy` | `((a -> comparable), List<a>) -> List<a>` |
| `List.range` | `(Int, Int) -> List<Int>` |

## `Dict`

| Function | Type |
|---|---|
| `Dict.empty` | `Dict<k, v>` |
| `Dict.get` | `(k, Dict<k, v>) -> Option<v>` |
| `Dict.insert` | `(k, v, Dict<k, v>) -> Dict<k, v>` |
| `Dict.remove` | `(k, Dict<k, v>) -> Dict<k, v>` |
| `Dict.member` | `(k, Dict<k, v>) -> Bool` |
| `Dict.keys` / `Dict.values` | `Dict<k, v> -> List<k>` / `List<v>` |
| `Dict.toList` | `Dict<k, v> -> List<(k, v)>` |

All operations return new dictionaries; nothing mutates.

## `Option`

| Function | Type |
|---|---|
| `Option.map` | `((a -> b), Option<a>) -> Option<b>` |
| `Option.andThen` | `((a -> Option<b>), Option<a>) -> Option<b>` |
| `Option.withDefault` | `(a, Option<a>) -> a` |
| `Option.toResult` | `(e, Option<a>) -> Result<e, a>` |
| `Option.isSome` / `isNone` | `Option<a> -> Bool` |

## `Result`

| Function | Type |
|---|---|
| `Result.map` | `((a -> b), Result<e, a>) -> Result<e, b>` |
| `Result.mapErr` | `((e -> f), Result<e, a>) -> Result<f, a>` |
| `Result.andThen` | `((a -> Result<e, b>), Result<e, a>) -> Result<e, b>` |
| `Result.withDefault` | `(a, Result<e, a>) -> a` |
| `Result.map2` … `map5` | combine N results; all must be `Ok` |
| `Result.all` | `List<Result<e, a>> -> Result<List<e>, List<a>>` |
| `Result.toOption` | `Result<e, a> -> Option<a>` |

## `Json`

| Function | Type |
|---|---|
| `Json.parse` | `String -> Result<JsonError, Json>` |
| `Json.field` | `(String, Json) -> Result<JsonError, Json>` |
| `Json.decode` | `(Decoder<a>, Json) -> Result<JsonError, a>` |
| `Json.encode` | `a -> String` (derived for any concrete type) |

Encoding/decoding for your own records and sum types is **derived** from the type —
you don't hand-write decoders for ordinary data.

## `Html` (client)

Element constructors take attributes and children:

```px
Html.div([Attr.class("card")], [ Html.text("hi") ])
Html.button([Event.onClick(Clicked)], [ Html.text("Go") ])
Html.input([Attr.value(v), Event.onInput(\s -> Changed(s))])
```

| Module | Provides |
|---|---|
| `Html` | `div`, `span`, `p`, `form`, `input`, `button`, `text`, … |
| `Attr` | `class`, `id`, `value`, `type_`, `disabled`, `placeholder`, … |
| `Event` | `onClick`, `onInput`, `onSubmit`, `onBlur`, … (each carries a `Msg`) |

## `Http` (effect)

| Function | Type |
|---|---|
| `Http.get` | `(String, (Result<HttpError, String> -> Msg)) -> Cmd<Msg>` |
| `Http.post` | `(String, Body, (Result<HttpError, String> -> Msg)) -> Cmd<Msg>` |
| `Http.expectJson` | helper to decode a typed response |

(For talking to your *own* backend, prefer a `server fn` + `Server.call` over raw
`Http` — it's typed end to end. See [07](07-full-stack.md).)

## Other effect modules

| Module | Key functions |
|---|---|
| `Time` | `Time.now(toMsg)`, `Time.every(ms, toMsg)` |
| `Random` | `Random.int(lo, hi, toMsg)`, `Random.choice(list, toMsg)` |
| `Nav` | `Nav.push(url)`, `Nav.replace(url)`, `Nav.back` |
| `Console` | `Console.log(String)`, `Console.warn`, `Console.error` |
| `Cmd` | `Cmd.none`, `Cmd.batch(List<Cmd<Msg>>)`, `Cmd.map` |

## Next

Put it all together in the [10 · Tutorial](10-tutorial-signup.md).
