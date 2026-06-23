// PecanX → WebAssembly backend (pcx v0.1).
//
// Emits a real .wasm binary module (no dependencies, no external assembler) for
// the pure *integer* core — exactly the kind of side-effect-free numeric code the
// language designates for the shared Kernel. A function is Wasm-eligible when its
// body uses only integer literals, parameters/locals, arithmetic & comparison
// operators, boolean `and`/`or`/`not`, `if/then/else`, `let` blocks, and calls to
// other eligible functions (so recursion works). Everything else (records, sum
// types, strings, closures, effects) stays on the JavaScript backend.

const I32 = 0x7f;
const OP = {
  "+": 0x6a, "-": 0x6b, "*": 0x6c, "/": 0x6d, "%": 0x6f,
  "==": 0x46, "/=": 0x47, "<": 0x48, "<=": 0x4c, ">": 0x4a, ">=": 0x4e,
  "and": 0x71, "or": 0x72,
};

export function compileWasm(program) {
  const allFns = new Map();
  for (const d of program.decls) if (d.kind === "Fn" && !d.isServer && !d.isParse) allFns.set(d.name, d);

  // Per-function structural analysis.
  const info = new Map();
  for (const [name, fn] of allFns) info.set(name, analyze(fn.body));

  // Fixpoint: a fn is eligible if it's structurally ok and every function it
  // calls is itself eligible.
  let cand = new Set([...allFns.keys()].filter((n) => info.get(n).ok));
  for (let changed = true; changed; ) {
    changed = false;
    for (const n of [...cand]) {
      for (const c of info.get(n).calls) {
        if (!cand.has(c)) { cand.delete(n); changed = true; break; }
      }
    }
  }

  const eligible = [...allFns.values()].filter((fn) => cand.has(fn.name));
  const skipped = [...allFns.values()].filter((fn) => !cand.has(fn.name)).map((fn) => fn.name);
  const fidx = new Map(eligible.map((fn, i) => [fn.name, i]));

  // Types, deduped by arity.
  const typeOfArity = new Map();
  const types = [];
  for (const fn of eligible) {
    const a = fn.params.length;
    if (!typeOfArity.has(a)) { typeOfArity.set(a, types.length); types.push(a); }
  }

  const typeSec = vec(types.map((a) => [0x60, ...vecBytes(Array(a).fill(I32)), ...vecBytes([I32])]));
  const funcSec = vec(eligible.map((fn) => uleb(typeOfArity.get(fn.params.length))));
  const exportSec = vec(eligible.map((fn, i) => [...name(fn.name), 0x00, ...uleb(i)]));
  const codeSec = vec(eligible.map((fn) => codeEntry(fn, fidx)));

  const bytes = Uint8Array.from([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, // \0asm, version 1
    ...section(1, typeSec),
    ...section(3, funcSec),
    ...section(7, exportSec),
    ...section(10, codeSec),
  ]);

  return { bytes, exports: eligible.map((fn) => fn.name), skipped };
}

// ---- structural analysis ----------------------------------------------------
function analyze(e) {
  switch (e.kind) {
    case "Lit": return { ok: typeof e.value === "number" && Number.isInteger(e.value), calls: new Set() };
    case "Var": return { ok: true, calls: new Set() };
    case "UnOp": { const o = analyze(e.operand); return { ok: o.ok && (e.op === "neg" || e.op === "not"), calls: o.calls }; }
    case "BinOp": {
      if (!(e.op in OP)) return bad();
      const l = analyze(e.left), r = analyze(e.right);
      return { ok: l.ok && r.ok, calls: merge(l.calls, r.calls) };
    }
    case "If": { const c = analyze(e.cond), t = analyze(e.then), el = analyze(e.else); return { ok: c.ok && t.ok && el.ok, calls: merge(c.calls, t.calls, el.calls) }; }
    case "Block": {
      let ok = true, calls = new Set();
      for (const b of e.bindings) { const a = analyze(b.expr); ok = ok && a.ok; calls = merge(calls, a.calls); }
      const res = analyze(e.result); return { ok: ok && res.ok, calls: merge(calls, res.calls) };
    }
    case "Call": {
      if (e.callee.kind !== "Var" || e.named) return bad();
      let ok = true, calls = new Set([e.callee.name]);
      for (const arg of e.args) { const a = analyze(arg); ok = ok && a.ok; calls = merge(calls, a.calls); }
      return { ok, calls };
    }
    default: return bad();
  }
}
function bad() { return { ok: false, calls: new Set() }; }
function merge(...sets) { const out = new Set(); for (const s of sets) for (const x of s) out.add(x); return out; }

