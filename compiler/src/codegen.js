// PecanX → JavaScript code generator (pcx v0.2).

import { STDLIB } from "./parser.js";

export class CodegenError extends Error {}

// Map of constructor name -> ordered field names, for named-field construction.
let CTOR_FIELDS = new Map();

export function generate(program) {
  CTOR_FIELDS = new Map();
  for (const d of program.decls) {
    if (d.kind === "TypeSum") for (const v of d.variants) CTOR_FIELDS.set(v.name, v.fields || []);
  }
  const out = [];
  for (const d of program.decls) {
    const js = genDecl(d);
    if (js) out.push(js);
  }
  return out.join("\n\n") + "\n";
}

// Generate a linked program from dependency-ordered modules. Each module becomes
// an IIFE that binds its imports, runs its declarations, and returns its exports.
export function generateLinked(modules, entryName, opts = {}) {
  CTOR_FIELDS = new Map();
  for (const m of modules) {
    for (const d of m.program.decls) {
      if (d.kind === "TypeSum") for (const v of d.variants) CTOR_FIELDS.set(v.name, v.fields || []);
    }
  }
  const known = new Set(modules.map((m) => m.name));
  const parts = modules.map((m) => genModule(m, known));
  const entry = modules.find((m) => m.name === entryName);
  const hasMain = !!(entry && entry.program.decls.some((d) => d.kind === "Fn" && d.name === "main"));
  const em = mangle(entryName);
  let js = parts.join("\n\n");
  if (opts.domMount) {
    js += `\n\n$P.Program.mount(globalThis.document.getElementById("app"), ${em}.init, ${em}.update, ${em}.view);\n`;
  } else if (hasMain) {
    js += `\n\n${em}.main();\n`;
  }
  return { js, hasMain };
}

function genModule(mod, known) {
  const importLines = [];
  for (const d of mod.program.decls) {
    if (d.kind !== "Import" || !known.has(d.name)) continue;
    const dep = mangle(d.name);
    if (d.exposing) for (const nm of d.exposing) importLines.push(`const ${nm} = ${dep}.${nm};`);
    if (d.alias) importLines.push(`const ${d.alias} = ${dep};`);
    if (!d.exposing && !d.alias) importLines.push(`const ${lastSeg(d.name)} = ${dep};`);
  }
  const declJs = [];
  const exportNames = [];
  for (const d of mod.program.decls) {
    const js = genDecl(d);
    if (js) declJs.push(js);
    if (d.kind === "Fn" || d.kind === "Let" || d.kind === "Opaque") exportNames.push(d.name);
    else if (d.kind === "TypeSum") for (const v of d.variants) exportNames.push(v.name);
  }
  const exports = [...new Set(exportNames)].join(", ");
  const head = importLines.length ? importLines.join("\n") + "\n" : "";
  return `const ${mangle(mod.name)} = (() => {\n${head}${declJs.join("\n")}\nreturn { ${exports} };\n})();`;
}

function mangle(name) { return "$M_" + name.replace(/[^A-Za-z0-9_]/g, "_"); }
function lastSeg(name) { return name.split(".").pop(); }

function genDecl(d) {
  switch (d.kind) {
    case "Module":
    case "Import":
    case "TypeAlias":
    case "TypeRecord":
      return ""; // structural / erased at runtime
    case "TypeSum":
      return d.variants.map((v) =>
        v.arity === 0
          ? `const ${v.name} = { $: ${q(v.name)} };`
          : `function ${v.name}(${args(v.arity)}) { return { $: ${q(v.name)}, ${args(v.arity)} }; }`
      ).join("\n");
    case "Opaque":
      return `function ${d.name}(_0) { return { $: ${q(d.name)}, _0 }; }\n${d.name}.unwrap = (x) => x._0;`;
    case "Fn":
      return `function ${d.name}(${d.params.join(", ")}) { return ${genExpr(d.body)}; }`;
    case "Let":
      return `const ${d.name} = ${genExpr(d.expr)};`;
    default:
      throw new CodegenError(`Cannot generate declaration: ${d.kind}`);
  }
}

function genExpr(e) {
  switch (e.kind) {
    case "Lit":
      return typeof e.value === "boolean" ? String(e.value) : String(e.value);
    case "StrInterp":
      return genStr(e);
    case "Var":
      return e.name === "unit" ? "null" : e.name;
    case "Field":
      if (e.obj.kind === "Var" && STDLIB.has(e.obj.name)) return `$P.${e.obj.name}.${e.name}`;
      return `${genExpr(e.obj)}.${e.name}`;
    case "Call":
      if (e.named) return genNamedCtor(e);
      return `${genExpr(e.callee)}(${e.args.map(genExpr).join(", ")})`;
    case "Lambda":
      return `((${e.params.join(", ")}) => ${genExpr(e.body)})`;
    case "If":
      return `(${genExpr(e.cond)} ? ${genExpr(e.then)} : ${genExpr(e.else)})`;
    case "Match":
      return genMatch(e);
    case "Block":
      return genBlock(e);
    case "BinOp":
      return genBinOp(e);
    case "UnOp":
      return e.op === "not" ? `(!(${genExpr(e.operand)}))` : `(-(${genExpr(e.operand)}))`;
    case "Record":
      return `({ ${e.fields.map((f) => `${f.name}: ${genExpr(f.expr)}`).join(", ")} })`;
    case "RecordUpdate":
      return `({ ...${genExpr(e.base)}, ${e.fields.map((f) => `${f.name}: ${genExpr(f.expr)}`).join(", ")} })`;
    case "Tuple":
      return `[${e.items.map(genExpr).join(", ")}]`;
    case "List":
      return `[${e.items.map((it) => (it.kind === "Spread" ? `...${genExpr(it.expr)}` : genExpr(it))).join(", ")}]`;
    case "Pipe":
      return `${genExpr(e.right)}(${genExpr(e.left)})`;
    case "Try":
      throw new CodegenError("The `?` operator is not supported by the pcx v0.2 JS backend yet.");
    default:
      throw new CodegenError(`Cannot generate expression: ${e.kind}`);
  }
}

