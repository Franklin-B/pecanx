// PecanX parser (pcx v0.3). Recursive descent + precedence climbing.

import { lex } from "./lexer.js";

export class ParseError extends Error {}

const STDLIB = new Set([
  "String", "Int", "Float", "List", "Dict", "Option", "Result", "Char",
  "Console", "Html", "Attr", "Event", "Cmd", "Http", "Time", "Random",
  "Nav", "Server", "Db", "Decode", "Json", "Bool", "Set", "Program",
]);

class Parser {
  constructor(tokens) { this.toks = tokens; this.pos = 0; }

  peek(k = 0) { return this.toks[this.pos + k]; }
  next() { return this.toks[this.pos++]; }
  atEof() { return this.peek().type === "eof"; }

  is(type, value) {
    const t = this.peek();
    return t.type === type && (value === undefined || t.value === value);
  }
  isOp(v) { return this.is("op", v); }
  isKw(v) { return this.is("kw", v); }

  eat(type, value) {
    if (!this.is(type, value)) {
      const t = this.peek();
      throw new ParseError(
        `Expected ${value !== undefined ? JSON.stringify(value) : type}, got ${t.type} ${JSON.stringify(t.value)} at ${t.line}:${t.col}`
      );
    }
    return this.next();
  }

  // ---- program --------------------------------------------------------------
  parseProgram() {
    const decls = [];
    while (!this.atEof()) decls.push(this.parseDecl());
    return { kind: "Program", decls };
  }

  parseDecl() {
    // annotations
    const annotations = [];
    while (this.is("at")) {
      const a = this.next();
      let arg = null;
      if (this.isOp("(")) { this.next(); const s = this.eat("str"); arg = strLit(s); this.eat("op", ")"); }
      annotations.push({ name: a.value, arg });
    }

    if (this.isKw("module")) return this.parseModule();
    if (this.isKw("import")) return this.parseImport();
    if (this.isKw("type")) return this.parseTypeDecl();
    if (this.isKw("opaque")) { this.next(); const name = this.eat("ident").value; return { kind: "Opaque", name }; }
    if (this.isKw("parse")) { this.next(); return this.parseFnLike({ isParse: true, annotations }); }
    if (this.isKw("fn")) { this.next(); return this.parseFnLike({ annotations }); }
    if (this.isKw("server")) { this.next(); this.eat("kw", "fn"); return this.parseFnLike({ isServer: true, annotations }); }
    if (this.isKw("let")) { this.next(); const name = this.eat("ident").value; let type = null; if (this.isOp(":")) { this.next(); type = this.parseType(); } this.eat("op", "="); const expr = this.parseExpr(); return { kind: "Let", name, expr, type }; }

    const t = this.peek();
    throw new ParseError(`Unexpected ${t.type} ${JSON.stringify(t.value)} at top level (${t.line}:${t.col})`);
  }

  parseModule() {
    this.eat("kw", "module");
    const name = this.parseDottedName();
    let exposing = null;
    if (this.isKw("exposing")) exposing = this.parseNameList();
    return { kind: "Module", name, exposing };
  }

  parseImport() {
    this.eat("kw", "import");
    const name = this.parseDottedName();
    let alias = null, exposing = null;
    if (this.isKw("as")) { this.next(); alias = this.eat("ident").value; }
    if (this.isKw("exposing")) exposing = this.parseNameList();
    return { kind: "Import", name, alias, exposing };
  }

  parseDottedName() {
    let s = this.eat("ident").value;
    while (this.isOp(".")) { this.next(); s += "." + this.eat("ident").value; }
    return s;
  }

  parseNameList() {
    this.eat("kw", "exposing"); this.eat("op", "(");
    const names = [];
    if (!this.isOp(")")) {
      do {
        names.push(this.eat("ident").value);
        if (this.isOp("(")) { // e.g. Type(..)
          this.next(); while (!this.isOp(")")) this.next(); this.eat("op", ")");
        }
      } while (this.isOp(",") && this.next());
    }
    this.eat("op", ")");
    return names;
  }

