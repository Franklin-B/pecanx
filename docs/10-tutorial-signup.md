# 10 · Tutorial — a full-stack signup form

This ties everything together: a signup form whose **validation runs identically on
the client and the server**, because it lives in one pure Kernel module. We'll build
the three layers — shared domain, client, server — and then map each piece to the
**runnable** TypeScript + Zod reference implementation in
[`../examples/pecanx-signup`](../examples/pecanx-signup) so you can see the same idea executing
today.

What we're building:

- Live, per-keystroke validation in the browser.
- A server endpoint that re-validates with the *same code* and adds a check only it
  can do (email uniqueness).
- One set of error messages, defined once.

## Project layout

```
signup/
├── pecanx.toml
├── kernel/Signup/Domain.px   pure: types + validation → Wasm, runs everywhere
├── client/Main.px            the form → JS
└── server/Api.px             the endpoint → backend
```

## Step 1 — the shared Kernel (`kernel/Signup/Domain.px`)

This is the heart. It is pure, so it compiles to the Kernel and runs on both sides.

```px
module Signup.Domain exposing
  ( RawSignup, SignupRequest, Errors, FieldError
  , validate, emptyErrors )

-- Validated domain values. Once constructed, guaranteed valid.
opaque Email
opaque Password
opaque Age

type FieldError =
  | Empty
  | BadEmailFormat
  | TooShort(min: Int)
  | TooWeak
  | TooYoung(min: Int)
  | Mismatch
  | Taken

-- Smart constructors — the only way to build the opaque types.
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
  match Int.parse(String.trim(raw)) {
    None    -> Err(Empty)
    Some(n) -> if n < 18 then Err(TooYoung(min = 18)) else Ok(Age(n))
  }

fn hasLetter(s: String): Bool = String.toList(s) |> List.any(Char.isAlpha)
fn hasDigit(s: String): Bool  = String.toList(s) |> List.any(Char.isDigit)
```

```px
-- Raw input: what the form holds and what crosses the wire (all strings).
type RawSignup = {
  email: String,
  password: String,
  confirm: String,
  age: String,
}

-- The trustworthy result. Cannot be constructed unless every check passed.
type SignupRequest = {
  email: Email,
  password: Password,
  age: Age,
}

-- Per-field errors; None = currently valid.
type Errors = {
  email: Option<FieldError>,
  password: Option<FieldError>,
  confirm: Option<FieldError>,
  age: Option<FieldError>,
}

let emptyErrors: Errors =
  { email = None, password = None, confirm = None, age = None }

-- THE function. Accumulates every error (not just the first), so the form
-- can highlight all bad fields at once.
fn validate(raw: RawSignup): Result<Errors, SignupRequest> =
  let e = email(raw.email)
  let p = password(raw.password)
  let a = age(raw.age)
  let c = if raw.confirm == raw.password then Ok(unit) else Err(Mismatch)

  match (e, p, a, c) {
    (Ok(em), Ok(pw), Ok(ag), Ok(_)) ->
      Ok({ email = em, password = pw, age = ag })
    _ ->
      Err({
        email = errorOf(e),
        password = errorOf(p),
        confirm = errorOf(c),
        age = errorOf(a),
      })
  }

fn errorOf(r: Result<FieldError, a>): Option<FieldError> =
  match r { Ok(_) -> None, Err(x) -> Some(x) }
```

Everything above is pure → it's the Kernel → it runs on the client *and* the server.

## Step 2 — the server (`server/Api.px`)

```px
module Signup.Api exposing (signup)

import Signup.Domain exposing (RawSignup, Errors, FieldError, validate, emptyErrors)

server fn signup(raw: RawSignup): Result<Errors, UserId> =
  match validate(raw) {                 -- the SAME validate() the browser ran
    Err(errs) -> Err(errs)
    Ok(req)   ->
      effect {
        let! taken = Db.emailExists(req.email)
        if taken then
          Err({ ...emptyErrors, email = Some(Taken) })   -- a check only the server can do
        else
          let! id = Db.insertUser(req)
          Ok(id)
      }
  }
```

The client's validation was a courtesy; this is the authority. Because both call the
identical Kernel `validate`, they cannot disagree — and the compiler still forces the
server to handle the database-only failure (`Taken`).

## Step 3 — the client (`client/Main.px`)

