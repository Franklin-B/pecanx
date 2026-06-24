// pcx lsp — a dependency-free Language Server (LSP over stdio).
//
// Speaks enough of the protocol to make .px feel like a real language in any
// LSP-capable editor:
//   • textDocument/publishDiagnostics — exhaustiveness (PX0001), the `?` guard
//     (PX0100), and whole-program Hindley-Milner inference (PX0200), each with a
//     precise source range now that the parser records declaration / match
//     positions.
//   • textDocument/hover — docs for keywords, stdlib modules, built-in
//     constructors, and the signature of any top-level function in the file.
//   • textDocument/documentSymbol — an outline of the file's functions, types,
//     opaque types, and top-level lets (with sum variants / record fields nested).
//
// It keeps every open document's text in memory so hover and symbols re-lex /
// re-parse the live buffer.

import { lex, LexError } from "./lexer.js";
import { parse, ParseError } from "./parser.js";
import { check } from "./check.js";
import { inferTypesLinked } from "./types.js";

// LSP enums we use.
const Severity = { error: 1, warning: 2, information: 3, hint: 4 };
const SymbolKind = { Class: 5, Field: 8, Enum: 10, Interface: 11, Function: 12, Constant: 14, EnumMember: 22, Struct: 23 };

export function startLsp(io = { input: process.stdin, output: process.stdout }) {
  const docs = new Map(); // uri -> text
  let buf = Buffer.alloc(0);
  const send = (msg) => { const s = JSON.stringify(msg); io.output.write(`Content-Length: ${Buffer.byteLength(s)}\r\n\r\n${s}`); };
  const reply = (id, result) => send({ jsonrpc: "2.0", id, result });

  io.input.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const headerEnd = buf.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const m = /Content-Length:\s*(\d+)/i.exec(buf.slice(0, headerEnd).toString());
      if (!m) { buf = buf.slice(headerEnd + 4); continue; }
      const len = +m[1], start = headerEnd + 4;
      if (buf.length < start + len) return;
      const body = buf.slice(start, start + len).toString();
      buf = buf.slice(start + len);
      try { handle(JSON.parse(body)); } catch { /* ignore malformed */ }
    }
  });

  function handle(msg) {
    switch (msg.method) {
      case "initialize":
        return reply(msg.id, {
          capabilities: {
            textDocumentSync: 1, // full document sync
            hoverProvider: true,
            documentSymbolProvider: true,
            diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false },
          },
          serverInfo: { name: "pcx", version: "0.3" },
        });
      case "initialized": return;
      case "textDocument/didOpen": {
        const { uri, text } = msg.params.textDocument;
        docs.set(uri, text); return validate(uri, text);
      }
      case "textDocument/didChange": {
        const uri = msg.params.textDocument.uri;
        const text = msg.params.contentChanges[msg.params.contentChanges.length - 1].text;
        docs.set(uri, text); return validate(uri, text);
      }
      case "textDocument/didClose": docs.delete(msg.params.textDocument.uri); return;
      case "textDocument/hover": return reply(msg.id, hover(msg.params));
      case "textDocument/documentSymbol": return reply(msg.id, documentSymbols(msg.params));
      case "shutdown": return reply(msg.id, null);
      case "exit": process.exit(0);
      default: if (msg.id != null) reply(msg.id, null);
    }
  }

  // --- diagnostics -----------------------------------------------------------
  function validate(uri, text) {
    let program;
    try { program = parse(lex(text)); }
    catch (e) {
      if (e instanceof LexError || e instanceof ParseError) {
        const mm = /(\d+):(\d+)/.exec(e.message || "");
        const line = mm ? +mm[1] - 1 : 0, col = mm ? +mm[2] - 1 : 0;
        return publish(uri, [diag(rangeAt(text, line, col), e.message, Severity.error, "PX0000")]);
      }
      throw e;
    }
    const name = (program.decls.find((d) => d.kind === "Module") || {}).name || "Main";
    const ds = [...check(program), ...inferTypesLinked([{ name, program, file: uri }])];
    publish(uri, ds.map((d) => {
      const line = d.line ? d.line - 1 : 0, col = d.col ? d.col - 1 : 0;
      return diag(rangeAt(text, line, col), d.message, Severity[d.severity] || Severity.error, d.code);
    }));
  }

  function publish(uri, diagnostics) { send({ jsonrpc: "2.0", method: "textDocument/publishDiagnostics", params: { uri, diagnostics } }); }
  function diag(range, message, severity, code) { return { range, severity, source: "pcx", code, message }; }

  // --- hover -----------------------------------------------------------------
  function hover({ textDocument, position }) {
    const text = docs.get(textDocument.uri);
    if (text == null) return null;
    const word = wordAt(text, position.line, position.character);
    if (!word) return null;
    const md = hoverDoc(word.text, text);
    if (!md) return null;
    return { contents: { kind: "markdown", value: md }, range: word.range };
  }

  function hoverDoc(name, text) {
    if (KEYWORD_DOC[name]) return `**\`${name}\`** — _keyword_\n\n${KEYWORD_DOC[name]}`;
    if (STDLIB_DOC[name]) return `**\`${name}\`** — _stdlib module_\n\n${STDLIB_DOC[name]}`;
    if (CTOR_DOC[name]) return `**\`${name}\`** — _constructor_\n\n${CTOR_DOC[name]}`;
    // a top-level function / type defined in this file?
    let program; try { program = parse(lex(text)); } catch { return null; }
    for (const d of program.decls) {
      if (d.kind === "Fn" && d.name === name) return "```px\n" + fnSignature(d) + "\n```";
      if ((d.kind === "TypeSum" || d.kind === "TypeRecord" || d.kind === "TypeAlias" || d.kind === "Opaque") && d.name === name)
        return "```px\n" + typeSignature(d) + "\n```";
    }
    return null;
  }

  // --- document symbols (outline) -------------------------------------------
  function documentSymbols({ textDocument }) {
    const text = docs.get(textDocument.uri);
    if (text == null) return [];
    let program; try { program = parse(lex(text)); } catch { return []; }
    const out = [];
    for (const d of program.decls) {
      if (d.line == null) continue;
      const range = rangeAt(text, d.line - 1, d.col - 1);
      const base = { name: d.name, range, selectionRange: range };
      if (d.kind === "Fn") out.push({ ...base, kind: SymbolKind.Function, detail: fnSignature(d).replace(/\s*=$/, "") });
      else if (d.kind === "TypeSum") out.push({ ...base, kind: SymbolKind.Enum, detail: "sum type", children: d.variants.map((v) => ({ name: v.name, kind: SymbolKind.EnumMember, range, selectionRange: range })) });
      else if (d.kind === "TypeRecord") out.push({ ...base, kind: SymbolKind.Struct, detail: "record", children: d.fields.map((f) => ({ name: f.name, kind: SymbolKind.Field, range, selectionRange: range })) });
      else if (d.kind === "TypeAlias") out.push({ ...base, kind: SymbolKind.Interface, detail: "type alias" });
      else if (d.kind === "Opaque") out.push({ ...base, kind: SymbolKind.Class, detail: "opaque type" });
      else if (d.kind === "Let") out.push({ ...base, kind: SymbolKind.Constant, detail: "let" });
    }
    return out;
  }
}

