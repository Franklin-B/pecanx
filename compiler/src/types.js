// PecanX type inference (pcx v0.3) — Hindley-Milner with unification,
// let-generalization, and an occurs check.
//
// Opt-in (`pcx check --types`). It infers and checks the functional core —
// functions (recursion via hoisted signatures), operators, literals, if, let
// (polymorphic), lambdas, application, tuples, lists, sum constructors, `match`,
// and records (resolved structurally from declared types). Unknown standard-
// library calls are *trusted* (given a fresh result type) so the checker never
// false-positives on code it can't fully model. It reports unbound variables,
// type mismatches, arity errors, and infinite types.

import { STDLIB } from "./parser.js";

let COUNTER = 0;
const tvar = () => ({ k: "var", id: ++COUNTER, ref: null });
const tcon = (name, args = []) => ({ k: "con", name, args });
const tfn = (params, ret) => ({ k: "fn", params, ret });
const trec = (fields) => ({ k: "rec", fields }); // fields: Map<string, Type>

const tInt = tcon("Int"), tFloat = tcon("Float"), tBool = tcon("Bool"),
  tStr = tcon("String"), tChar = tcon("Char"), tUnit = tcon("Unit");

export class TypeErr extends Error {}

function prune(t) { while (t.k === "var" && t.ref) t = t.ref; return t; }

function occurs(v, t) {
  t = prune(t);
  if (t === v) return true;
  if (t.k === "con") return t.args.some((a) => occurs(v, a));
  if (t.k === "fn") return t.params.some((a) => occurs(v, a)) || occurs(v, t.ret);
  if (t.k === "rec") { for (const ft of t.fields.values()) if (occurs(v, ft)) return true; }
  return false;
}

function unify(a, b) {
  a = prune(a); b = prune(b);
  if (a.k === "var") { if (a !== b) { if (occurs(a, b)) throw new TypeErr(`infinite type`); a.ref = b; } return; }
  if (b.k === "var") return unify(b, a);
  if (a.k === "con" && b.k === "con") {
    if (a.name !== b.name || a.args.length !== b.args.length) throw new TypeErr(`cannot unify ${show(a)} with ${show(b)}`);
    for (let i = 0; i < a.args.length; i++) unify(a.args[i], b.args[i]);
    return;
  }
  if (a.k === "fn" && b.k === "fn") {
    if (a.params.length !== b.params.length) throw new TypeErr(`function arity mismatch: ${show(a)} vs ${show(b)}`);
    for (let i = 0; i < a.params.length; i++) unify(a.params[i], b.params[i]);
    unify(a.ret, b.ret); return;
  }
  if (a.k === "rec" && b.k === "rec") {
    for (const [f, ft] of a.fields) {
      if (!b.fields.has(f)) throw new TypeErr(`record is missing field "${f}"`);
      unify(ft, b.fields.get(f));
    }
    for (const f of b.fields.keys()) if (!a.fields.has(f)) throw new TypeErr(`record has unexpected field "${f}"`);
    return;
  }
  throw new TypeErr(`cannot unify ${show(a)} with ${show(b)}`);
}

function show(t) {
  t = prune(t);
  if (t.k === "var") return "_" + t.id;
  if (t.k === "fn") return `(${t.params.map(show).join(", ")}) -> ${show(t.ret)}`;
  if (t.k === "rec") return `{ ${[...t.fields].map(([f, ft]) => `${f}: ${show(ft)}`).join(", ")} }`;
  return t.args.length ? `${t.name}<${t.args.map(show).join(", ")}>` : t.name;
}

