# Glossary

An alphabetized reference of PecanX concepts and terms. Each entry gives a precise, contract-faithful definition and links to related terms. For full treatments, follow the cross-links into the manual chapters such as [03-types.md](03-types.md), [05-errors-and-validation.md](05-errors-and-validation.md), and [06-effects-and-architecture.md](06-effects-and-architecture.md). For the flat list of reserved words, operators, and standard-library signatures, see the companion [dictionary.md](dictionary.md).

### Algebraic data type

An umbrella term for the composite types PecanX builds from products and sums: a **[Record](#record)** (a product of named fields) and a **[Sum type](#sum-type)** (a choice between named variants). Pattern matching with **[match](#match)** is the primary way to consume them, and the compiler enforces **[Exhaustiveness](#exhaustiveness)**.

### Applicative accumulation

The validation style in which independent checks all run and their errors are gathered together, rather than stopping at the first failure. It is expressed with `Result.map2` through `Result.map5` (and `Result.all`), which combine several `Result` values and accumulate every `Err`. Contrast with the short-circuiting **[`?`](#pipeline-operator)** early-exit and `Result.andThen`, which stop at the first error. See [05-errors-and-validation.md](05-errors-and-validation.md).

### Cmd

`Cmd<Msg>` is a pure, first-class *description* of a side effect, tagged with the **[Msg](#msg)** that its result will become. Returned from **[init](#init)** and **[update](#update)**, it is handed to the runtime, which performs the effect and feeds the resulting `Msg` back into `update`. Built with helpers like `Cmd.none`, `Cmd.batch([..])`, `Http.get`, `Time.now`, and `Nav.push`. See **[Effect (managed)](#effect-managed)** and [06-effects-and-architecture.md](06-effects-and-architecture.md).

### Decoder

A value that safely turns an untrusted **[Foreign](#foreign)** value into a typed PecanX value, producing a `Result` rather than throwing. Decoders such as `Decode.bool`, `Decode.int`, `Decode.string`, and `Decode.html` are run with `Decode.run(decoder)`. Decoding is the *only* sanctioned way a `Foreign` value crosses from the **[Shell](#shell)** toward typed code. See **[FFI](#ffi)** and [08-ffi.md](08-ffi.md).

### Effect (managed)

Any interaction with the outside world (HTTP, time, randomness, navigation, logging, the database) that PecanX represents as data and runs *for* you, instead of letting code perform it inline. On the client an effect is a **[Cmd](#cmd)**; inside a **[Server fn](#server-fn)** effects are sequenced in an `effect { }` block with **[let!](#let)**. This keeps **[view](#view)** and the **[Kernel](#kernel)** pure. See **[Managed effects](#managed-effects)** and [06-effects-and-architecture.md](06-effects-and-architecture.md).

### Exhaustiveness

The compiler guarantee that a **[match](#match)** covers every possible case of the value it inspects; a missing variant is a compile error. You satisfy it by handling each **[Sum type](#sum-type)** constructor explicitly or by adding a **[Wildcard](#wildcard)** `_`. This is what makes adding a new variant a safe, compiler-guided refactor. See [04-pattern-matching.md](04-pattern-matching.md).

### FFI

The Foreign Function Interface: the quarantined boundary through which PecanX talks to JavaScript. Imports use `extern fn name(...): T = js "..."` (or `js throws "..."`), and outward exposure uses `@export("jsName")`. `extern` is allowed *only* in JS-target modules and never in the **[Kernel](#kernel)**; untrusted results arrive as **[Foreign](#foreign)** and must pass a **[Decoder](#decoder)**. See **[Quarantine](#quarantine)** and [08-ffi.md](08-ffi.md).

### Foreign

The type of an untrusted value that entered PecanX from JavaScript through the **[FFI](#ffi)**. A `Foreign` value is inert: it carries no trusted type and may leave that state *only* via `Decode.run(decoder)`, which yields a `Result`. This is the mechanism that enforces the **[Shell](#shell)** protecting the **[Kernel](#kernel)**. See [08-ffi.md](08-ffi.md).

### Generic / type parameter

A lowercase placeholder, written in angle brackets, that lets a type or function work uniformly for many element types — for example `List<a>`, `Option<a>`, `Result<e, a>`, and `Dict<k, v>`. The parameter is instantiated at each use site, and **[Hindley-Milner inference](#hindley-milner-inference)** usually fills it in for you. Note PecanX uses `<>` for generics, never `[]`. See [03-types.md](03-types.md).

### Hindley-Milner inference

The type-inference system that lets PecanX figure out most types for you, so local `let` bindings rarely need annotations even though the language is fully statically typed. By style convention you still annotate every public `fn` signature for documentation and stable interfaces, while letting inference handle locals. It also drives instantiation of a **[Generic / type parameter](#generic--type-parameter)**.

### Html

`Html<Msg>` is the pure, immutable description of UI returned by **[view](#view)**, tagged with the **[Msg](#msg)** its events emit. You build it with constructors like `Html.div`, `Html.button`, `Html.input`, and `Html.text`, attaching attributes via `Attr.*` and events via `Event.*` (for example `Event.onClick(Msg)`). Because it is data, never live DOM, rendering stays a pure function of the **[Model](#model)**. See [06-effects-and-architecture.md](06-effects-and-architecture.md).

### Immutability

The property that bindings never change: a `let` introduces a value that cannot be reassigned, and there is no `var`, no `return`, and no mutation. To "change" a **[Record](#record)** you build a new one with update syntax `{ ...r, a = z }`. Immutability is what makes **[Purity](#purity)** and safe sharing between client and server practical. See [02-syntax-basics.md](02-syntax-basics.md).

### init

The architecture entry point `fn init(): (Model, Cmd<Msg>)` that produces the program's starting **[Model](#model)** together with any initial **[Cmd](#cmd)** to run immediately (for example, an opening HTTP request). It pairs with **[update](#update)** and **[view](#view)** to form the client app loop. See [06-effects-and-architecture.md](06-effects-and-architecture.md).

### Isomorphic validation

The core PecanX idea that one set of validation and business rules — written once in the **[Kernel](#kernel)** — runs unchanged on *both* client and server, because the Kernel compiles to a single shared **[WebAssembly (Wasm) target](#webassembly-wasm-target)** module. The client gets instant feedback and the server gets an authoritative re-check from the very same code, with no duplicated logic to drift. The runnable reference app at `pecanx/examples/pecanx-signup` illustrates the idea. See [07-full-stack.md](07-full-stack.md).

### Kernel

The pure core of a PecanX program: types, validation, and business rules, free of side effects. It compiles to one **[WebAssembly (Wasm) target](#webassembly-wasm-target)** module shared by client and server, which is what makes **[Isomorphic validation](#isomorphic-validation)** possible. Nothing reaches the Kernel without passing the **[Shell](#shell)**, and `extern`/**[FFI](#ffi)** is forbidden inside it; marking impure code `@kernel` is a compile error. See [00-overview.md](00-overview.md).

### Lambda

An anonymous function value, written `\x -> e` or with an annotated parameter `\(x: T) -> e`. Because functions are first-class, lambdas are passed to higher-order functions like `List.map` and event handlers such as `Event.onInput(\s -> Msg(s))`. See [02-syntax-basics.md](02-syntax-basics.md).

### let!

The binding form used inside an `effect { }` block to sequence an *effectful* step, taking the result of one **[Effect (managed)](#effect-managed)** before the next runs — the do-notation counterpart of an ordinary `let`. It appears in **[Server fn](#server-fn)** bodies (for example over `Db.*` calls) and other effect blocks. Plain `let` still binds pure values within the same block. See [07-full-stack.md](07-full-stack.md).

### Managed effects

The general principle that PecanX programs never perform side effects inline; they *return descriptions* of effects (a **[Cmd](#cmd)** on the client, an `effect { }` step on the server) and let the runtime execute them and route results back as a **[Msg](#msg)**. This preserves **[Purity](#purity)** in **[view](#view)** and the **[Kernel](#kernel)**. See **[Effect (managed)](#effect-managed)** and [06-effects-and-architecture.md](06-effects-and-architecture.md).

### match

The exhaustive pattern-matching expression `match v { Pattern -> expr ... }` (arms separated by newlines, no commas). Patterns include literals, constructors, list patterns (`[]`, `[x]`, `[first, ...rest]`), record destructuring `{ a, b }`, and the **[Wildcard](#wildcard)** `_`; a guard adds `if cond`. The compiler enforces **[Exhaustiveness](#exhaustiveness)**, and the shorthand `if let Some(x) = e then ... else ...` handles a single case. PecanX uses `match`, never `case`/`switch`. See [04-pattern-matching.md](04-pattern-matching.md).

### Model

The single immutable value that holds all of a client program's state, defined as `type Model`. It is created by **[init](#init)**, transformed by **[update](#update)**, and rendered by **[view](#view)**. Because it is immutable, each update yields a *new* Model rather than mutating the old one. See [06-effects-and-architecture.md](06-effects-and-architecture.md).

### Msg

The **[Sum type](#sum-type)** `type Msg` enumerating every event that can change the program — user actions and the results of effects alike. **[update](#update)** matches on a `Msg` to compute the next **[Model](#model)**, and every **[Cmd](#cmd)** and **[Html](#html)** is tagged with the `Msg` it will eventually deliver. See [06-effects-and-architecture.md](06-effects-and-architecture.md).

### Opaque type

A type whose internal representation is hidden, declared with `opaque Name`. Its constructor is in scope *only* inside the type's `parse` function, so values can be created solely by validated construction; outside code reads them back through an accessor like `Email.unwrap(e)`. This is the mechanism behind a **[Smart constructor](#smart-constructor)** and **[Parse-don't-validate](#parse-dont-validate)**. See [05-errors-and-validation.md](05-errors-and-validation.md).

### Option

The core type `Option<a> = None | Some(a)` representing a value that may be absent — PecanX's replacement for null, which the language does not have. You consume it with **[match](#match)** (or `if let`) and transform it with `Option.map`, `Option.andThen`, and `Option.withDefault`. For a *failure* with an explanation, use **[Result](#result)** instead. See [03-types.md](03-types.md).

### Orchard

The package registry and package manager for PecanX, invoked as `orchard`. It distributes and resolves reusable PecanX packages, complementing the **[pcx](#pcx)** compiler.

### Parse-don't-validate

The design discipline of turning untrusted input into a precise, trustworthy type *once*, at the boundary, rather than re-checking a loose type repeatedly. In PecanX it is realized with a `parse` function that returns `Result<FieldError, T>` and constructs an **[Opaque type](#opaque-type)**, so a value's existence proves it is valid. See **[Smart constructor](#smart-constructor)** and [05-errors-and-validation.md](05-errors-and-validation.md).

### pcx

The PecanX compiler. It performs type checking, infers **[Placement](#placement)**, and emits both JavaScript and the **[WebAssembly (Wasm) target](#webassembly-wasm-target)**. Packages it consumes are managed by **[Orchard](#orchard)**. (A working **v0.1** lives in [`../compiler`](../compiler): it checks `match` exhaustiveness, infers types via Hindley-Milner (`--types`), and compiles a useful subset of PecanX to JavaScript, WebAssembly (the pure-integer Kernel), and a real-DOM browser app.)

### Pipeline operator

The operator `|>` that threads a value into a function: `x |> f` means `f(x)`, making left-to-right data flow readable across several steps. A separate boundary operator is the early-exit `?`, which unwraps an `Ok`/`Some` in place but short-circuits the whole enclosing function on an `Err`/`None` — usable only inside a function that itself returns a `Result`/`Option`. Contrast that first-failure short-circuit with **[Applicative accumulation](#applicative-accumulation)**, which runs every check and gathers all errors. See [02-syntax-basics.md](02-syntax-basics.md).

### Placement

The compiler's inference of *where* code runs: pure code goes to the **[Kernel](#kernel)** (shared **[WebAssembly (Wasm) target](#webassembly-wasm-target)**), view/DOM/Web-API code goes to JavaScript, and a **[Server fn](#server-fn)** runs only on the server. You can override with `@kernel` or `@js`, but `@kernel` on impure code is a compile error. See [00-overview.md](00-overview.md).

### Purity

The property of a function whose result depends only on its inputs and which performs no side effects. **[view](#view)** and all **[Kernel](#kernel)** code must be pure; effects are instead expressed as **[Managed effects](#managed-effects)**. Purity is what lets the same Kernel run safely on client and server for **[Isomorphic validation](#isomorphic-validation)**. See [06-effects-and-architecture.md](06-effects-and-architecture.md).

### Quarantine

The principle that all untrusted JavaScript interaction is confined to the **[Shell](#shell)** — the type system plus the **[FFI](#ffi)** — so that nothing reaches the **[Kernel](#kernel)** without first being checked. Concretely, **[FFI](#ffi)** results arrive as **[Foreign](#foreign)** and must pass a **[Decoder](#decoder)** before any trusted code can use them. See [08-ffi.md](08-ffi.md).

### Record

A product type of named fields, declared `type R = { a: T, b: U }` and constructed with `=`: `{ a = x, b = y }`. Read a field with `r.a`, build an updated copy with `{ ...r, a = z }`, and use field punning `{ a }` to mean `a = a`. Note records assign fields with `=`, never `:`. See [03-types.md](03-types.md).

### Remote

The core type `Remote<e, a> = NotAsked | Loading | Failure(e) | Success(a)` for modeling the lifecycle of data fetched over a network. Holding all four states in one value lets **[view](#view)** render loading and error states explicitly via **[match](#match)**, with no nulls or ad-hoc flags. See [06-effects-and-architecture.md](06-effects-and-architecture.md).

### Result

The core type `Result<e, a> = Err(e) | Ok(a)` representing an operation that can fail with an explanatory error `e` or succeed with a value `a` — PecanX's replacement for exceptions, which the language does not have. Transform it with `Result.map`, `Result.mapErr`, and `Result.andThen`; combine several with `Result.map2`..`map5` for **[Applicative accumulation](#applicative-accumulation)**; short-circuit with the `?` operator. For mere absence, use **[Option](#option)**. See [05-errors-and-validation.md](05-errors-and-validation.md).

### Server fn

A function placed by **[Placement](#placement)** to run only on the server. Its body uses an `effect { }` block with **[let!](#let)** to sequence database and other **[Managed effects](#managed-effects)** (for example `Db.*`), and the client invokes it from **[update](#update)** via `Server.call(endpoint(args), ToMsg)`, whose result returns as a **[Msg](#msg)**. See [07-full-stack.md](07-full-stack.md).

### Shell

The protective layer around the **[Kernel](#kernel)**: the type system plus the quarantined **[FFI](#ffi)**. Its job is to ensure nothing reaches the Kernel without being validated — untrusted values enter as **[Foreign](#foreign)** and must pass a **[Decoder](#decoder)** first. See **[Quarantine](#quarantine)** and [00-overview.md](00-overview.md).

### Smart constructor

A function that is the *only* way to build a value of an **[Opaque type](#opaque-type)**, guaranteeing every instance satisfies its invariants. In PecanX this is the `parse` function, whose access to the hidden constructor is limited to its own body and which returns `Result<FieldError, T>`. It is the concrete tool for **[Parse-don't-validate](#parse-dont-validate)**. See [05-errors-and-validation.md](05-errors-and-validation.md).

### Sum type

A type that is a choice between named variants, declared `type S<a> = | A | B(x: T) | C(a)`, where variants with payload use parentheses. Consumed with **[match](#match)** under the **[Exhaustiveness](#exhaustiveness)** guarantee, sum types model "one of several shapes" precisely; **[Option](#option)**, **[Result](#result)**, and **[Remote](#remote)** are all sum types. See [03-types.md](03-types.md).

### Tuple

A fixed-size, ordered grouping of values of possibly different types, written `(a, b)` — an anonymous product without field names. PecanX uses it for small pairings such as the `(Model, Cmd<Msg>)` returned by **[init](#init)** and **[update](#update)**; for named fields prefer a **[Record](#record)**. See [03-types.md](03-types.md).

### Type alias

A new name for an existing type, declared `type alias UserId = Int`. It improves readability and intent without creating a distinct type — values remain interchangeable with the underlying type. When you instead need a genuinely separate, validated type, reach for an **[Opaque type](#opaque-type)**. See [03-types.md](03-types.md).

### update

The architecture function `fn update(msg: Msg, model: Model): (Model, Cmd<Msg>)` that, given the incoming **[Msg](#msg)** and current **[Model](#model)**, computes the next Model and any **[Cmd](#cmd)** to run. It is typically built around a **[match](#match)** on the `Msg`, and is where a **[Server fn](#server-fn)** is invoked via `Server.call`. See [06-effects-and-architecture.md](06-effects-and-architecture.md).

### view

The pure function `fn view(model: Model): Html<Msg>` that renders the current **[Model](#model)** as **[Html](#html)** tagged with the **[Msg](#msg)** its events emit. Being pure (no effects, no DOM access), it always produces the same UI description for the same Model. See **[Purity](#purity)** and [06-effects-and-architecture.md](06-effects-and-architecture.md).

### WebAssembly (Wasm) target

One of the two outputs **[pcx](#pcx)** produces (alongside JavaScript): a single Wasm module compiled from the **[Kernel](#kernel)** and shared by client and server. This shared module is the technical foundation of **[Isomorphic validation](#isomorphic-validation)**. Pure code is steered here automatically by **[Placement](#placement)**. See [00-overview.md](00-overview.md).

### Wildcard

The pattern `_` that matches any value without binding it, commonly used to complete a **[match](#match)** and satisfy **[Exhaustiveness](#exhaustiveness)** by catching all remaining cases. Use it deliberately: an explicit wildcard can hide a newly added **[Sum type](#sum-type)** variant that you might otherwise want the compiler to flag. See [04-pattern-matching.md](04-pattern-matching.md).
