# PecanX Signup — one schema, two runtimes

A runnable demonstration of the core idea from the language design: **validation
that runs identically on the client and the server.** No drift, no duplicated
rules — one schema, imported by both sides.

This is the "ships today" realization of the concept, built with **TypeScript +
Zod + Vite + Express**. (The designed language compiles shared logic to a single
Wasm module run on both sides; here, the shared module is plain TypeScript that
both the browser bundle and the Node server import.)

## The whole idea, in one file

[`shared/signup.ts`](shared/signup.ts) defines the schema. It is imported,
unchanged, by:

- [`client/main.ts`](client/main.ts) — for instant, per-keystroke feedback.
- [`server/index.ts`](server/index.ts) — as the authority that actually decides.

Because both run the same code, the client and server **cannot disagree** about
what is valid or what the error messages say.

## Run it

```bash
cd pecanx/examples/pecanx-signup
npm install
npm run dev
```

Then open **http://localhost:5173**.

- `web` (Vite) serves the front end on **5173**.
- `api` (Express) serves the endpoint on **3001**.
- Vite proxies `/api/*` → the API, so there's no CORS.

(You can also run the two halves separately with `npm run web` and `npm run api`.)

## Prove the server is the real authority

The client validation is just a courtesy. To show the server validates
independently with the *same* rules, bypass the browser and POST bad data
straight to the API:

**PowerShell**

```powershell
Invoke-RestMethod -Uri http://localhost:3001/api/signup -Method Post `
  -ContentType application/json `
  -Body '{"email":"nope","password":"short","confirm":"x","age":"12"}'
```

**curl**

```bash
curl -s http://localhost:3001/api/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"nope","password":"short","confirm":"x","age":"12"}'
```

You'll get back exactly the same per-field messages the browser shows:

```json
{
  "ok": false,
  "errors": {
    "email": "That doesn't look like an email address.",
    "password": "Must be at least 8 characters.",
    "age": "You must be 18 or older."
  }
}
```

A valid submission returns `{ "ok": true, "id": "user_1" }`. Submit the same
email twice and the server rejects the duplicate — a check that only the server
can make.

## How this maps back to the designed language

| Designed language (`PecanX`)            | This project                          |
| --------------------------------------- | ------------------------------------- |
| `kernel/Signup/Domain.px` → Wasm        | `shared/signup.ts` imported by both   |
| `parse email/password/age`              | Zod schema fields                     |
| `Result<Errors, SignupRequest>`         | `safeParse` → `{ success, data/error }` |
| `server fn signup`                      | `POST /api/signup`                    |
| Model / Msg / update / view             | the tiny runtime in `client/main.ts`  |

## Files

```
pecanx-signup/
├── shared/signup.ts     the one schema (client + server)
├── server/index.ts      Express API, re-validates as the authority
├── client/main.ts       Elm-style form, live validation
├── client/styles.css
├── index.html
└── vite.config.ts       proxies /api → :3001
```