// ---- schemes (∀ vars. type) -------------------------------------------------
function freeVars(t, acc) { t = prune(t); if (t.k === "var") acc.add(t.id); else if (t.k === "con") t.args.forEach((a) => freeVars(a, acc)); else if (t.k === "fn") { t.params.forEach((a) => freeVars(a, acc)); freeVars(t.ret, acc); } else if (t.k === "rec") for (const ft of t.fields.values()) freeVars(ft, acc); return acc; }
function envFree(env) { const acc = new Set(); for (const sch of env.values()) { const inner = freeVars(sch.type, new Set()); for (const id of inner) if (!sch.vars.includes(id)) acc.add(id); } return acc; }
function generalize(env, t) { const free = freeVars(t, new Set()); const bound = envFree(env); return { vars: [...free].filter((id) => !bound.has(id)), type: t }; }
function instantiate(sch) { const m = new Map(); for (const id of sch.vars) m.set(id, tvar()); return subst(sch.type, m); }
function subst(t, m) { t = prune(t); if (t.k === "var") return m.has(t.id) ? m.get(t.id) : t; if (t.k === "con") return tcon(t.name, t.args.map((a) => subst(a, m))); if (t.k === "fn") return tfn(t.params.map((a) => subst(a, m)), subst(t.ret, m)); if (t.k === "rec") { const f = new Map(); for (const [k, v] of t.fields) f.set(k, subst(v, m)); return trec(f); } return t; }
const mono = (t) => ({ vars: [], type: t });

// ---- main entry -------------------------------------------------------------
export function inferTypes(program) {
  COUNTER = 0;
  const diags = [];
  const ctx = buildContext(program);
  const env = new Map();

  // built-in & user constructor schemes
  for (const [name, sch] of ctx.ctors) env.set(name, sch);

  // imported names are trusted (whole-program / cross-module inference is a
  // later milestone; here each module is checked independently).
  for (const d of program.decls) {
    if (d.kind !== "Import") continue;
    if (d.exposing) for (const nm of d.exposing) env.set(nm, mono(tvar()));
    if (d.alias) env.set(d.alias, mono(tvar()));
    if (!d.exposing && !d.alias) env.set(d.name.split(".").pop(), mono(tvar()));
  }

  // hoist top-level fn signatures (enables recursion & forward references)
  for (const d of program.decls) {
    if (d.kind === "Fn") env.set(d.name, sigScheme(d, ctx));
    else if (d.kind === "Let") env.set(d.name, mono(tvar()));
    // opaque/sum constructors are already in env via ctx.ctors above
  }

  for (const d of program.decls) {
    try {
      if (d.kind === "Fn") inferFn(d, env, ctx);
      else if (d.kind === "Let") { const t = infer(d.expr, env, ctx); unify(t, instantiate(env.get(d.name))); if (d.type) unify(t, fromAnn(d.type, new Map(), ctx)); }
    } catch (e) {
      if (e instanceof TypeErr) diags.push({ severity: "error", code: "PX0200", message: `in ${declName(d)}: ${e.message}` });
      else throw e;
    }
  }
  return diags;
}

function declName(d) { return d.kind === "Fn" ? `${d.name}` : d.kind === "Let" ? `let ${d.name}` : d.kind; }

// Whole-program inference across a linked set of modules. Imported names resolve
// to the *exporting* module's actual types, so cross-module type errors are
// caught. Module qualifiers (`import M as Q` or plain `import M`) bind `Q` to a
// record of M's exports, so `Q.member` type-checks.
export function inferTypesLinked(modules) {
  COUNTER = 0;
  const diags = [];
  const ctx = buildContext({ decls: modules.flatMap((m) => m.program.decls) });
  const env = new Map();
  for (const [n, s] of ctx.ctors) env.set(n, s);

  // hoist every module's fn signatures and top-level lets
  for (const m of modules) for (const d of m.program.decls) {
    if (d.kind === "Fn") env.set(d.name, sigScheme(d, ctx));
    else if (d.kind === "Let") env.set(d.name, mono(tvar()));
  }

  // per-module export tables (for qualified `Alias.member` access)
  const exportsOf = new Map();
  for (const m of modules) {
    const tbl = new Map();
    for (const d of m.program.decls) {
      if (d.kind === "Fn") tbl.set(d.name, env.get(d.name));
      else if (d.kind === "TypeSum") for (const v of d.variants) tbl.set(v.name, ctx.ctors.get(v.name));
      else if (d.kind === "Opaque") tbl.set(d.name, ctx.ctors.get(d.name));
      else if (d.kind === "Let") tbl.set(d.name, env.get(d.name));
    }
    exportsOf.set(m.name, tbl);
  }

  for (const m of modules) for (const d of m.program.decls) {
    if (d.kind !== "Import") continue;
    const exp = exportsOf.get(d.name);
    const qualifier = d.alias || (!d.exposing ? d.name.split(".").pop() : null);
    if (qualifier) {
      if (exp) { const f = new Map(); for (const [k, sch] of exp) f.set(k, instantiate(sch)); env.set(qualifier, mono(trec(f))); }
      else env.set(qualifier, mono(tvar())); // external module → trusted
    }
    if (!exp && d.exposing) for (const nm of d.exposing) if (!env.has(nm)) env.set(nm, mono(tvar()));
  }

  for (const m of modules) for (const d of m.program.decls) {
    try {
      if (d.kind === "Fn") inferFn(d, env, ctx);
      else if (d.kind === "Let") { const t = infer(d.expr, env, ctx); unify(t, instantiate(env.get(d.name))); if (d.type) unify(t, fromAnn(d.type, new Map(), ctx)); }
    } catch (e) {
      if (e instanceof TypeErr) diags.push({ severity: "error", code: "PX0200", file: m.file, message: `${m.name}.${declName(d)}: ${e.message}` });
      else throw e;
    }
  }
  return diags;
}

