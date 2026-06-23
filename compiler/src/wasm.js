// PecanX → WebAssembly backend (pcx v0.2).
//
// A type-directed emitter producing a real .wasm binary (no dependencies, no
// external assembler). It covers the pure core over `Int` (i32), `Float` (f64),
// `Bool` (i32), and **records** — compiled to WasmGC structs (`struct.new` /
// `struct.get`). A function is Wasm-eligible when its parameter/return types and
// whole body map onto those Wasm types and it only calls other eligible
// functions. Sum types, strings, lists, and closures stay on the JS backend
// (they need tagged-struct subtyping, array<i8>, and closure conversion).

export function compileWasm(program) {
  // declared record types -> field list with wasm types (or null if unsupported)
  const records = new Map();
  for (const d of program.decls) {
    if (d.kind !== "TypeRecord") continue;
    const fields = d.fields.map((f) => ({ name: f.name, wt: typeToW(f.type, null) }));
    if (fields.every((f) => f.wt)) records.set(d.name, { fields });
  }
  // resolve record field wts that reference other records (now that names known)
  for (const [, rec] of records) rec.fields = rec.fields.map((f) => ({ name: f.name, wt: f.wt }));
  const recCtx = { records };

  // function signatures whose param/return types all map to wasm types
  const fnSig = new Map();
  for (const d of program.decls) {
    if (d.kind !== "Fn" || d.isServer || d.isParse) continue;
    const paramWts = (d.params || []).map((_, i) => typeToW(d.paramTypes && d.paramTypes[i], recCtx));
    const retWt = typeToW(d.retType, recCtx);
    if (paramWts.every(Boolean) && retWt) fnSig.set(d.name, { decl: d, paramWts, retWt });
  }

  // eligibility: body fully analyzable + calls only eligible fns (fixpoint)
  let cand = new Set();
  for (const [name, sig] of fnSig) {
    const locals = new Map();
    sig.decl.params.forEach((p, i) => locals.set(p, { wt: sig.paramWts[i] }));
    const a = analyze(sig.decl.body, locals, fnSig, recCtx);
    if (a.wt && wtEq(a.wt, sig.retWt)) cand.add(name);
  }
  for (let changed = true; changed; ) {
    changed = false;
    for (const name of [...cand]) {
      const sig = fnSig.get(name);
      const locals = new Map();
      sig.decl.params.forEach((p, i) => locals.set(p, { wt: sig.paramWts[i] }));
      for (const c of analyze(sig.decl.body, locals, fnSig, recCtx).calls) if (!cand.has(c)) { cand.delete(name); changed = true; break; }
    }
  }

  const eligible = [...fnSig.values()].filter((s) => cand.has(s.decl.name)).map((s) => s.decl);
  const skipped = program.decls.filter((d) => d.kind === "Fn" && !d.isServer && !d.isParse && !cand.has(d.name)).map((d) => d.name);
  const fidx = new Map(eligible.map((fn, i) => [fn.name, i]));

  // assign struct type indices to every supported record (structs come first)
  const recordIndex = new Map([...records.keys()].map((n, i) => [n, i]));
  const structCount = records.size;

  // type section: struct types, then deduped functypes
  const structEntries = [...records].map(([, rec]) => [0x5f, ...vec(rec.fields.map((f) => [...wtBytes(f.wt, recordIndex), 0x00]))]);
  const fnTypeKey = (sig) => JSON.stringify([sig.paramWts.map((w) => wtKey(w)), wtKey(sig.retWt)]);
  const fnTypeOf = new Map();
  const fnTypeEntries = [];
  for (const fn of eligible) {
    const sig = fnSig.get(fn.name);
    const key = fnTypeKey(sig);
    if (!fnTypeOf.has(key)) {
      fnTypeOf.set(key, structCount + fnTypeEntries.length);
      fnTypeEntries.push([0x60, ...vec(sig.paramWts.map((w) => wtBytes(w, recordIndex))), ...vec([wtBytes(sig.retWt, recordIndex)])]);
    }
  }
  const typeSec = vec([...structEntries, ...fnTypeEntries]);
  const funcSec = vec(eligible.map((fn) => uleb(fnTypeOf.get(fnTypeKey(fnSig.get(fn.name))))));
  const exportSec = vec(eligible.map((fn, i) => [...name(fn.name), 0x00, ...uleb(i)]));
  const codeSec = vec(eligible.map((fn) => codeEntry(fn, { fidx, fnSig, recCtx, recordIndex })));

  const bytes = Uint8Array.from([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ...section(1, typeSec),
    ...section(3, funcSec),
    ...section(7, exportSec),
    ...section(10, codeSec),
  ]);
  return { bytes, exports: eligible.map((fn) => fn.name), skipped };
}

