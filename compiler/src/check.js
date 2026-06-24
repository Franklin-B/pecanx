// PecanX static checks (pcx v0.3).
//
// v0.3 ships the language's signature check — `match` exhaustiveness — plus a
// scan for the `?` operator (not yet supported by the JS backend). Full
// Hindley-Milner type inference is on the roadmap (see appendix-b-reference.md);
// this checker is deliberately conservative: it only reports a non-exhaustive
// match when it can identify the scrutinee's sum type from the constructors used,
// so it never emits a false positive.

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
    if (d.kind === "Fn") walk(d.body);
    else if (d.kind === "Let") walk(d.expr);
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

  function walk(e) {
    if (!e || typeof e !== "object") return;
    switch (e.kind) {
      case "Match":
        checkMatch(e);
        walk(e.scrutinee);
        for (const a of e.arms) { if (a.guard) walk(a.guard); walk(a.body); }
        return;
      case "Try":
        diags.push({ severity: "error", code: "PX0100", message: "The `?` operator is not yet supported by the pcx v0.3 backend.", line: e.line, col: e.col });
        walk(e.expr); return;
      case "StrInterp":
        for (const p of e.parts) if (p.kind === "expr") walk(p.expr);
        return;
      case "Field": walk(e.obj); return;
      case "Call": walk(e.callee); (e.named ? e.args.map((a) => a.expr) : e.args).forEach(walk); return;
      case "Lambda": walk(e.body); return;
      case "If": walk(e.cond); walk(e.then); walk(e.else); return;
      case "Block": e.bindings.forEach((b) => walk(b.expr)); walk(e.result); return;
      case "BinOp": walk(e.left); walk(e.right); return;
      case "UnOp": walk(e.operand); return;
      case "Record": e.fields.forEach((f) => walk(f.expr)); return;
      case "RecordUpdate": walk(e.base); e.fields.forEach((f) => walk(f.expr)); return;
      case "Tuple": case "List": e.items.forEach((it) => walk(it && it.kind === "Spread" ? it.expr : it)); return;
      case "Pipe": walk(e.left); walk(e.right); return;
      default: return; // Lit, Var
    }
  }
}
