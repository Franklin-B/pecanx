# Change Log

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
