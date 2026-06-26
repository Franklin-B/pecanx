// PecanX lexer (pcx v0.4).
//
// Produces a flat token stream. Newlines are treated as ordinary whitespace:
// the grammar is offside-free because keywords (`let`, `fn`, ...) and structural
// tokens delimit declarations and match arms, and there is no juxtaposition
// application (calls always use parentheses).

const KEYWORDS = new Set([
  "module", "import", "exposing", "as", "type", "alias", "opaque", "parse",
  "fn", "server", "let", "if", "then", "else", "match", "not", "and", "or",
  "true", "false", "unit", "effect",
]);

// Multi-character operators, longest first.
const OPS = ["...", "->", "|>", "++", "==", "/=", "<=", ">=", "::"];
const SINGLE = new Set([..."+-*/%<>=|\\?.,:(){}[]"]);

export class LexError extends Error {}

export function lex(src) {
  const toks = [];
  let i = 0, line = 1, col = 1, nl = false;
  const n = src.length;

  const peek = (k = 0) => src[i + k];
  const adv = () => { const c = src[i++]; if (c === "\n") { line++; col = 1; } else col++; return c; };
  // `nlBefore` records whether a newline separated this token from the previous
  // one. It lets the parser keep `(`/postfix-call binding to the same line, so
  // a value followed by the next match arm's parenthesized pattern is not glued
  // into a call.
  const push = (type, value, l = line, c = col) => { toks.push({ type, value, line: l, col: c, nlBefore: nl }); nl = false; };

  while (i < n) {
    const c = peek();

    // whitespace (including newlines)
    if (c === " " || c === "\t" || c === "\r" || c === "\n") { if (c === "\n") nl = true; adv(); continue; }

    // line comment  --... ; block comment {- ... -} (nesting supported)
    if (c === "-" && peek(1) === "-") { while (i < n && peek() !== "\n") adv(); continue; }
    if (c === "{" && peek(1) === "-") {
      adv(); adv(); let depth = 1;
      while (i < n && depth > 0) {
        if (peek() === "{" && peek(1) === "-") { adv(); adv(); depth++; }
        else if (peek() === "-" && peek(1) === "}") { adv(); adv(); depth--; }
        else { if (peek() === "\n") nl = true; adv(); }
      }
      continue;
    }

    const startLine = line, startCol = col;

    // string literal with ${...} interpolation
    if (c === '"') { const t = lexString(); t.nlBefore = nl; nl = false; toks.push(t); continue; }

    // number
    if (isDigit(c)) { push("num", lexNumber(), startLine, startCol); continue; }

    // annotation: @kernel / @js / @export
    if (c === "@") {
      adv(); let name = "";
      while (i < n && isIdentChar(peek())) name += adv();
      push("at", name, startLine, startCol);
      continue;
    }

    // identifier / keyword
    if (isIdentStart(c)) {
      let s = "";
      while (i < n && isIdentChar(peek())) s += adv();
      if (s === "let" && peek() === "!") { adv(); push("kw", "let!", startLine, startCol); continue; }
      push(KEYWORDS.has(s) ? "kw" : "ident", s, startLine, startCol);
      continue;
    }

    // multi-char operators
    let matched = null;
    for (const op of OPS) { if (src.startsWith(op, i)) { matched = op; break; } }
    if (matched) { for (let k = 0; k < matched.length; k++) adv(); push("op", matched, startLine, startCol); continue; }

    // single-char punctuation / operators
    if (SINGLE.has(c)) { adv(); push("op", c, startLine, startCol); continue; }

    throw new LexError(`Unexpected character ${JSON.stringify(c)} at ${line}:${col}`);
  }

  push("eof", null);
  return toks;

  // --- helpers ---------------------------------------------------------------
  function lexNumber() {
    let s = "", float = false;
    while (i < n && (isDigit(peek()) || peek() === "_")) s += adv();
    if (peek() === "." && isDigit(peek(1))) { float = true; s += adv(); while (i < n && (isDigit(peek()) || peek() === "_")) s += adv(); }
    if (peek() === "e" || peek() === "E") {
      float = true; s += adv();
      if (peek() === "+" || peek() === "-") s += adv();
      while (i < n && isDigit(peek())) s += adv();
    }
    return { n: Number(s.replace(/_/g, "")), float };
  }

  function lexString() {
    const sl = line, sc = col;
    adv(); // opening quote
    const segments = [];
    let buf = "";
    const flush = () => { if (buf.length) { segments.push({ kind: "str", value: buf }); buf = ""; } };
    while (i < n) {
      const ch = peek();
      if (ch === '"') { adv(); flush(); return { type: "str", value: segments, line: sl, col: sc }; }
      if (ch === "\\") {
        adv(); const e = adv();
        buf += e === "n" ? "\n" : e === "t" ? "\t" : e === "r" ? "\r"
          : e === '"' ? '"' : e === "\\" ? "\\" : e === "$" ? "$" : e;
        continue;
      }
      if (ch === "$" && peek(1) === "{") {
        adv(); adv(); flush();
        let depth = 1, exprSrc = "";
        while (i < n && depth > 0) {
          const d = peek();
          if (d === '"') { // skip a nested string literal verbatim
            exprSrc += adv();
            while (i < n && peek() !== '"') { if (peek() === "\\") exprSrc += adv(); exprSrc += adv(); }
            if (i < n) exprSrc += adv();
            continue;
          }
          if (d === "{") depth++;
          else if (d === "}") { depth--; if (depth === 0) { adv(); break; } }
          exprSrc += adv();
        }
        segments.push({ kind: "expr", src: exprSrc });
        continue;
      }
      buf += adv();
    }
    throw new LexError(`Unterminated string starting at ${sl}:${sc}`);
  }
}

function isDigit(c) { return c >= "0" && c <= "9"; }
function isIdentStart(c) { return c && (/[A-Za-z_]/.test(c)); }
function isIdentChar(c) { return c && (/[A-Za-z0-9_]/.test(c)); }
