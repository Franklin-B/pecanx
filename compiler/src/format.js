// PecanX formatter (pcx fmt). Pretty-prints the AST to canonical source.
// Precedence-aware: it inserts the minimal parentheses needed so the output
// re-parses to the same structure and is idempotent.

const PREC = { "|>": 1, "or": 2, "and": 3, "==": 4, "/=": 4, "<": 4, "<=": 4, ">": 4, ">=": 4, "++": 5, "+": 6, "-": 6, "*": 7, "/": 7, "%": 7 };
const RIGHT = new Set(["++"]); // right-associative operators

export function formatProgram(program) {
  const isHeader = (d) => d && (d.kind === "Module" || d.kind === "Import");
  let out = "";
  program.decls.forEach((d, i) => {
    if (i > 0) out += isHeader(program.decls[i - 1]) && isHeader(d) ? "\n" : "\n\n";
    out += formatDecl(d);
  });
  return out + "\n";
}

function tparams(ps) { return ps && ps.length ? "<" + ps.join(", ") + ">" : ""; }

function formatDecl(d) {
  switch (d.kind) {
    case "Module": return "module " + d.name + (d.exposing ? " exposing (" + d.exposing.join(", ") + ")" : "");
    case "Import": return "import " + d.name + (d.alias ? " as " + d.alias : "") + (d.exposing ? " exposing (" + d.exposing.join(", ") + ")" : "");
    case "TypeAlias": return "type alias " + d.name + tparams(d.params) + " = " + formatType(d.type);
    case "TypeRecord": return "type " + d.name + tparams(d.params) + " = { " + d.fields.map((f) => f.name + ": " + formatType(f.type)).join(", ") + " }";
    case "TypeSum": return "type " + d.name + tparams(d.params) + " =\n" + d.variants.map((v) => {
      const fields = (v.fieldTypes || []).map((t, i) => (v.fields[i] ? v.fields[i] + ": " : "") + formatType(t));
      return "  | " + v.name + (fields.length ? "(" + fields.join(", ") + ")" : "");
    }).join("\n");
    case "Opaque": return "opaque " + d.name;
    case "Fn": {
      const kw = d.isParse ? "parse" : d.isServer ? "server fn" : "fn";
      const anns = (d.annotations || []).map((a) => "@" + a.name + (a.arg != null ? `("${a.arg}")` : "") + "\n").join("");
      const params = (d.params || []).map((p, i) => p + (d.paramTypes && d.paramTypes[i] ? ": " + formatType(d.paramTypes[i]) : "")).join(", ");
      const ret = d.retType ? ": " + formatType(d.retType) : "";
      return anns + `${kw} ${d.name}(${params})${ret} =\n  ` + formatExpr(d.body, "  ", 0);
    }
    case "Let": return "let " + d.name + (d.type ? ": " + formatType(d.type) : "") + " = " + formatExpr(d.expr, "", 0);
    default: return `-- (unprintable ${d.kind})`;
  }
}

function formatType(t) {
  if (!t) return "_";
  if (t.t === "name") return t.name + (t.args && t.args.length ? "<" + t.args.map(formatType).join(", ") + ">" : "");
  if (t.t === "fn") return [...t.params.map(formatType), formatType(t.ret)].join(" -> ");
  if (t.t === "tuple") return "(" + t.items.map(formatType).join(", ") + ")";
  if (t.t === "record") return "{ " + t.fields.map((f) => f.name + ": " + formatType(f.type)).join(", ") + " }";
  return "_";
}