```px
module Signup.Main

import Signup.Domain exposing (RawSignup, Errors, FieldError, validate, emptyErrors)
import Signup.Api exposing (signup)

type Field = EmailF | PasswordF | ConfirmF | AgeF

type Model = {
  form: RawSignup,
  errors: Errors,
  status: Remote<Errors, UserId>,
}

type Msg =
  | Changed(field: Field, value: String)
  | Submitted
  | GotResponse(Result<Errors, UserId>)

fn init(): (Model, Cmd<Msg>) =
  ( { form = { email = "", password = "", confirm = "", age = "" }
    , errors = emptyErrors
    , status = NotAsked }
  , Cmd.none )

fn update(msg: Msg, model: Model): (Model, Cmd<Msg>) =
  match msg {
    Changed(field, value) ->
      let form = setField(model.form, field, value)
      -- live validation with the SAME shared code the server trusts
      let errors = match validate(form) { Err(e) -> e, Ok(_) -> emptyErrors }
      ({ ...model, form, errors }, Cmd.none)

    Submitted ->
      match validate(model.form) {
        Err(errors) -> ({ ...model, errors }, Cmd.none)        -- block submit
        Ok(_)       -> ({ ...model, status = Loading },
                        Server.call(signup(model.form), GotResponse))
      }

    GotResponse(result) ->
      match result {
        Ok(id)    -> ({ ...model, status = Success(id) }, Nav.push("/welcome"))
        Err(errs) -> ({ ...model, status = NotAsked, errors = errs }, Cmd.none)
      }
  }

fn view(model: Model): Html<Msg> =
  Html.form([Event.onSubmit(Submitted)], [
    field("Email", EmailF, model.form.email, model.errors.email),
    field("Password", PasswordF, model.form.password, model.errors.password),
    field("Confirm password", ConfirmF, model.form.confirm, model.errors.confirm),
    field("Age", AgeF, model.form.age, model.errors.age),
    Html.button([Attr.disabled(model.status == Loading)], [Html.text("Create account")]),
    banner(model.status),
  ])

fn field(label: String, f: Field, value: String, err: Option<FieldError>): Html<Msg> =
  Html.div([Attr.class("field")], [
    Html.label([], [Html.text(label)]),
    Html.input([Attr.value(value), Event.onInput(\v -> Changed(f, v))]),
    match err {
      None    -> Html.text("")
      Some(e) -> Html.p([Attr.class("error")], [Html.text(humanize(e))])
    },
  ])

-- Exhaustive: add a FieldError variant and this won't compile until you
-- give it a message.
fn humanize(e: FieldError): String =
  match e {
    Empty          -> "This field is required."
    BadEmailFormat -> "That doesn't look like an email address."
    TooShort(min)  -> "Must be at least ${Int.toString(min)} characters."
    TooWeak        -> "Use at least one letter and one number."
    TooYoung(min)  -> "You must be ${Int.toString(min)} or older."
    Mismatch       -> "Passwords don't match."
    Taken          -> "That email is already registered."
  }
```

## Why this is correct by construction

- **One `validate`, two runtimes.** Defined in `kernel/`, compiled to Wasm, used by
  both `client` and `server`. Drift is impossible.
- **Invalid data is unconstructable.** `SignupRequest` only exists if every field
  parsed; code past validation never re-checks.
- **No forgotten cases.** Every `match` on `FieldError` is exhaustive — including
  `humanize` and the server's handling of `Taken`.
- **No crashes on bad input.** `signup` returns `Result<Errors, UserId>`; there is
  no exception path.

## Mapping to the runnable reference (`pecanx-signup`)

While the `pcx` toolchain is being built, the identical model runs today in
TypeScript + Zod:

| This tutorial (PecanX) | Reference (`pecanx-signup`) |
|---|---|
| `kernel/Signup/Domain.px` (→ Wasm, both sides) | [`shared/signup.ts`](../examples/pecanx-signup/shared/signup.ts) (imported by both) |
| `parse email/password/age` | Zod schema fields |
| `validate : RawSignup -> Result<Errors, _>` | `signupSchema.safeParse` |
| `server fn signup` | [`POST /api/signup`](../examples/pecanx-signup/server/index.ts) |
| `Model / Msg / update / view` | the tiny runtime in [`client/main.ts`](../examples/pecanx-signup/client/main.ts) |
| `humanize(FieldError)` | per-field messages in the schema |

Run the reference:

```bash
cd pecanx/examples/pecanx-signup
npm install      # already done if you followed earlier steps
npm run dev      # http://localhost:5173
```

Then prove the server is the real authority by POSTing bad data straight past the
browser — you'll get back the same messages the form shows, because both run one
schema. The commands are in [`pecanx-signup/README.md`](../examples/pecanx-signup/README.md).

## Where to go next

- Re-read [07 · Full-stack](07-full-stack.md) now that you've seen the split in
  action.
- Harden the domain: add `opaque Username`, a stronger password policy, or
  rate-limiting in the `server fn`.
- When the `pcx` toolchain lands, this exact tutorial compiles and runs natively —
  the Kernel becomes one real Wasm module shared by client and server.