  parseTypeParams() {
    const params = [];
    if (this.isOp("<")) {
      this.next();
      if (!this.isOp(">")) { do { params.push(this.eat("ident").value); } while (this.isOp(",") && this.next()); }
      this.eat("op", ">");
    }
    return params;
  }

  parseTypeDecl() {
    this.eat("kw", "type");
    if (this.isKw("alias")) {
      this.next();
      const name = this.eat("ident").value;
      const params = this.parseTypeParams();
      this.eat("op", "=");
      const type = this.parseType();
      return { kind: "TypeAlias", name, params, type };
    }
    const name = this.eat("ident").value;
    const params = this.parseTypeParams();
    this.eat("op", "=");
    if (this.isOp("{")) {
      const fields = this.parseRecordType();
      return { kind: "TypeRecord", name, params, fields };
    }
    // sum type
    const variants = [];
    if (this.isOp("|")) this.next();
    do {
      const vname = this.eat("ident").value;
      const fields = []; // field name (or null for an unnamed positional field)
      const fieldTypes = [];
      if (this.isOp("(")) {
        this.next();
        if (!this.isOp(")")) {
          do {
            // each field: `name : Type` or just `Type`
            if (this.is("ident") && this.peek(1).type === "op" && this.peek(1).value === ":") {
              const fn = this.next().value; this.next(); fieldTypes.push(this.parseType()); fields.push(fn);
            } else { fieldTypes.push(this.parseType()); fields.push(null); }
          } while (this.isOp(",") && this.next());
        }
        this.eat("op", ")");
      }
      variants.push({ name: vname, arity: fields.length, fields, fieldTypes });
    } while (this.isOp("|") && this.next());
    return { kind: "TypeSum", name, params, variants };
  }

  parseRecordType() {
    this.eat("op", "{");
    const fields = [];
    if (!this.isOp("}")) {
      do {
        const fname = this.eat("ident").value;
        this.eat("op", ":");
        const type = this.parseType();
        fields.push({ name: fname, type });
      } while (this.isOp(",") && this.next());
    }
    this.eat("op", "}");
    return fields;
  }

  // Types are parsed into a small type AST (used by the optional type checker;
  // codegen ignores them).
  parseType() {
    const first = this.parseTypeAtom();
    if (this.isOp("->")) {
      const parts = [first];
      while (this.isOp("->")) { this.next(); parts.push(this.parseTypeAtom()); }
      const ret = parts.pop();
      return { t: "fn", params: parts, ret };
    }
    return first;
  }
  parseTypeAtom() {
    if (this.isOp("(")) {
      this.next();
      if (this.isOp(")")) { this.next(); return { t: "name", name: "Unit", args: [] }; }
      const items = [this.parseType()];
      while (this.isOp(",")) { this.next(); items.push(this.parseType()); }
      this.eat("op", ")");
      return items.length === 1 ? items[0] : { t: "tuple", items };
    }
    if (this.isOp("{")) { return { t: "record", fields: this.parseRecordType() }; }
    if (this.is("ident") || this.isKw("unit")) {
      const name = this.next().value;
      const args = [];
      if (this.isOp("<")) {
        this.next();
        if (!this.isOp(">")) { args.push(this.parseType()); while (this.isOp(",")) { this.next(); args.push(this.parseType()); } }
        this.eat("op", ">");
      }
      return { t: "name", name, args };
    }
    const t = this.peek();
    throw new ParseError(`Expected a type at ${t.line}:${t.col}, got ${t.type} ${JSON.stringify(t.value)}`);
  }

  parseFnLike({ isParse = false, isServer = false, annotations = [] } = {}) {
    const name = this.eat("ident").value;
    const ps = this.parseParams();
    let retType = null;
    if (this.isOp(":")) { this.next(); retType = this.parseType(); }
    this.eat("op", "=");
    const body = this.parseBlock();
    return {
      kind: "Fn", name,
      params: ps.map((p) => p.name),
      paramTypes: ps.map((p) => p.type),
      retType, body, isParse, isServer, annotations,
    };
  }