// ---- function encoding ------------------------------------------------------
function codeEntry(fn, fidx) {
  const lmap = new Map();
  let idx = 0;
  for (const p of fn.params) lmap.set(p, idx++);
  for (const nm of collectLets(fn.body)) if (!lmap.has(nm)) lmap.set(nm, idx++);
  const extra = idx - fn.params.length;

  const body = [];
  encode(fn.body, lmap, fidx, body);
  const localDecl = extra > 0 ? [...uleb(1), ...uleb(extra), I32] : [0x00];
  const full = [...localDecl, ...body, 0x0b]; // 0x0b = end
  return [...uleb(full.length), ...full];
}

function collectLets(e, out = []) {
  if (!e || typeof e !== "object") return out;
  switch (e.kind) {
    case "Block": for (const b of e.bindings) { out.push(b.name); collectLets(b.expr, out); } collectLets(e.result, out); break;
    case "BinOp": collectLets(e.left, out); collectLets(e.right, out); break;
    case "UnOp": collectLets(e.operand, out); break;
    case "If": collectLets(e.cond, out); collectLets(e.then, out); collectLets(e.else, out); break;
    case "Call": for (const a of e.args) collectLets(a, out); break;
    default: break;
  }
  return out;
}

function encode(e, lmap, fidx, out) {
  switch (e.kind) {
    case "Lit": out.push(0x41, ...sleb(e.value)); break;
    case "Var": out.push(0x20, ...uleb(lmap.get(e.name))); break;
    case "UnOp":
      if (e.op === "neg") { out.push(0x41, 0x00); encode(e.operand, lmap, fidx, out); out.push(0x6b); }
      else { encode(e.operand, lmap, fidx, out); out.push(0x45); } // i32.eqz
      break;
    case "BinOp":
      encode(e.left, lmap, fidx, out); encode(e.right, lmap, fidx, out); out.push(OP[e.op]);
      break;
    case "If":
      encode(e.cond, lmap, fidx, out);
      out.push(0x04, I32);                          // if (result i32)
      encode(e.then, lmap, fidx, out);
      out.push(0x05);                               // else
      encode(e.else, lmap, fidx, out);
      out.push(0x0b);                               // end
      break;
    case "Block":
      for (const b of e.bindings) { encode(b.expr, lmap, fidx, out); out.push(0x21, ...uleb(lmap.get(b.name))); }
      encode(e.result, lmap, fidx, out);
      break;
    case "Call":
      for (const a of e.args) encode(a, lmap, fidx, out);
      out.push(0x10, ...uleb(fidx.get(e.callee.name)));
      break;
    default: throw new Error(`wasm: cannot encode ${e.kind}`);
  }
}

// ---- binary helpers ---------------------------------------------------------
function uleb(n) { const out = []; do { let b = n & 0x7f; n = Math.floor(n / 128); if (n > 0) b |= 0x80; out.push(b); } while (n > 0); return out; }
function sleb(v) {
  v |= 0; const out = [];
  for (;;) {
    let b = v & 0x7f; v >>= 7;
    if ((v === 0 && (b & 0x40) === 0) || (v === -1 && (b & 0x40) !== 0)) { out.push(b); break; }
    out.push(b | 0x80);
  }
  return out;
}
function vec(items) { const flat = []; for (const it of items) for (const b of it) flat.push(b); return [...uleb(items.length), ...flat]; }
function vecBytes(bytes) { return [...uleb(bytes.length), ...bytes]; }
function section(id, contents) { return [id, ...uleb(contents.length), ...contents]; }
function name(str) { const b = [...Buffer.from(str, "utf8")]; return [...uleb(b.length), ...b]; }
