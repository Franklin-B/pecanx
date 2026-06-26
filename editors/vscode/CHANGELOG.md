# Change Log

## 0.4.0

- Richer language server (from `pcx` v0.4): **completion** (stdlib members after
  `Module.`, plus local functions, types, constructors, and keywords),
  **go-to-definition** (local declarations and sum-type variants), and
  server-side **document formatting**.
- Diagnostics now include `PX0101` (a `?` used outside a function/lambda body); the
  old `PX0100` "`?` not supported" guard is gone — `pcx` v0.4 lowers `?`.
- The standalone `pcx fmt` formatter is registered only when the language server is
  disabled, so VS Code never sees two competing formatters for `.px`.

## 0.3.0 — initial release

- Language client for `pcx lsp`: live diagnostics (PX0001 / PX0100 / PX0200) with
  precise ranges, hover docs, and a document outline.
- TextMate grammar for `.px` (keywords, types, constructors, string interpolation,
  `@`-annotations, operators) and a language configuration (comments, brackets,
  auto-closing, indentation).
- Commands: Run, Build → JS / Wasm / DOM, Check, Check (with types), Start Dev
  Server, Format Document, Restart Language Server.
- Document formatter backed by `pcx fmt` (works on unsaved buffers).
- Snippets for common declarations and an Elm-style app skeleton.
- Automatic compiler discovery (setting → upward `compiler/pcx.js` search → PATH).