// --- signature rendering (shared by hover + symbols) -------------------------
function fnSignature(d) {
  const kw = d.isParse ? "parse" : d.isServer ? "server fn" : "fn";
  const params = d.params.map((p, i) => d.paramTypes[i] ? `${p}: ${typeStr(d.paramTypes[i])}` : p).join(", ");
  const ret = d.retType ? `: ${typeStr(d.retType)}` : "";
  return `${kw} ${d.name}(${params})${ret} =`;
}
function typeSignature(d) {
  if (d.kind === "Opaque") return `opaque ${d.name}`;
  if (d.kind === "TypeAlias") return `type alias ${d.name}${params(d)} = ${typeStr(d.type)}`;
  if (d.kind === "TypeRecord") return `type ${d.name}${params(d)} = { ${d.fields.map((f) => `${f.name}: ${typeStr(f.type)}`).join(", ")} }`;
  if (d.kind === "TypeSum") return `type ${d.name}${params(d)} =\n  ${d.variants.map((v) => v.name + (v.fieldTypes && v.fieldTypes.length ? `(${v.fieldTypes.map(typeStr).join(", ")})` : "")).join("\n  | ")}`;
  return d.name;
}
function params(d) { return d.params && d.params.length ? `<${d.params.join(", ")}>` : ""; }
function typeStr(t) {
  if (!t) return "_";
  if (t.t === "name") return t.name + (t.args && t.args.length ? `<${t.args.map(typeStr).join(", ")}>` : "");
  if (t.t === "fn") return `${t.params.map(typeStr).join(" -> ")} -> ${typeStr(t.ret)}`;
  if (t.t === "tuple") return `(${t.items.map(typeStr).join(", ")})`;
  if (t.t === "record") return `{ ${t.fields.map((f) => `${f.name}: ${typeStr(f.type)}`).join(", ")} }`;
  return "_";
}

// --- text-position helpers ---------------------------------------------------
// Returns the identifier/keyword word at a 0-based (line, character), or null.
function wordAt(text, line, character) {
  const lines = text.split(/\r?\n/);
  const src = lines[line];
  if (src == null) return null;
  const isW = (c) => /[A-Za-z0-9_]/.test(c);
  if (character > src.length) return null;
  let s = character; while (s > 0 && isW(src[s - 1])) s--;
  let e = character; while (e < src.length && isW(src[e])) e++;
  if (s === e) return null;
  return { text: src.slice(s, e), range: { start: { line, character: s }, end: { line, character: e } } };
}