// ---- wasm types -------------------------------------------------------------
// A wasm type is "i32", "f64", or { ref: recordName }.
function typeToW(ann, recCtx) {
  if (!ann || ann.t !== "name") return ann && ann.t === "record" ? null : null;
  const n = ann.name;
  if (n === "Int" || n === "Bool") return "i32";
  if (n === "Float") return "f64";
  if (recCtx && recCtx.records.has(n)) return { ref: n };
  if (!recCtx) return null; // first pass (record fields): only scalars resolvable
  return null;
}
function wtEq(a, b) { if (typeof a === "string" || typeof b === "string") return a === b; return a && b && a.ref === b.ref; }
function wtKey(w) { return typeof w === "string" ? w : "ref:" + w.ref; }
function wtBytes(w, recordIndex) {
  if (w === "i32") return [0x7f];
  if (w === "f64") return [0x7c];
  return [0x64, ...sleb(recordIndex.get(w.ref))]; // (ref $struct)
}

// ---- analysis (eligibility + wasm types) ------------------------------------
function analyze(e, locals, fnSig, recCtx) {
  const bad = { wt: null, calls: new Set() };
  switch (e.kind) {
    case "Lit": return { wt: typeof e.value === "boolean" ? "i32" : (e.float ? "f64" : "i32"), calls: new Set() };
    case "Var": { const l = locals.get(e.name); return l ? { wt: l.wt, calls: new Set() } : bad; }
    case "UnOp": { const a = analyze(e.operand, locals, fnSig, recCtx); if (!a.wt) return bad; if (e.op === "not") return a.wt === "i32" ? { wt: "i32", calls: a.calls } : bad; return { wt: a.wt, calls: a.calls }; }
    case "BinOp": {
      const l = analyze(e.left, locals, fnSig, recCtx), r = analyze(e.right, locals, fnSig, recCtx);
      if (!l.wt || !r.wt) return bad;
      const calls = union(l.calls, r.calls);
      if (e.op === "and" || e.op === "or") return l.wt === "i32" && r.wt === "i32" ? { wt: "i32", calls } : bad;
      if (["==", "/=", "<", "<=", ">", ">="].includes(e.op)) return l.wt === r.wt && l.wt !== undefined && typeof l.wt === "string" ? { wt: "i32", calls } : bad;
      if (e.op === "%") return l.wt === "i32" && r.wt === "i32" ? { wt: "i32", calls } : bad;
      if (["+", "-", "*", "/"].includes(e.op)) return l.wt === r.wt && (l.wt === "i32" || l.wt === "f64") ? { wt: l.wt, calls } : bad;
      return bad; // ++
    }
    case "If": { const c = analyze(e.cond, locals, fnSig, recCtx), t = analyze(e.then, locals, fnSig, recCtx), el = analyze(e.else, locals, fnSig, recCtx); if (c.wt !== "i32" || !t.wt || !el.wt || !wtEq(t.wt, el.wt)) return bad; return { wt: t.wt, calls: union(c.calls, t.calls, el.calls) }; }
    case "Block": {
      const local = new Map(locals); let calls = new Set();
      for (const b of e.bindings) { const a = analyze(b.expr, local, fnSig, recCtx); if (!a.wt) return bad; local.set(b.name, { wt: a.wt }); calls = union(calls, a.calls); }
      const res = analyze(e.result, local, fnSig, recCtx); if (!res.wt) return bad; return { wt: res.wt, calls: union(calls, res.calls) };
    }
    case "Call": {
      if (e.callee.kind !== "Var" || e.named || !fnSig.has(e.callee.name)) return bad;
      let calls = new Set([e.callee.name]);
      for (const a of e.args) { const r = analyze(a, locals, fnSig, recCtx); if (!r.wt) return bad; calls = union(calls, r.calls); }
      return { wt: fnSig.get(e.callee.name).retWt, calls };
    }
    case "Record": {
      const rec = matchRecord(e.fields.map((f) => f.name), recCtx); if (!rec) return bad;
      let calls = new Set();
      for (const f of e.fields) { const a = analyze(f.expr, locals, fnSig, recCtx); if (!a.wt) return bad; calls = union(calls, a.calls); }
      return { wt: { ref: rec }, calls };
    }
    case "Field": {
      const o = analyze(e.obj, locals, fnSig, recCtx); if (!o.wt || typeof o.wt === "string") return bad;
      const rec = recCtx.records.get(o.wt.ref); const f = rec && rec.fields.find((x) => x.name === e.name);
      return f ? { wt: f.wt, calls: o.calls } : bad;
    }
    default: return bad;
  }
}
function matchRecord(fieldNames, recCtx) {
  const set = [...fieldNames].sort().join(",");
  for (const [n, rec] of recCtx.records) if (rec.fields.map((f) => f.name).sort().join(",") === set) return n;
  return null;
}
function union(...sets) { const out = new Set(); for (const s of sets) for (const x of s) out.add(x); return out; }