function inferFn(fn, env, ctx) {
  const scope = new Map();
  const local = new Map(env);
  const paramTs = fn.params.map((p, i) => {
    const t = fn.paramTypes && fn.paramTypes[i] ? fromAnn(fn.paramTypes[i], scope, ctx) : tvar();
    local.set(p, mono(t));
    return t;
  });
  const bodyT = infer(fn.body, local, ctx);
  if (fn.retType) unify(bodyT, fromAnn(fn.retType, scope, ctx));
}

function sigScheme(fn, ctx) {
  const scope = new Map();
  const params = (fn.params || []).map((_, i) => (fn.paramTypes && fn.paramTypes[i] ? fromAnn(fn.paramTypes[i], scope, ctx) : tvar()));
  const ret = fn.retType ? fromAnn(fn.retType, scope, ctx) : tvar();
  const t = tfn(params, ret);
  return generalize(new Map(), t);
}

// ---- expression inference ---------------------------------------------------
function infer(e, env, ctx) {
  switch (e.kind) {
    case "Lit": return typeof e.value === "boolean" ? tBool : (e.float ? tFloat : tInt);
    case "StrInterp":
      for (const p of e.parts) if (p.kind === "expr") unify(infer(p.expr, env, ctx), tStr);
      return tStr;
    case "Var": {
      if (e.name === "unit") return tUnit;
      const sch = env.get(e.name);
      if (!sch) throw new TypeErr(`unbound variable "${e.name}"`);
      return instantiate(sch);
    }
    case "Field": {
      // stdlib module access or opaque accessor → trusted fresh function/value
      if (e.obj.kind === "Var" && (STDLIB.has(e.obj.name) || ctx.opaques.has(e.obj.name))) return tvar();
      const ot = prune(infer(e.obj, env, ctx));
      if (ot.k === "rec") { if (ot.fields.has(e.name)) return ot.fields.get(e.name); throw new TypeErr(`no field "${e.name}" on record ${show(ot)}`); }
      return tvar(); // unknown shape → trust
    }
    case "Call": {
      const ft = infer(e.callee, env, ctx);
      if (e.named) { // named-field constructor: infer args, return ctor result
        for (const a of e.args) infer(a.expr, env, ctx);
        const r = prune(ft);
        return r.k === "fn" ? r.ret : tvar();
      }
      const ats = e.args.map((a) => infer(a, env, ctx));
      const res = tvar();
      unify(ft, tfn(ats, res));
      return res;
    }
    case "Lambda": {
      const local = new Map(env);
      const scope = new Map();
      const ps = e.params.map((p, i) => { const t = e.paramTypes && e.paramTypes[i] ? fromAnn(e.paramTypes[i], scope, ctx) : tvar(); local.set(p, mono(t)); return t; });
      return tfn(ps, infer(e.body, local, ctx));
    }
    case "If": {
      unify(infer(e.cond, env, ctx), tBool);
      const t = infer(e.then, env, ctx);
      unify(t, infer(e.else, env, ctx));
      return t;
    }
    case "Block": {
      const local = new Map(env);
      for (const b of e.bindings) {
        const t = infer(b.expr, local, ctx);
        if (b.type) unify(t, fromAnn(b.type, new Map(), ctx));
        local.set(b.name, b.bang ? mono(t) : generalize(local, t));
      }
      return infer(e.result, local, ctx);
    }
    case "Match": {
      const st = infer(e.scrutinee, env, ctx);
      let res = tvar(), first = true;
      for (const arm of e.arms) {
        const local = new Map(env);
        bindPattern(arm.pattern, st, local, ctx);
        if (arm.guard) unify(infer(arm.guard, local, ctx), tBool);
        const bt = infer(arm.body, local, ctx);
        if (first) { res = bt; first = false; } else unify(res, bt);
      }
      return res;
    }
    case "BinOp": return inferBinOp(e, env, ctx);
    case "UnOp": {
      const o = infer(e.operand, env, ctx);
      if (e.op === "not") { unify(o, tBool); return tBool; }
      return o; // neg: numeric, returns same type
    }
    case "Record": {
      const f = new Map();
      for (const fl of e.fields) f.set(fl.name, infer(fl.expr, env, ctx));
      return trec(f);
    }
    case "RecordUpdate": { const base = infer(e.base, env, ctx); for (const fl of e.fields) infer(fl.expr, env, ctx); return base; }
    case "Tuple": return tcon("Tuple", e.items.map((it) => infer(it, env, ctx)));
    case "List": {
      const el = tvar();
      for (const it of e.items) {
        if (it.kind === "Spread") unify(tcon("List", [el]), infer(it.expr, env, ctx));
        else unify(el, infer(it, env, ctx));
      }
      return tcon("List", [el]);
    }
    case "Spread": return infer(e.expr, env, ctx);
    case "Pipe": { const l = infer(e.left, env, ctx); const f = infer(e.right, env, ctx); const res = tvar(); unify(f, tfn([l], res)); return res; }
    case "Try": return tvar();
    default: return tvar();
  }
}

