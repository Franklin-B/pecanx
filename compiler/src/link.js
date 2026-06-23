// Cross-module resolution for pcx (v0.1).
//
// Given an entry .px file, scans its directory tree for sibling modules, matches
// `import` declarations to modules by their `module` header (not by path), and
// returns the transitive set of needed modules in dependency-first order.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, basename } from "node:path";
import { lex } from "./lexer.js";
import { parse } from "./parser.js";

export function resolveModules(entryFile) {
  const entryPath = resolve(entryFile);
  const entryProgram = parse(lex(readFileSync(entryPath, "utf8")));
  const entryName = moduleName(entryProgram, entryPath);

  // Build a map of every parseable module under the entry's directory.
  const map = new Map();
  for (const f of walkPx(dirname(entryPath))) {
    try {
      const program = parse(lex(readFileSync(f, "utf8")));
      const name = moduleName(program, f);
      if (!map.has(name)) map.set(name, { name, file: f, program });
    } catch {
      /* skip files that don't parse; they aren't part of this build */
    }
  }
  map.set(entryName, { name: entryName, file: entryPath, program: entryProgram });

  // Dependency-first topological order over resolvable imports.
  const ordered = [];
  const done = new Set();
  const stack = new Set();
  const visit = (name) => {
    if (done.has(name) || stack.has(name)) return;
    const mod = map.get(name);
    if (!mod) return; // external / stdlib / missing — handled as unbound at runtime
    stack.add(name);
    for (const d of mod.program.decls) if (d.kind === "Import" && map.has(d.name)) visit(d.name);
    stack.delete(name);
    done.add(name);
    ordered.push(mod);
  };
  visit(entryName);

  return { ordered, entryName, map };
}

function moduleName(program, file) {
  const m = program.decls.find((d) => d.kind === "Module");
  return m ? m.name : "$" + basename(file).replace(/\.px$/, "");
}

function walkPx(dir) {
  const out = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === "node_modules" || e.startsWith(".")) continue;
    const p = join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) out.push(...walkPx(p));
    else if (e.endsWith(".px")) out.push(p);
  }
  return out;
}