// ---- encoding ---------------------------------------------------------------
function codeEntry(fn, ctx) {
  const sig = ctx.fnSig.get(fn.name);
  const locals = new Map();
  let idx = 0;
  fn.params.forEach((p, i) => locals.set(p, { index: idx++, wt: sig.paramWts[i] }));
  const localDecls = [];
  assignLocals(fn.body, locals, () => idx++, localDecls, ctx);

  const body = [];
  enc(fn.body, { ...ctx, locals }, body);
  const localsVec = vec(localDecls.map((wt) => [...uleb(1), ...wtBytes(wt, ctx.recordIndex)]));
  const full = [...localsVec, ...body, 0x0b];
  return [...uleb(full.length), ...full];
}

function assignLocals(e, locals, next, decls, ctx) {
  if (!e || typeof e !== "object") return;
  if (e.kind === "Block") {
    for (const b of e.bindings) {
      const wt = analyze(b.expr, locals, ctx.fnSig, ctx.recCtx).wt;
      assignLocals(b.expr, locals, next, decls, ctx);
      locals.set(b.name, { index: next(), wt });
      decls.push(wt);
    }
    assignLocals(e.result, locals, next, decls, ctx);
    return;
  }
  for (const k of ["left", "right", "operand", "cond", "then", "else", "callee", "obj", "base", "result", "scrutinee"]) if (e[k]) assignLocals(e[k], locals, next, decls, ctx);
  if (e.args) for (const a of e.args) assignLocals(a.expr || a, locals, next, decls, ctx);
  if (e.fields) for (const f of e.fields) assignLocals(f.expr, locals, next, decls, ctx);
}

