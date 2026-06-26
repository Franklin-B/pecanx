// PecanX static checks (pcx v0.4).
//
// This is the language's signature check — `match` exhaustiveness — plus a guard
// that the `?` operator only appears inside a function/lambda body (PX0101).
// Whole-program Hindley-Milner type inference lives separately in types.js
// (`--types`). This checker is deliberately conservative: it only reports a
// non-exhaustive match when it can identify the scrutinee's sum type from the
// constructors used, so it never emits a false positive.

const BUILTIN_TYPES = {
  Result: ["Ok", "Err"],
  Option: ["Some", "None"],
  Remote: ["NotAsked", "Loading", "Failure", "Success"],
  Bool: ["true", "false"],
};

export function check(program) {
  const diags = [];
  const ctorToType = new Map();   // ctorName -> typeName
  const typeCtors = new Map();    // typeName -> Set(ctorName)

  const register = (typeName, ctors) => {
    typeCtors.set(typeName, new Set(ctors));
    for (const c of ctors) ctorToType.set(c, typeName);
  };
  for (const [t, cs] of Object.entries(BUILTIN_TYPES)) register(t, cs);
  for (const d of program.decls) {
    if (d.kind === "TypeSum") register(d.name, d.variants.map((v) => v.name));
  }

  for (const d of program.decls) {
    if (d.kind === "Fn") walk(d.body, true);    // a fn body may early-return via `?`
    else if (d.kind === "Let") walk(d.expr, false); // top-level let: only inside a lambda
  }
  return diags;

  function checkMatch(m) {
    // A top-level wildcard or variable pattern is a catch-all → always exhaustive.
    const hasCatchAll = m.arms.some((a) => a.pattern.kind === "PWild" || (a.pattern.kind === "PVar"));
    if (hasCatchAll) return;

    // Only analyze when every arm is a constructor pattern.
    if (!m.arms.every((a) => a.pattern.kind === "PCtor")) return;

    const names = m.arms.map((a) => a.pattern.name);
    const types = new Set(names.map((n) => ctorToType.get(n)).filter(Boolean));
    if (types.size !== 1) return; // unknown or mixed → can't decide, stay silent

    const typeName = [...types][0];
    const all = typeCtors.get(typeName);
    const covered = new Set(names);
    const missing = [...all].filter((c) => !covered.has(c));
    if (missing.length > 0) {
      diags.push({
        severity: "error",
        code: "PX0001",
        message: `Non-exhaustive match on ${typeName}: missing case${missing.length > 1 ? "s" : ""} ${missing.join(", ")}`,
        line: m.line, col: m.col,
      });
    }
  }

  // `canTry` is true wherever a `?` would have an enclosing function/lambda to
  // early-return from. It flips on at every lambda body and every fn body.
  function walk(e, canTry) {
    if (!e || typeof e !== "object") return;
    switch (e.kind) {
      case "Match":
        checkMatch(e);
        walk(e.scrutinee, canTry);
        for (const a of e.arms) { if (a.guard) walk(a.guard, canTry); walk(a.body, canTry); }
        return;
      case "Try":
        if (!canTry) diags.push({ severity: "error", code: "PX0101", message: "The `?` operator may only be used inside a function or lambda body.", line: e.line, col: e.col });
        walk(e.expr, canTry); return;
      case "StrInterp":
        for (const p of e.parts) if (p.kind === "expr") walk(p.expr, canTry);
        return;
      case "Field": walk(e.obj, canTry); return;
      case "Call": walk(e.callee, canTry); (e.named ? e.args.map((a) => a.expr) : e.args).forEach((x) => walk(x, canTry)); return;
      case "Lambda": walk(e.body, true); return; // a lambda body may early-return via `?`
      case "If": walk(e.cond, canTry); walk(e.then, canTry); walk(e.else, canTry); return;
      case "Block": e.bindings.forEach((b) => walk(b.expr, canTry)); walk(e.result, canTry); return;
      case "BinOp": walk(e.left, canTry); walk(e.right, canTry); return;
      case "UnOp": walk(e.operand, canTry); return;
      case "Record": e.fields.forEach((f) => walk(f.expr, canTry)); return;
      case "RecordUpdate": walk(e.base, canTry); e.fields.forEach((f) => walk(f.expr, canTry)); return;
      case "Tuple": case "List": e.items.forEach((it) => walk(it && it.kind === "Spread" ? it.expr : it, canTry)); return;
      case "Pipe": walk(e.left, canTry); walk(e.right, canTry); return;
      default: return; // Lit, Var
    }
  }
}