  parseParams() {
    this.eat("op", "(");
    const params = [];
    if (!this.isOp(")")) {
      do {
        const name = this.eat("ident").value;
        let type = null;
        if (this.isOp(":")) { this.next(); type = this.parseType(); }
        params.push({ name, type });
      } while (this.isOp(",") && this.next());
    }
    this.eat("op", ")");
    return params;
  }

  // A block: zero or more `let`/`let!` bindings followed by a result expression.
  parseBlock() {
    const bindings = [];
    while (this.isKw("let") || this.isKw("let!")) {
      const bang = this.peek().value === "let!";
      this.next();
      const name = this.eat("ident").value;
      let type = null;
      if (this.isOp(":")) { this.next(); type = this.parseType(); }
      this.eat("op", "=");
      const expr = this.parseExpr();
      bindings.push({ name, expr, bang, type });
    }
    const result = this.parseExpr();
    return bindings.length ? { kind: "Block", bindings, result } : result;
  }

  // ---- expressions (precedence climbing) ------------------------------------
  parseExpr() { return this.parsePipe(); }

  parsePipe() {
    let left = this.parseOr();
    while (this.isOp("|>")) { this.next(); const right = this.parseOr(); left = { kind: "Pipe", left, right }; }
    return left;
  }
  parseOr() {
    let left = this.parseAnd();
    while (this.isKw("or")) { this.next(); const right = this.parseAnd(); left = { kind: "BinOp", op: "or", left, right }; }
    return left;
  }
  parseAnd() {
    let left = this.parseCmp();
    while (this.isKw("and")) { this.next(); const right = this.parseCmp(); left = { kind: "BinOp", op: "and", left, right }; }
    return left;
  }
  parseCmp() {
    let left = this.parseConcat();
    while (this.is("op") && ["==", "/=", "<", "<=", ">", ">="].includes(this.peek().value)) {
      const op = this.next().value; const right = this.parseConcat();
      left = { kind: "BinOp", op, left, right };
    }
    return left;
  }
  parseConcat() {
    const left = this.parseAdd();
    if (this.isOp("++")) { this.next(); const right = this.parseConcat(); return { kind: "BinOp", op: "++", left, right }; }
    return left;
  }
  parseAdd() {
    let left = this.parseMul();
    while (this.is("op") && (this.peek().value === "+" || this.peek().value === "-")) {
      const op = this.next().value; const right = this.parseMul();
      left = { kind: "BinOp", op, left, right };
    }
    return left;
  }
  parseMul() {
    let left = this.parseUnary();
    while (this.is("op") && ["*", "/", "%"].includes(this.peek().value)) {
      const op = this.next().value; const right = this.parseUnary();
      left = { kind: "BinOp", op, left, right };
    }
    return left;
  }
  parseUnary() {
    if (this.isKw("not")) { this.next(); return { kind: "UnOp", op: "not", operand: this.parseUnary() }; }
    if (this.isOp("-")) { this.next(); return { kind: "UnOp", op: "neg", operand: this.parseUnary() }; }
    return this.parsePostfix();
  }
  parsePostfix() {
    let e = this.parseAtom();
    for (;;) {
      if (this.isOp("(") && !this.peek().nlBefore) { const a = this.parseArgs(); e = { kind: "Call", callee: e, named: a.named, args: a.args }; }
      else if (this.isOp(".")) {
        this.next();
        const tk = this.peek();
        // field names may be identifiers OR keywords (e.g. Int.parse)
        if (tk.type !== "ident" && tk.type !== "kw") this.eat("ident");
        this.next();
        e = { kind: "Field", obj: e, name: tk.value };
      }
      else if (this.isOp("?")) { this.next(); e = { kind: "Try", expr: e }; }
      else break;
    }
    return e;
  }
  parseArgs() {
    this.eat("op", "(");
    if (this.isOp(")")) { this.next(); return { named: false, args: [] }; }
    // Named-field constructor call:  Ctor(field = expr, ...)
    if (this.is("ident") && this.peek(1).type === "op" && this.peek(1).value === "=") {
      const args = [];
      do {
        const name = this.eat("ident").value;
        this.eat("op", "=");
        args.push({ name, expr: this.parseExpr() });
      } while (this.isOp(",") && this.next());
      this.eat("op", ")");
      return { named: true, args };
    }
    const args = [];
    do { args.push(this.parseExpr()); } while (this.isOp(",") && this.next());
    this.eat("op", ")");
    return { named: false, args };
  }

