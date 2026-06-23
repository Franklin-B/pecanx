#!/usr/bin/env node
// pcx — the PecanX compiler (v0.2).
//
//   pcx check [--types] <file.px>        exhaustiveness + whole-program HM inference
//   pcx build <file.px> [--target js|wasm|dom] [-o out]
//   pcx run   <file.px>                  compile, link, and execute (calls main())
//
// v0.2 links multiple .px modules (resolving `import` by each file's `module`
// header) and targets JavaScript, WebAssembly (Int/Float/records via WasmGC), or a
// virtual-DOM-diffing real-DOM app. See ../docs/appendix-b-reference.md for the
// remaining roadmap (Wasm sum-types/strings/closures, keyed VDOM, fmt/lsp/dev).

import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, basename } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

import { LexError } from "./src/lexer.js";
import { ParseError } from "./src/parser.js";
import { check } from "./src/check.js";
import { inferTypesLinked } from "./src/types.js";
import { generateLinked, CodegenError } from "./src/codegen.js";
import { resolveModules } from "./src/link.js";
import { compileWasm } from "./src/wasm.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNTIME = readFileSync(resolve(HERE, "src/runtime.js"), "utf8");

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") return usage(0);
  if (!["check", "build", "run"].includes(cmd)) { console.error(`pcx: unknown command "${cmd}"`); return usage(1); }

  const file = rest.find((a) => !a.startsWith("-"));
  if (!file) { console.error("pcx: no input file"); return usage(1); }
  let outPath = null;
  const oi = rest.indexOf("-o");
  if (oi !== -1) outPath = rest[oi + 1];
  const ti = rest.indexOf("--target");
  const target = ti !== -1 ? rest[ti + 1] : "js";

  try { readFileSync(file, "utf8"); }
  catch { console.error(`pcx: cannot read ${file}`); process.exit(1); }

  let resolved;
  try {
    resolved = resolveModules(file);
  } catch (e) {
    if (e instanceof LexError || e instanceof ParseError) { console.error(`${file}: ${e.message}`); process.exit(1); }
    throw e;
  }
  const { ordered, entryName } = resolved;

  // Static checks across every reachable module.
  const wantTypes = rest.includes("--types");
  let errors = 0;
  const report = (file, d) => { console.error(`${file}: ${d.severity} [${d.code}] ${d.message}`); if (d.severity === "error") errors++; };
  for (const mod of ordered) for (const d of check(mod.program)) report(mod.file, d);
  if (wantTypes) for (const d of inferTypesLinked(ordered)) report(d.file, d);

  if (cmd === "check") {
    if (errors) { console.error(`pcx: ${errors} error(s).`); process.exit(1); }
    const extra = ordered.length > 1 ? ` (${ordered.length} modules)` : "";
    console.log(`✓ ${basename(file)} — no problems found.${extra}`);
    return;
  }

  if (errors) { console.error(`pcx: ${errors} error(s); aborting ${cmd}.`); process.exit(1); }

  // WebAssembly backend: compile the entry module's pure-integer functions.
  if (cmd === "build" && target === "wasm") {
    const entryProgram = ordered.find((m) => m.name === entryName).program;
    const { bytes, exports, skipped } = compileWasm(entryProgram);
    if (exports.length === 0) { console.error("pcx: no Wasm-eligible (pure-integer) functions found."); process.exit(1); }
    const dest = outPath || file.replace(/\.px$/, "") + ".wasm";
    writeFileSync(dest, bytes);
    console.log(`✓ wrote ${dest} — exports: ${exports.join(", ")}${skipped.length ? `; skipped (not pure-integer): ${skipped.join(", ")}` : ""}`);
    return;
  }

  // Real-DOM target: emit a self-contained HTML page that mounts the app.
  if (cmd === "build" && target === "dom") {
    const entryProgram = ordered.find((m) => m.name === entryName).program;
    const have = new Set(entryProgram.decls.filter((d) => d.kind === "Fn").map((d) => d.name));
    const missing = ["init", "update", "view"].filter((n) => !have.has(n));
    if (missing.length) { console.error(`pcx: --target dom requires ${missing.join(", ")} in the entry module`); process.exit(1); }
    const linked = generateLinked(ordered, entryName, { domMount: true });
    const dest = outPath || file.replace(/\.px$/, "") + ".html";
    writeFileSync(dest, domHtml(basename(file), `${RUNTIME}\n${linked.js}`));
    console.log(`✓ wrote ${dest}`);
    return;
  }

  let linked;
  try { linked = generateLinked(ordered, entryName); }
  catch (e) {
    if (e instanceof CodegenError) { console.error(`${file}: codegen error: ${e.message}`); process.exit(1); }
    throw e;
  }

  const moduleJs = `${RUNTIME}\n// ---- linked: ${ordered.map((m) => m.name).join(", ")} ----\n${linked.js}`;

  if (cmd === "build") {
    const dest = outPath || file.replace(/\.px$/, "") + ".mjs";
    writeFileSync(dest, moduleJs);
    console.log(`✓ wrote ${dest}${ordered.length > 1 ? ` (${ordered.length} modules linked)` : ""}`);
    return;
  }

  // run
  if (!linked.hasMain) { console.log(`✓ ${basename(file)} compiled (no \`main\` to run).`); return; }
  const tmp = resolve(tmpdir(), `pcx-${Date.now()}-${Math.floor(Math.random() * 1e6)}.mjs`);
  writeFileSync(tmp, moduleJs);
  try {
    const r = spawnSync(process.execPath, [tmp], { stdio: "inherit" });
    process.exitCode = r.status ?? 0;
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
}

function domHtml(title, script) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} — PecanX</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module">
${script}
    </script>
  </body>
</html>
`;
}

function usage(code) {
  console.log(`pcx — the PecanX compiler (v0.2)

usage:
  pcx check [--types] <file.px>   exhaustiveness checks; --types adds Hindley-Milner inference
  pcx build <file.px> [--target js|wasm|dom] [-o out]
                                  compile + link (js → .mjs, wasm → .wasm, dom → .html)
  pcx run   <file.px>             compile, link, and execute (runs main() if present)
`);
  process.exit(code);
}

main();
