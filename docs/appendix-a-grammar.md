# Appendix A · Grammar & Syntax Reference

This appendix is the precise, mechanical reference for PecanX surface syntax. The
prose chapters teach you how to *think* in PecanX; this one pins down exactly what
the parser accepts. If a chapter and this appendix ever appear to disagree, treat
the chapter as intent and this appendix as the letter of the law.

It pairs naturally with [02-syntax-basics.md](02-syntax-basics.md) (the friendly
tour), [03-types.md](03-types.md) (type declarations in depth),
[04-pattern-matching.md](04-pattern-matching.md) (patterns), and
[09-stdlib.md](09-stdlib.md) (the library names referenced in examples). For the
big picture of where code runs, see [00-overview.md](00-overview.md).

- [A.1 Lexical grammar](#a1-lexical-grammar)
- [A.2 Formal grammar (EBNF)](#a2-formal-grammar-ebnf)
- [A.3 Reserved words](#a3-reserved-words)
- [A.4 Operator precedence & associativity](#a4-operator-precedence--associativity)
- [A.5 One-page cheat sheet](#a5-one-page-cheat-sheet)

---

## A.1 Lexical grammar

The lexer turns source text into a stream of tokens. Whitespace and comments
separate tokens but are otherwise insignificant: PecanX is **not**
indentation-sensitive, and there are **no** statement terminators. The 2-space
indentation you see throughout the manual is style, not syntax.

### Comments

```px
-- line comment: runs to the end of the line

{- block comment:
   spans multiple lines
   {- and nests cleanly -}
   so you can comment out code that already has block comments -}
```

- A line comment starts at `--` and ends at the newline.
- A block comment opens with `{-`, closes with `-}`, and **nests**. Every `{-`
  must be balanced by a matching `-}`.

### Identifiers

PecanX distinguishes two identifier shapes by their first letter:

- **Lower identifiers** name values, functions, parameters, record fields, type
  parameters, and module-qualified members. They begin with a lowercase letter
  and continue with letters, digits, or `_`.
- **Upper identifiers** name types, sum-type constructors, module path segments,
  and opaque types. They begin with an uppercase letter and continue with
  letters, digits, or `_`.

```text
lower-ident  ::= ('a'..'z') , { 'a'..'z' | 'A'..'Z' | '0'..'9' | '_' } ;
upper-ident  ::= ('A'..'Z') , { 'a'..'z' | 'A'..'Z' | '0'..'9' | '_' } ;
```

A **module name** is one or more upper identifiers joined by `.` (for example
`String`, `Json`, `App.Account.Email`). In a qualified call such as
`String.trim(s)`, the part before the final `.` is a module name and the part
after it is a lower identifier.

Reserved words (see [A.3](#a3-reserved-words)) may not be used as identifiers.
`unit`, `true`, and `false` are literals, not identifiers.

### Numeric literals

PecanX has two numeric primitives, `Int` and `Float`, and never coerces between
them implicitly.

```px
let count   = 42          -- Int
let big     = 1_000_000   -- Int, underscores group digits
let ratio   = 3.14        -- Float (a '.' makes it a Float)
let scaled  = 6.022e23    -- Float with an exponent
let tiny    = 1.5e-9      -- Float with a signed exponent
```

```text
int-literal    ::= digit , { digit | '_' } ;
float-literal  ::= digit , { digit | '_' } , '.' , digit , { digit | '_' } , [ exponent ]
                 | digit , { digit | '_' } , exponent ;
exponent       ::= ( 'e' | 'E' ) , [ '+' | '-' ] , digit , { digit } ;
digit          ::= '0'..'9' ;
```

- Underscores are visual separators only and never affect the value.
- A literal is a `Float` exactly when it contains a `.` with digits on both
  sides, or an exponent. Otherwise it is an `Int`.
- There is no unary minus *token* baked into a literal: `-5` is the prefix
  operator `-` applied to the literal `5` (see [A.4](#a4-operator-precedence--associativity)).

### String literals

A `String` is double-quoted and supports escapes and interpolation.

```px
let greeting = "Hello, world"
let path     = "C:\\Users\\franklin"   -- escaped backslashes
let quoted   = "She said \"hi\""        -- escaped quote
let lines    = "first\nsecond"          -- newline escape
```

```text
string-literal ::= '"' , { string-char | escape | interpolation } , '"' ;
string-char    ::= ? any character except '"' , '\' , or newline ? ;
escape         ::= '\' , ( '"' | '\' | 'n' | 't' | 'r' | '0' | 'u{' hex+ '}' ) ;
hex            ::= digit | 'a'..'f' | 'A'..'F' ;
```

### String interpolation

Inside a string, `${ ... }` splices an expression into the text. The spliced
expression **must already be a `String`** — PecanX never stringifies implicitly,
so convert with `Int.toString`, `Float.toString`, and friends first.

```px
let name = "Pat"
let age  = 30
let line = "Hi ${name}, you are ${Int.toString(age)} today"
```

```text
interpolation ::= '${' , expr , '}' ;
```

To produce a literal `${` in a string, escape the dollar sign as `\$`. Use `++`
for plain concatenation when interpolation would only add noise:

```px
let url = base ++ "/users/" ++ Int.toString(id)
```

### Char literals

A `Char` is a single character in single quotes.

```px
let comma  = ','
let tab     = '\t'
let unicode = '\u{2728}'
```

```text
char-literal ::= "'" , ( char-body | escape ) , "'" ;
char-body    ::= ? any single character except "'" , '\' , or newline ? ;
```

### The unit literal

`unit` is the sole value of type `Unit`. It is written as the bare keyword
`unit` and most often appears as the result of an effect that produces nothing
interesting.

---

## A.2 Formal grammar (EBNF)

The grammar below describes the whole surface language. It uses ISO-style EBNF:
`,` is concatenation, `|` is choice, `{ x }` is zero-or-more, `[ x ]` is optional,
`( x )` groups, and `'lit'` is a terminal. Lexical terminals (`lower-ident`,
`upper-ident`, `int-literal`, `float-literal`, `string-literal`, `char-literal`)
are defined in [A.1](#a1-lexical-grammar). Operator-precedence resolution of the
`binary-op` alternatives is specified separately in
[A.4](#a4-operator-precedence--associativity); the `expr` productions here show
*what* combines, while the table shows *how tightly*.

```ebnf
(* ===== Compilation unit ===== *)

module        = module-header , { import } , { declaration } ;

module-header = 'module' , module-name , [ 'exposing' , exposing-list ] ;

module-name   = upper-ident , { '.' , upper-ident } ;

exposing-list = '(' , expose-item , { ',' , expose-item } , ')' ;
expose-item   = lower-ident
              | upper-ident                       (* a type, no constructors *)
              | upper-ident , '(' , '..' , ')' ;  (* a type with all constructors *)

(* ===== Imports ===== *)

import        = 'import' , module-name , [ import-tail ] ;
import-tail   = 'as' , upper-ident
              | 'exposing' , exposing-list ;

(* ===== Top-level declarations ===== *)

declaration   = { annotation } , decl-body ;

decl-body     = fn-decl
              | let-decl
              | type-decl
              | type-alias-decl
              | opaque-decl
              | parse-decl
              | extern-decl
              | server-fn-decl ;

annotation    = '@' , lower-ident , [ '(' , annotation-arg , { ',' , annotation-arg } , ')' ] ;
annotation-arg = string-literal | lower-ident | upper-ident ;
(* e.g. @kernel  @js  @export("jsName") *)

(* --- function --- *)
fn-decl       = 'fn' , lower-ident , param-list , ':' , type , '=' , expr ;
param-list    = '(' , [ param , { ',' , param } ] , ')' ;
param         = lower-ident , ':' , type ;

(* --- top-level binding --- *)
let-decl      = 'let' , lower-ident , [ ':' , type ] , '=' , expr ;

(* --- sum / record type --- *)
type-decl     = 'type' , upper-ident , [ type-params ] , '=' , type-rhs ;
type-rhs      = record-type
              | sum-type ;
type-params   = '<' , lower-ident , { ',' , lower-ident } , '>' ;

sum-type      = [ '|' ] , variant , { '|' , variant } ;
variant       = upper-ident , [ '(' , variant-field , { ',' , variant-field } , ')' ] ;
variant-field = [ lower-ident , ':' ] , type ;   (* payload; label optional *)

record-type   = '{' , [ field-decl , { ',' , field-decl } ] , '}' ;
field-decl    = lower-ident , ':' , type ;

(* --- type alias --- *)
type-alias-decl = 'type' , 'alias' , upper-ident , [ type-params ] , '=' , type ;

(* --- opaque type --- *)
opaque-decl   = 'opaque' , upper-ident , [ type-params ] ;

(* --- smart-constructor parser --- *)
parse-decl    = 'parse' , lower-ident , param-list , ':' , type , '=' , expr ;

(* --- FFI (JS-target modules only) --- *)
extern-decl   = 'extern' , 'fn' , lower-ident , param-list , ':' , type ,
                '=' , 'js' , [ 'throws' ] , string-literal ;

(* --- server function --- *)
server-fn-decl = 'server' , 'fn' , lower-ident , param-list , ':' , type , '=' , expr ;

(* ===== Expressions ===== *)

expr          = let-in
              | if-expr
              | if-let-expr
              | match-expr
              | lambda
              | effect-block
              | binary ;

(* let ... in ... — the in-form used inside expressions *)
let-in        = 'let' , lower-ident , [ ':' , type ] , '=' , expr , 'in' , expr ;

if-expr       = 'if' , expr , 'then' , expr , 'else' , expr ;

(* if-let shorthand: bind on a single pattern, else-branch mandatory *)
if-let-expr   = 'if' , 'let' , pattern , '=' , expr , 'then' , expr , 'else' , expr ;

match-expr    = 'match' , expr , '{' , match-arm , { newline , match-arm } , '}' ;
(* Match arms are separated by newlines; there is no separating or trailing comma. *)
match-arm     = pattern , [ 'if' , expr ] , '->' , expr ;

lambda        = '\' , lambda-params , '->' , expr ;
lambda-params = lower-ident
              | '(' , lower-ident , ':' , type , ')'
              | '(' , [ param , { ',' , param } ] , ')' ;

effect-block  = 'effect' , '{' , { effect-stmt } , expr , '}' ;
effect-stmt   = 'let!' , lower-ident , '=' , expr
              | 'let'  , lower-ident , [ ':' , type ] , '=' , expr ;

(* Operator layering; precedence/associativity in A.4.
   'binary' is the umbrella for all infix/prefix operator expressions. *)
binary        = unary , { binary-op , unary } ;
binary-op     = 'or' | 'and'
              | '==' | '/=' | '<' | '<=' | '>' | '>='
              | '++'
              | '+' | '-'
              | '*' | '/' | '%'
              | '|>' ;

unary         = [ 'not' | '-' ] , postfix ;

(* postfix: field access, the ? early-exit, and call application *)
postfix       = primary , { postfix-op } ;
postfix-op    = '.' , lower-ident          (* field access / record projection *)
              | '?'                         (* early-exit on Err/None *)
              | call-args ;                 (* function application *)
call-args     = '(' , [ expr , { ',' , expr } ] , ')' ;

primary       = literal
              | lower-ident
              | qualified-name              (* Module.member *)
              | constructor                 (* upper-ident, optionally applied *)
              | record-construct
              | record-update
              | list-literal
              | tuple-or-paren ;

qualified-name   = module-name , '.' , lower-ident ;
constructor      = upper-ident , [ call-args ] ;   (* e.g. None, Some(x), Email(s) *)

record-construct = '{' , [ field-init , { ',' , field-init } ] , '}' ;
field-init       = lower-ident , '=' , expr
                 | lower-ident ;                    (* field punning: { a } = { a = a } *)

record-update    = '{' , '...' , expr , ',' , field-init , { ',' , field-init } , '}' ;

list-literal     = '[' , [ expr , { ',' , expr } ] , ']' ;

tuple-or-paren   = '(' , expr , { ',' , expr } , ')' ;   (* one expr = grouping; 2+ = tuple *)

literal       = int-literal
              | float-literal
              | string-literal
              | char-literal
              | 'true' | 'false'
              | 'unit' ;

(* ===== Patterns ===== *)

pattern       = '_'                                     (* wildcard *)
              | lower-ident                             (* binds a name *)
              | literal-pattern
              | constructor-pattern
              | list-pattern
              | record-pattern
              | tuple-pattern
              | '(' , pattern , ')' ;

literal-pattern     = int-literal | float-literal | string-literal | char-literal
                    | 'true' | 'false' | 'unit' ;

constructor-pattern = upper-ident , [ '(' , pattern , { ',' , pattern } , ')' ] ;

list-pattern        = '[' , ']'                                  (* empty *)
                    | '[' , pattern , { ',' , pattern } , ']'    (* fixed length *)
                    | '[' , pattern , { ',' , pattern } , ',' , '...' , lower-ident , ']' ;
                                                                 (* head(s) + rest *)

record-pattern      = '{' , pattern-field , { ',' , pattern-field } , '}' ;
pattern-field       = lower-ident                                (* punned bind *)
                    | lower-ident , '=' , pattern ;

tuple-pattern       = '(' , pattern , { ',' , pattern } , ')' ;

(* ===== Type expressions ===== *)

type          = fn-type ;

fn-type       = type-app , { '->' , type-app } ;   (* '->' is right-associative *)

type-app      = type-atom , [ type-args ]          (* generic application: Option<a> *)
              | upper-ident , type-args ;
type-args     = '<' , type , { ',' , type } , '>' ;

type-atom     = upper-ident                        (* named type or constructor head *)
              | qualified-type                      (* Module.Type *)
              | lower-ident                         (* type variable *)
              | record-type                         (* structural record type *)
              | tuple-type
              | '(' , type , ')' ;                  (* grouping *)

qualified-type = module-name , '.' , upper-ident ;

tuple-type    = '(' , type , ',' , type , { ',' , type } , ')' ;
```

A few notes that the grammar implies but are worth stating outright:

- **Functions return their last expression.** There is no `return` keyword; the
  body of an `fn`, `parse`, or `server fn` is a single `expr` (often a `let-in`
  chain or a `match`).
- **`if` requires `else`.** The `else` branch is mandatory and both branches must
  share a type — that is why `if` is an expression, not a statement. The
  `if let Pattern = expr then ... else ...` shorthand obeys the same rule: the
  `else` is mandatory, and it runs when the pattern does not match.
- **`match` must be exhaustive.** The compiler rejects a `match` that does not
  cover every constructor; use `_` deliberately when you want a catch-all.
- **`extern` only appears in JS-target modules.** A Kernel module that contains
  `extern` is a compile error, and `@kernel` on impure code is likewise rejected.
- **Record update needs a base.** `{ ...r, a = z }` requires the spread to come
  first; `{ ...r }` with no updates is redundant and discouraged.

---

## A.3 Reserved words

These words are reserved by the language and may **not** be used as identifiers.
They fall into a few groups.

**Declarations & module structure**

```text
module    exposing    import    as
fn        let         in        type      alias
opaque    parse       extern    server    js        throws
```

**Expressions & control flow**

```text
if        then        else      match      effect
```

**Operators spelled as words**

```text
not       and         or
```

**Literals (reserved values, not identifiers)**

```text
true      false       unit
```

Notes:

- `let!` is the effectful binding form used inside `effect { ... }`. It reads as
  the keyword `let` followed immediately by `!`; you cannot name a value `let`.
- `alias` is reserved only in the phrase `type alias`, but to keep things simple
  it is reserved everywhere — do not use it as a name.
- The annotation names that follow `@` (`kernel`, `js`, `export`, and any future
  ones) are **not** reserved words; they are ordinary identifiers consumed by the
  `@`-annotation syntax. Even so, avoid shadowing them.
- Built-in type names (`Int`, `Float`, `Bool`, `String`, `Char`, `Unit`,
  `List`, `Option`, `Result`, `Dict`, `Remote`, `Cmd`, `Html`, `Foreign`) and
  core constructors (`Ok`, `Err`, `Some`, `None`, `Success`, `Loading`, …) are
  *not* keywords — they are regular upper identifiers provided by the standard
  library. You technically *can* shadow them, but you never should.

---

## A.4 Operator precedence & associativity

Operators bind according to the table below, listed **highest precedence first**
(tightest binding) to **lowest last**. Within a single row, all operators share
the same precedence and the stated associativity. Function application, field
access, and the `?` early-exit bind more tightly than any infix operator.

| Level | Operators | Description | Associativity |
|-------|-----------|-------------|---------------|
| 11 (tightest) | `f(x)`  `m.name`  `r.field`  `expr?` | application, qualified access, field access, early-exit `?` | left |
| 10 | `not x`  `-x` | prefix logical-not, prefix numeric negation | prefix (non-assoc) |
| 9  | `*`  `/`  `%` | multiply, divide, remainder | left |
| 8  | `+`  `-` | add, subtract | left |
| 7  | `++` | string / list concatenation | right |
| 6  | `==`  `/=`  `<`  `<=`  `>`  `>=` | equality and ordering comparisons | non-associative |
| 5  | `and` | boolean AND (short-circuits) | right |
| 4  | `or` | boolean OR (short-circuits) | right |
| 1 (loosest) | `\|>` | pipeline: `x \|> f` means `f(x)` | left |

Reading the table:

- **Application is king.** `String.trim(s).length` first calls `String.trim(s)`,
  then projects `.length`. To negate a call result, write `-(f(x))` or rely on
  level 10 binding: `-f(x)` is `-(f(x))` because postfix is level 11.
- **Comparisons are non-associative.** `a < b < c` is a syntax error on purpose;
  write `a < b and b < c`. This avoids the classic chained-comparison trap.
- **`++` is right-associative**, so `a ++ b ++ c` groups as `a ++ (b ++ c)` —
  the observable result is identical, but it matters for how the compiler builds
  the concatenation.
- **`and` binds tighter than `or`**, so `a or b and c` parses as
  `a or (b and c)`. Both short-circuit left to right.
- **Pipeline is loosest**, which is exactly what you want: everything to the
  left of `|>` is fully evaluated, then handed to the function on the right.

```px
-- without pipeline
let cleaned = String.toLower(String.trim(raw))

-- with pipeline — reads top-to-bottom, same meaning
let cleaned =
  raw
    |> String.trim
    |> String.toLower
```

Because `|>` is the loosest operator, a chain like
`x |> f |> g == y` parses as `(g(f(x))) == y` — the comparison binds tighter than
the pipe, so wrap with parentheses if you meant something else.

> You can never compare two functions with `==`. The compiler rejects equality
> on function-typed values outright; comparisons are for data, not behaviour.

---

## A.5 One-page cheat sheet

Everything below is a complete, idiomatic fragment. Together they touch every
major construct in the language.

**Module, imports, exposing**

```px
module App.Account exposing (Email, parseEmail)

import String
import Json exposing (field, decode)
import App.Util as Util
```

**Comments**

```px
-- a line
{- a block {- that nests -} -}
```

**Bindings & functions**

```px
let pi: Float = 3.14159
let total = List.foldl(\(acc, x) -> acc + x, 0, xs)

fn square(n: Int): Int = n * n

fn greet(name: String): String =
  "Hello, ${name}"
```

**Lambdas & pipeline**

```px
let inc = \x -> x + 1
let typed = \(n: Int) -> n * 2

let clean = raw |> String.trim |> String.toLower
```

**Records**

```px
type User = { name: String, age: Int }

let u = { name = "Pat", age = 30 }
let older = { ...u, age = u.age + 1 }
let name = u.name
let punned = { name, age = 31 }   -- name = name
```

**Sum types & generics**

```px
type Shape =
  | Circle(radius: Float)
  | Rect(w: Float, h: Float)

type alias UserId = Int

type Tree<a> =
  | Leaf
  | Node(left: Tree<a>, value: a, right: Tree<a>)
```

**Opaque types & smart constructors**

```px
opaque Email

parse parseEmail(raw: String): Result<FieldError, Email> =
  let s = String.trim(raw) in
  if String.contains(s, "@")
  then Ok(Email(s))               -- Email(..) in scope only here
  else Err(NotAnEmail)

fn show(e: Email): String = Email.unwrap(e)
```

**Conditionals & pattern matching**

```px
let label = if n > 0 then "positive" else "non-positive"

let describe =
  match shape {
    Circle(r) if r > 0.0 -> "circle r=${Float.toString(r)}"
    Circle(_)            -> "degenerate circle"
    Rect(w, h)           -> "rect"
  }

let firstName =
  match names {
    []              -> "nobody"
    [only]          -> only
    [first, ...rest] -> first
  }

let value = if let Some(x) = lookup then x else 0
```

**Results, Options & early-exit**

```px
fn register(raw: String): Result<FieldError, User> =
  let email = parseEmail(raw)?        -- bail out on Err
  Ok({ name = "new", age = 0 })

let safe = Int.parse(text) |> Option.withDefault(0)
```

**The Elm-style app architecture**

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
    Html.button([Event.onClick(Increment)], [Html.text("+")]),
  ])
```

**Effects, server functions & FFI**

```px
server fn loadUser(id: Int): Result<DbError, User> =
  effect {
    let! row = Db.get("users", id)
    Ok(row)
  }

extern fn now(): Float = js "Date.now()"
extern fn risky(s: String): Foreign = js throws "JSON.parse(s)"

@export("greet")
fn greetJs(name: String): String = "Hi ${name}"
```

**Decoding untrusted Foreign values**

```px
let result = Decode.run(Decode.string, payload)   -- Result<DecodeError, String>
```

---

See also: [02-syntax-basics.md](02-syntax-basics.md) ·
[03-types.md](03-types.md) · [04-pattern-matching.md](04-pattern-matching.md) ·
[05-errors-and-validation.md](05-errors-and-validation.md) ·
[06-effects-and-architecture.md](06-effects-and-architecture.md) ·
[08-ffi.md](08-ffi.md) · [09-stdlib.md](09-stdlib.md).