  parseAtom() {
    const t = this.peek();

    if (t.type === "num") { this.next(); return { kind: "Lit", value: t.value.n, float: t.value.float }; }
    if (t.type === "str") { this.next(); return this.buildStr(t); }
    if (this.isKw("true")) { this.next(); return { kind: "Lit", value: true }; }
    if (this.isKw("false")) { this.next(); return { kind: "Lit", value: false }; }
    if (this.isKw("unit")) { this.next(); return { kind: "Var", name: "unit" }; }
    if (this.isKw("if")) return this.parseIf();
    if (this.isKw("match")) return this.parseMatch();
    if (this.isKw("effect")) { this.next(); this.eat("op", "{"); const b = this.parseBlock(); this.eat("op", "}"); return b; }

    if (this.isOp("\\")) return this.parseLambda();

    if (this.isOp("(")) {
      this.next();
      if (this.isOp(")")) { this.next(); return { kind: "Var", name: "unit" }; }
      const first = this.parseExpr();
      if (this.isOp(",")) {
        const items = [first];
        while (this.isOp(",")) { this.next(); items.push(this.parseExpr()); }
        this.eat("op", ")");
        return { kind: "Tuple", items };
      }
      this.eat("op", ")");
      return first;
    }

    if (this.isOp("{")) return this.parseRecord();
    if (this.isOp("[")) {
      this.next();
      const items = [];
      if (!this.isOp("]")) {
        do {
          if (this.isOp("...")) { this.next(); items.push({ kind: "Spread", expr: this.parseExpr() }); }
          else items.push(this.parseExpr());
        } while (this.isOp(",") && this.next());
      }
      this.eat("op", "]");
      return { kind: "List", items };
    }

    if (t.type === "ident") { this.next(); return { kind: "Var", name: t.value }; }

    throw new ParseError(`Unexpected ${t.type} ${JSON.stringify(t.value)} at ${t.line}:${t.col}`);
  }

  buildStr(tok) {
    const parts = tok.value.map((seg) =>
      seg.kind === "str"
        ? { kind: "str", value: seg.value }
        : { kind: "expr", expr: parseSub(seg.src) }
    );
    return { kind: "StrInterp", parts };
  }

  parseIf() {
    this.eat("kw", "if"); const cond = this.parseExpr();
    this.eat("kw", "then"); const thenE = this.parseExpr();
    this.eat("kw", "else"); const elseE = this.parseExpr();
    return { kind: "If", cond, then: thenE, else: elseE };
  }

  parseLambda() {
    this.eat("op", "\\");
    const params = [];
    const paramTypes = [];
    if (this.isOp("(")) {
      this.next();
      if (!this.isOp(")")) {
        do {
          params.push(this.eat("ident").value);
          if (this.isOp(":")) { this.next(); paramTypes.push(this.parseType()); } else paramTypes.push(null);
        } while (this.isOp(",") && this.next());
      }
      this.eat("op", ")");
    } else {
      params.push(this.eat("ident").value);
      paramTypes.push(null);
    }
    this.eat("op", "->");
    const body = this.parseExpr();
    return { kind: "Lambda", params, paramTypes, body };
  }

  parseRecord() {
    this.eat("op", "{");
    if (this.isOp("...")) {
      this.next();
      const base = this.parseExpr();
      const fields = [];
      while (this.isOp(",")) {
        this.next();
        const name = this.eat("ident").value;
        if (this.isOp("=")) { this.next(); fields.push({ name, expr: this.parseExpr() }); }
        else fields.push({ name, expr: { kind: "Var", name } });
      }
      this.eat("op", "}");
      return { kind: "RecordUpdate", base, fields };
    }
    const fields = [];
    if (!this.isOp("}")) {
      do {
        const name = this.eat("ident").value;
        if (this.isOp("=")) { this.next(); fields.push({ name, expr: this.parseExpr() }); }
        else fields.push({ name, expr: { kind: "Var", name } });
      } while (this.isOp(",") && this.next());
    }
    this.eat("op", "}");
    return { kind: "Record", fields };
  }