// `ind` = current indent; `prec` = surrounding precedence (for parenthesization).
function formatExpr(e, ind, prec) {
  switch (e.kind) {
    case "Lit": {
      if (typeof e.value === "boolean") return String(e.value);
      if (e.float && Number.isInteger(e.value)) return e.value + ".0";
      return String(e.value);
    }
    case "StrInterp": return '"' + e.parts.map((p) => (p.kind === "str" ? escapeStr(p.value) : "${" + formatExpr(p.expr, ind, 0) + "}")).join("") + '"';
    case "Var": return e.name;
    case "Field": return formatExpr(e.obj, ind, 9) + "." + e.name;
    case "Call": {
      const args = e.named ? e.args.map((a) => a.name + " = " + formatExpr(a.expr, ind, 0)) : e.args.map((a) => formatExpr(a, ind, 0));
      return formatExpr(e.callee, ind, 9) + "(" + args.join(", ") + ")";
    }
    case "Lambda": {
      const ps = (e.params.length === 1 && !(e.paramTypes && e.paramTypes[0])) ? e.params[0]
        : "(" + e.params.map((p, i) => p + (e.paramTypes && e.paramTypes[i] ? ": " + formatType(e.paramTypes[i]) : "")).join(", ") + ")";
      return "\\" + ps + " -> " + formatExpr(e.body, ind, 0);
    }
    case "If": return "if " + formatExpr(e.cond, ind, 0) + " then " + formatExpr(e.then, ind, 0) + " else " + formatExpr(e.else, ind, 0);
    case "Tuple": return "(" + e.items.map((i) => formatExpr(i, ind, 0)).join(", ") + ")";
    case "List": return "[" + e.items.map((i) => (i.kind === "Spread" ? "..." + formatExpr(i.expr, ind, 0) : formatExpr(i, ind, 0))).join(", ") + "]";
    case "Record": return "{ " + e.fields.map((f) => f.name + " = " + formatExpr(f.expr, ind, 0)).join(", ") + " }";
    case "RecordUpdate": return "{ ..." + formatExpr(e.base, ind, 0) + ", " + e.fields.map((f) => f.name + " = " + formatExpr(f.expr, ind, 0)).join(", ") + " }";
    case "UnOp": { const inner = (e.op === "not" ? "not " : "-") + formatExpr(e.operand, ind, 8); return prec > 8 ? "(" + inner + ")" : inner; }
    case "BinOp": {
      const p = PREC[e.op];
      const right = RIGHT.has(e.op);
      const l = formatExpr(e.left, ind, right ? p + 1 : p);
      const r = formatExpr(e.right, ind, right ? p : p + 1);
      const s = `${l} ${e.op} ${r}`;
      return p < prec ? "(" + s + ")" : s;
    }
    case "Pipe": { const l = formatExpr(e.left, ind, 1), r = formatExpr(e.right, ind, 2); const s = `${l} |> ${r}`; return 1 < prec ? "(" + s + ")" : s; }
    case "Block": {
      const lines = e.bindings.map((b) => `let${b.bang ? "!" : ""} ${b.name} = ` + formatExpr(b.expr, ind, 0));
      lines.push(formatExpr(e.result, ind, 0));
      return lines.join("\n" + ind);
    }
    case "Match": {
      const inner = ind + "  ";
      const arms = e.arms.map((a) => inner + formatPattern(a.pattern) + (a.guard ? " if " + formatExpr(a.guard, inner, 0) : "") + " -> " + formatExpr(a.body, inner, 0));
      return "match " + formatExpr(e.scrutinee, ind, 0) + " {\n" + arms.join("\n") + "\n" + ind + "}";
    }
    case "Try": return formatExpr(e.expr, ind, 9) + "?";
    default: return `/* ${e.kind} */`;
  }
}

function formatPattern(p) {
  switch (p.kind) {
    case "PWild": return "_";
    case "PVar": return p.name;
    case "PLit": return typeof p.value === "string" ? `"${escapeStr(p.value)}"` : String(p.value);
    case "PCtor": return p.name + (p.args.length ? "(" + p.args.map(formatPattern).join(", ") + ")" : "");
    case "PTuple": return "(" + p.items.map(formatPattern).join(", ") + ")";
    case "PList": return "[" + [...p.items.map(formatPattern), ...(p.rest ? ["..." + p.rest] : [])].join(", ") + "]";
    case "PRecord": return "{ " + [...p.fields, ...(p.hasRest ? ["..."] : [])].join(", ") + " }";
    default: return "_";
  }
}

function escapeStr(s) { return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\t/g, "\\t"); }