// A range covering the word starting at (line, col); falls back to a 1-char span.
function rangeAt(text, line, col) {
  const lines = text.split(/\r?\n/);
  const src = lines[line] || "";
  let e = col;
  while (e < src.length && /[A-Za-z0-9_]/.test(src[e])) e++;
  if (e === col) e = col + 1;
  return { start: { line, character: col }, end: { line, character: e } };
}

// --- hover documentation -----------------------------------------------------
const KEYWORD_DOC = {
  module: "Declares the module name. The first line of a `.px` file.",
  import: "Brings another module into scope. `import M`, `import M as Q`, or `import M exposing (a, b)`.",
  exposing: "Lists the names a module exports or an import pulls in.",
  type: "Defines a record (`type T = { ... }`) or a sum type (`type T = A | B(x)`).",
  alias: "`type alias Name = ...` — a transparent synonym for an existing type.",
  opaque: "An abstract type whose constructor is private. Values can only be produced through a `parse`/smart constructor — the heart of \"parse, don't validate.\"",
  parse: "A function that validates raw input and returns a `Result`. Conventionally the only way to build an `opaque` value.",
  fn: "Defines a pure function. Pure functions can be compiled into the shared Kernel (JS + Wasm).",
  server: "`server fn` runs only on the backend; the client calls it via `Server.call`.",
  let: "Binds a value. At top level it's a module constant; inside a block it's a local binding.",
  if: "`if cond then a else b` — an expression (both branches required).",
  then: "Introduces the true branch of an `if`.",
  else: "Introduces the false branch of an `if`.",
  match: "Pattern-matches a value. The compiler checks exhaustiveness (PX0001) — every case of a sum type must be handled.",
  not: "Boolean negation.",
  and: "Short-circuiting boolean AND.",
  or: "Short-circuiting boolean OR.",
  true: "The `Bool` value true.",
  false: "The `Bool` value false.",
  unit: "The unit type / value `()` — \"no meaningful value.\"",
  effect: "Marks an effectful block (Cmd-producing); see docs/06-effects-and-architecture.md.",
  as: "Aliases an import: `import Long.Module.Name as M`.",
};

const STDLIB_DOC = {
  String: "Text operations: `length`, `isEmpty`, `trim`, `toLower`/`toUpper`, `contains`, `split`, `join`, `slice`, `replace`.",
  Int: "Integer operations: `parse`, `toString`, `toFloat`, `abs`, `min`, `max`, `clamp`.",
  Float: "Floating-point: `parse`, `toString`, `round`, `floor`, `ceil`, `sqrt`, `abs`.",
  List: "Immutable lists: `map`, `filter`, `foldl`, `find`, `any`, `all`, `head`, `last`, `reverse`, `append`, `range`, `sortBy`, `each`.",
  Dict: "Key/value maps.",
  Option: "`Some(a) | None`. Combinators: `map`, `andThen`, `withDefault`, `toResult`, `isSome`, `isNone`.",
  Result: "`Ok(a) | Err(e)`. Combinators: `map`, `mapErr`, `andThen`, `withDefault`, `map2..map5`, `all`, `toOption`.",
  Char: "Character predicates: `isAlpha`, `isDigit`.",
  Console: "Side-effecting output: `log`, `warn`, `error`.",
  Html: "View nodes: `div`, `span`, `p`, `button`, `ul`, `li`, `label`, `input`, `text`, `empty`.",
  Attr: "Element attributes: `class`, `id`, `value`, `placeholder`, `type_`, `disabled`, `key`.",
  Event: "Event handlers: `onClick`, `onInput`, `onSubmit`, `onBlur`.",
  Cmd: "Effects as data: `none`, `batch`.",
  Http: "`get`/`post` returning async Cmds (resolve to `Result`).",
  Time: "`delay(ms, toMsg)` — an async Cmd.",
  Server: "`call(value, toMsg)` — invoke a `server fn` and tag its Result as a Msg.",
  Db: "Database access available inside `server fn` bodies.",
  Program: "The Elm-style driver: `run` (headless) / `mount` (real DOM).",
  Nav: "Navigation effects.",
  Random: "Randomness (stubbed in v0.3).",
  Decode: "Decoders (stubbed in v0.3).",
  Json: "JSON (stubbed in v0.3).",
  Bool: "`true | false`.",
  Set: "Sets.",
};

const CTOR_DOC = {
  Ok: "`Result` success: `Ok(value)`.",
  Err: "`Result` failure: `Err(error)`.",
  Some: "`Option` present value: `Some(value)`.",
  None: "`Option` absent value.",
  NotAsked: "`Remote` — request not yet started.",
  Loading: "`Remote` — request in flight.",
  Failure: "`Remote` — request failed: `Failure(error)`.",
  Success: "`Remote` — request succeeded: `Success(value)`.",
};