function genNamedCtor(e) {
  if (e.callee.kind !== "Var") throw new CodegenError("Named-field arguments are only valid when constructing a sum-type variant.");
  const ctor = e.callee.name;
  const fields = CTOR_FIELDS.get(ctor);
  if (!fields) throw new CodegenError(`Unknown constructor "${ctor}" for named-field construction.`);
  const byName = new Map(e.args.map((a) => [a.name, a.expr]));
  for (const a of e.args) if (!fields.includes(a.name)) throw new CodegenError(`Constructor ${ctor} has no field "${a.name}".`);
  const ordered = fields.map((f) => {
    if (!byName.has(f)) throw new CodegenError(`Missing field "${f}" when constructing ${ctor}.`);
    return genExpr(byName.get(f));
  });
  return `${ctor}(${ordered.join(", ")})`;
}

function genBinOp(e) {
  const l = genExpr(e.left), r = genExpr(e.right);
  switch (e.op) {
    case "and": return `(${l} && ${r})`;
    case "or": return `(${l} || ${r})`;
    case "==": return `$eq(${l}, ${r})`;
    case "/=": return `(!$eq(${l}, ${r}))`;
    case "++": return `$concat(${l}, ${r})`;
    default: return `(${l} ${e.op} ${r})`; // + - * / % < <= > >=
  }
}

function genBlock(b) {
  // `let _ = e` is a discard — emit a bare statement so it may repeat.
  const lines = b.bindings.map((bd) => (bd.name === "_" ? `${genExpr(bd.expr)};` : `const ${bd.name} = ${genExpr(bd.expr)};`));
  return `(() => { ${lines.join(" ")} return ${genExpr(b.result)}; })()`;
}

function genStr(e) {
  let s = "`";
  for (const part of e.parts) {
    if (part.kind === "str") s += part.value.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
    else s += "${" + genExpr(part.expr) + "}";
  }
  return s + "`";
}

function genMatch(m) {
  const arms = m.arms.map((arm) => {
    const { test, binds } = genPattern(arm.pattern, "$s");
    const constLines = binds.map(([name, acc]) => `const ${name} = ${acc};`).join(" ");
    const body = `return ${genExpr(arm.body)};`;
    const inner = arm.guard ? `${constLines} if (${genExpr(arm.guard)}) { ${body} }` : `${constLines} ${body}`;
    return `if (${test}) { ${inner} }`;
  });
  return `(() => { const $s = ${genExpr(m.scrutinee)}; ${arms.join(" ")} throw new Error("Non-exhaustive match (pcx)"); })()`;
}

// Returns { test: <boolean JS expr>, binds: [[name, accessExpr], ...] }.
function genPattern(pat, acc) {
  switch (pat.kind) {
    case "PWild":
      return { test: "true", binds: [] };
    case "PVar":
      return { test: "true", binds: [[pat.name, acc]] };
    case "PLit":
      return { test: `${acc} === ${typeof pat.value === "string" ? q(pat.value) : pat.value}`, binds: [] };
    case "PCtor": {
      const tests = [`${acc}.$ === ${q(pat.name)}`];
      const binds = [];
      pat.args.forEach((a, i) => {
        const sub = genPattern(a, `${acc}._${i}`);
        if (sub.test !== "true") tests.push(sub.test);
        binds.push(...sub.binds);
      });
      return { test: tests.join(" && "), binds };
    }
    case "PTuple": {
      const tests = [`Array.isArray(${acc})`, `${acc}.length === ${pat.items.length}`];
      const binds = [];
      pat.items.forEach((p, i) => {
        const sub = genPattern(p, `${acc}[${i}]`);
        if (sub.test !== "true") tests.push(sub.test);
        binds.push(...sub.binds);
      });
      return { test: tests.join(" && "), binds };
    }
    case "PList": {
      const tests = [`Array.isArray(${acc})`, pat.rest ? `${acc}.length >= ${pat.items.length}` : `${acc}.length === ${pat.items.length}`];
      const binds = [];
      pat.items.forEach((p, i) => {
        const sub = genPattern(p, `${acc}[${i}]`);
        if (sub.test !== "true") tests.push(sub.test);
        binds.push(...sub.binds);
      });
      if (pat.rest) binds.push([pat.rest, `${acc}.slice(${pat.items.length})`]);
      return { test: tests.join(" && "), binds };
    }
    case "PRecord":
      return { test: `${acc} !== null && typeof ${acc} === "object"`, binds: pat.fields.map((f) => [f, `${acc}.${f}`]) };
    default:
      throw new CodegenError(`Cannot generate pattern: ${pat.kind}`);
  }
}

function args(n) { return Array.from({ length: n }, (_, i) => `_${i}`).join(", "); }
function q(s) { return JSON.stringify(s); }