function elemOf(t) { t = prune(t); return t.k === "con" && t.name === "List" ? t.args[0] : tvar(); }

function inferBinOp(e, env, ctx) {
  const l = infer(e.left, env, ctx), r = infer(e.right, env, ctx);
  switch (e.op) {
    case "and": case "or": unify(l, tBool); unify(r, tBool); return tBool;
    case "==": case "/=": case "<": case "<=": case ">": case ">=": unify(l, r); return tBool;
    case "++": unify(l, r); return l; // String or List
    default: unify(l, r); return l; // + - * / % : numeric, operands same type
  }
}

// ---- pattern binding --------------------------------------------------------
function bindPattern(pat, expected, env, ctx) {
  switch (pat.kind) {
    case "PWild": return;
    case "PVar": env.set(pat.name, mono(expected)); return;
    case "PLit": unify(expected, typeof pat.value === "boolean" ? tBool : typeof pat.value === "string" ? tStr : tInt); return;
    case "PTuple": { const ts = pat.items.map(() => tvar()); unify(expected, tcon("Tuple", ts)); pat.items.forEach((p, i) => bindPattern(p, ts[i], env, ctx)); return; }
    case "PList": { const el = tvar(); unify(expected, tcon("List", [el])); for (const p of pat.items) bindPattern(p, el, env, ctx); if (pat.rest) env.set(pat.rest, mono(tcon("List", [el]))); return; }
    case "PRecord": { for (const f of pat.fields) env.set(f, mono(tvar())); return; }
    case "PCtor": {
      const sch = ctx.ctors.get(pat.name) || env.get(pat.name);
      if (!sch) { for (const a of pat.args) bindPattern(a, tvar(), env, ctx); return; } // unknown ctor → trust
      const it = instantiate(sch);
      if (it.k === "fn") { unify(expected, it.ret); pat.args.forEach((a, i) => bindPattern(a, it.params[i] || tvar(), env, ctx)); }
      else { unify(expected, it); } // nullary
      return;
    }
    default: return;
  }
}