  parseMatch() {
    this.eat("kw", "match");
    const scrutinee = this.parseExpr();
    this.eat("op", "{");
    const arms = [];
    while (!this.isOp("}")) {
      const pattern = this.parsePattern();
      let guard = null;
      if (this.isKw("if")) { this.next(); guard = this.parseExpr(); }
      this.eat("op", "->");
      const body = this.parseBlock();
      arms.push({ pattern, guard, body });
    }
    this.eat("op", "}");
    return { kind: "Match", scrutinee, arms };
  }

  // ---- patterns -------------------------------------------------------------
  parsePattern() {
    const t = this.peek();
    if (t.type === "num") { this.next(); return { kind: "PLit", value: t.value.n }; }
    if (t.type === "str") { this.next(); const segs = t.value; if (segs.length === 1 && segs[0].kind === "str") return { kind: "PLit", value: segs[0].value }; if (segs.length === 0) return { kind: "PLit", value: "" }; throw new ParseError(`String interpolation is not allowed in patterns at ${t.line}:${t.col}`); }
    if (this.isKw("true")) { this.next(); return { kind: "PLit", value: true }; }
    if (this.isKw("false")) { this.next(); return { kind: "PLit", value: false }; }

    if (this.isOp("(")) {
      this.next();
      if (this.isOp(")")) { this.next(); return { kind: "PWild" }; }
      const first = this.parsePattern();
      if (this.isOp(",")) {
        const items = [first];
        while (this.isOp(",")) { this.next(); items.push(this.parsePattern()); }
        this.eat("op", ")");
        return { kind: "PTuple", items };
      }
      this.eat("op", ")");
      return first;
    }

    if (this.isOp("[")) {
      this.next();
      const items = []; let rest = null;
      if (!this.isOp("]")) {
        do {
          if (this.isOp("...")) { this.next(); rest = this.eat("ident").value; break; }
          items.push(this.parsePattern());
        } while (this.isOp(",") && this.next());
      }
      this.eat("op", "]");
      return { kind: "PList", items, rest };
    }

    if (this.isOp("{")) {
      this.next();
      const fields = []; let hasRest = false;
      if (!this.isOp("}")) {
        do {
          if (this.isOp("...")) { this.next(); hasRest = true; break; }
          fields.push(this.eat("ident").value);
        } while (this.isOp(",") && this.next());
      }
      this.eat("op", "}");
      return { kind: "PRecord", fields, hasRest };
    }

    if (t.type === "ident") {
      this.next();
      if (t.value === "_") return { kind: "PWild" };
      if (isUpper(t.value)) {
        let args = [];
        if (this.isOp("(")) {
          this.next();
          if (!this.isOp(")")) { do { args.push(this.parsePattern()); } while (this.isOp(",") && this.next()); }
          this.eat("op", ")");
        }
        return { kind: "PCtor", name: t.value, args };
      }
      return { kind: "PVar", name: t.value };
    }

    throw new ParseError(`Unexpected ${t.type} ${JSON.stringify(t.value)} in pattern at ${t.line}:${t.col}`);
  }
}

function strLit(tok) {
  // a plain (non-interpolated) string token → its text
  return tok.value.map((s) => (s.kind === "str" ? s.value : "")).join("");
}
function isUpper(s) { return s[0] >= "A" && s[0] <= "Z"; }

function parseSub(src) {
  const p = new Parser(lex(src));
  const e = p.parseExpr();
  if (!p.atEof()) { const t = p.peek(); throw new ParseError(`Trailing tokens in interpolation: ${t.type} ${JSON.stringify(t.value)}`); }
  return e;
}

export function parse(tokens) {
  return new Parser(tokens).parseProgram();
}

export { STDLIB };