function enc(e, ctx, out) {
  switch (e.kind) {
    case "Lit": {
      if (typeof e.value === "boolean") { out.push(0x41, ...sleb(e.value ? 1 : 0)); return "i32"; }
      if (e.float) { out.push(0x44, ...f64bytes(e.value)); return "f64"; }
      out.push(0x41, ...sleb(e.value)); return "i32";
    }
    case "Var": { const l = ctx.locals.get(e.name); out.push(0x20, ...uleb(l.index)); return l.wt; }
    case "UnOp": {
      if (e.op === "neg") { const w = analyze(e.operand, ctx.locals, ctx.fnSig, ctx.recCtx).wt; if (w === "f64") { enc(e.operand, ctx, out); out.push(0x9a); return "f64"; } out.push(0x41, 0x00); enc(e.operand, ctx, out); out.push(0x6b); return "i32"; }
      enc(e.operand, ctx, out); out.push(0x45); return "i32"; // not -> i32.eqz
    }
    case "BinOp": {
      const lw = enc(e.left, ctx, out); enc(e.right, ctx, out);
      out.push(...binOp(e.op, lw));
      return ["and", "or", "==", "/=", "<", "<=", ">", ">="].includes(e.op) ? "i32" : lw;
    }
    case "If": {
      const tw = analyze(e.then, ctx.locals, ctx.fnSig, ctx.recCtx).wt;
      enc(e.cond, ctx, out);
      out.push(0x04, ...wtBytes(tw, ctx.recordIndex));
      enc(e.then, ctx, out); out.push(0x05); enc(e.else, ctx, out); out.push(0x0b);
      return tw;
    }
    case "Block": {
      for (const b of e.bindings) { enc(b.expr, ctx, out); out.push(0x21, ...uleb(ctx.locals.get(b.name).index)); }
      return enc(e.result, ctx, out);
    }
    case "Call": { for (const a of e.args) enc(a, ctx, out); out.push(0x10, ...uleb(ctx.fidx.get(e.callee.name))); return ctx.fnSig.get(e.callee.name).retWt; }
    case "Record": {
      const rec = matchRecord(e.fields.map((f) => f.name), ctx.recCtx);
      const order = ctx.recCtx.records.get(rec).fields;
      for (const fld of order) { const lit = e.fields.find((f) => f.name === fld.name); enc(lit.expr, ctx, out); }
      out.push(0xfb, 0x00, ...uleb(ctx.recordIndex.get(rec))); // struct.new
      return { ref: rec };
    }
    case "Field": {
      const ow = enc(e.obj, ctx, out);
      const rec = ctx.recCtx.records.get(ow.ref);
      const fi = rec.fields.findIndex((f) => f.name === e.name);
      out.push(0xfb, 0x02, ...uleb(ctx.recordIndex.get(ow.ref)), ...uleb(fi)); // struct.get
      return rec.fields[fi].wt;
    }
    default: throw new Error(`wasm: cannot encode ${e.kind}`);
  }
}

function binOp(op, wt) {
  const I = { "+": 0x6a, "-": 0x6b, "*": 0x6c, "/": 0x6d, "%": 0x6f, "==": 0x46, "/=": 0x47, "<": 0x48, "<=": 0x4c, ">": 0x4a, ">=": 0x4e, "and": 0x71, "or": 0x72 };
  const F = { "+": 0xa0, "-": 0xa1, "*": 0xa2, "/": 0xa3, "==": 0x61, "/=": 0x62, "<": 0x63, "<=": 0x65, ">": 0x64, ">=": 0x66 };
  return [(wt === "f64" ? F : I)[op]];
}

// ---- binary helpers ---------------------------------------------------------
function uleb(n) { const out = []; do { let b = n & 0x7f; n = Math.floor(n / 128); if (n > 0) b |= 0x80; out.push(b); } while (n > 0); return out; }
function sleb(v) { v |= 0; const out = []; for (;;) { let b = v & 0x7f; v >>= 7; if ((v === 0 && (b & 0x40) === 0) || (v === -1 && (b & 0x40) !== 0)) { out.push(b); break; } out.push(b | 0x80); } return out; }
function f64bytes(x) { const buf = new ArrayBuffer(8); new DataView(buf).setFloat64(0, x, true); return [...new Uint8Array(buf)]; }
function vec(items) { const flat = []; for (const it of items) for (const b of it) flat.push(b); return [...uleb(items.length), ...flat]; }
function section(id, contents) { return [id, ...uleb(contents.length), ...contents]; }
function name(str) { const b = [...Buffer.from(str, "utf8")]; return [...uleb(b.length), ...b]; }