// ---- declared-type context --------------------------------------------------
function buildContext(program) {
  const records = new Map();  // name -> { params, fields:[{name,type}] }
  const aliases = new Map();  // name -> { params, type }
  const sums = new Set();
  const opaques = new Set();
  const ctors = new Map();    // name -> scheme

  for (const d of program.decls) {
    if (d.kind === "TypeRecord") records.set(d.name, { params: d.params || [], fields: d.fields });
    else if (d.kind === "TypeAlias") aliases.set(d.name, { params: d.params || [], type: d.type });
    else if (d.kind === "TypeSum") sums.add(d.name);
    else if (d.kind === "Opaque") opaques.add(d.name);
  }
  const ctx = { records, aliases, sums, opaques, ctors };

  // built-in constructor schemes
  seedBuiltins(ctx);

  // user sum-type constructors
  for (const d of program.decls) {
    if (d.kind !== "TypeSum") continue;
    const scope = new Map();
    const args = (d.params || []).map((p) => { const v = tvar(); scope.set(p, v); return v; });
    const result = tcon(d.name, args);
    for (const v of d.variants) {
      const fieldTs = (v.fieldTypes || []).map((ft) => fromAnn(ft, scope, ctx));
      const t = fieldTs.length ? tfn(fieldTs, result) : result;
      ctors.set(v.name, generalize(new Map(), t));
    }
  }
  // opaque constructors: underlying hidden → ∀a. a -> Opaque
  for (const name of opaques) { const a = tvar(); ctors.set(name, generalize(new Map(), tfn([a], tcon(name)))); }
  return ctx;
}

function seedBuiltins(ctx) {
  const sch = (mk) => { const v1 = tvar(), v2 = tvar(); return generalize(new Map(), mk(v1, v2)); };
  ctx.ctors.set("Some", sch((a) => tfn([a], tcon("Option", [a]))));
  ctx.ctors.set("None", sch((a) => tcon("Option", [a])));
  ctx.ctors.set("Ok", sch((a, e) => tfn([a], tcon("Result", [e, a]))));
  ctx.ctors.set("Err", sch((a, e) => tfn([e], tcon("Result", [e, a]))));
  ctx.ctors.set("NotAsked", sch((a, e) => tcon("Remote", [e, a])));
  ctx.ctors.set("Loading", sch((a, e) => tcon("Remote", [e, a])));
  ctx.ctors.set("Failure", sch((a, e) => tfn([e], tcon("Remote", [e, a]))));
  ctx.ctors.set("Success", sch((a, e) => tfn([a], tcon("Remote", [e, a]))));
}

// ---- type annotation → Type -------------------------------------------------
const BUILTIN_CONS = new Set(["Int", "Float", "Bool", "String", "Char", "Unit", "List", "Option", "Result", "Dict", "Set", "Html", "Cmd", "Remote"]);

function fromAnn(ann, scope, ctx, seen = new Set()) {
  if (!ann) return tvar();
  if (ann.t === "fn") return tfn(ann.params.map((p) => fromAnn(p, scope, ctx, seen)), fromAnn(ann.ret, scope, ctx, seen));
  if (ann.t === "tuple") return tcon("Tuple", ann.items.map((i) => fromAnn(i, scope, ctx, seen)));
  if (ann.t === "record") { const f = new Map(); for (const fl of ann.fields) f.set(fl.name, fromAnn(fl.type, scope, ctx, seen)); return trec(f); }
  // name
  const { name, args } = ann;
  if (isLower(name)) { if (!scope.has(name)) scope.set(name, tvar()); return scope.get(name); }
  if (BUILTIN_CONS.has(name)) return tcon(name, (args || []).map((a) => fromAnn(a, scope, ctx, seen)));
  // declared record → expand structurally (so record literals unify with it)
  if (ctx.records.has(name) && !seen.has(name)) {
    const rec = ctx.records.get(name);
    const local = new Map(scope);
    rec.params.forEach((p, i) => local.set(p, args && args[i] ? fromAnn(args[i], scope, ctx, seen) : tvar()));
    const f = new Map();
    const seen2 = new Set(seen); seen2.add(name);
    for (const fl of rec.fields) f.set(fl.name, fromAnn(fl.type, local, ctx, seen2));
    return trec(f);
  }
  // declared alias → expand
  if (ctx.aliases.has(name) && !seen.has(name)) {
    const al = ctx.aliases.get(name);
    const local = new Map(scope);
    al.params.forEach((p, i) => local.set(p, args && args[i] ? fromAnn(args[i], scope, ctx, seen) : tvar()));
    const seen2 = new Set(seen); seen2.add(name);
    return fromAnn(al.type, local, ctx, seen2);
  }
  // sum / opaque / unknown nominal type
  return tcon(name, (args || []).map((a) => fromAnn(a, scope, ctx, seen)));
}

function isLower(s) { return s && s[0] >= "a" && s[0] <= "z"; }
