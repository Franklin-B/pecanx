#!/usr/bin/env node
// pcx — the PecanX compiler (v0.4).
//
//   pcx new   <name>                     scaffold a project (app + tests + manifest)
//   pcx check [--types] <file.px>        exhaustiveness + whole-program HM inference
//   pcx build <file.px> [--target js|wasm|dom] [-o out]
//   pcx run   <file.px>                  compile, link, and execute (calls main())
//   pcx test  [path]                     run zero-arg test… functions
//   pcx fmt / lsp / dev                  formatter / language server / dev server
//
// v0.4 links multiple .px modules (resolving `import` by each file's `module`
// header), lowers the `?` operator, and targets JavaScript, WebAssembly
// (Int/Float/records/sum-types/strings via WasmGC), or a virtual-DOM-diffing
// real-DOM app. See ../docs/appendix-b-reference.md for the remaining roadmap
// (Wasm closures / first-class functions, a networked Orchard registry, rename).

import { readFileSync, writeFileSync, unlinkSync, statSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, basename, join, relative } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

import { lex, LexError } from "./src/lexer.js";
import { parse, ParseError } from "./src/parser.js";
import { formatProgram } from "./src/format.js";
import { check } from "./src/check.js";
import { inferTypesLinked } from "./src/types.js";
import { generateLinked, CodegenError } from "./src/codegen.js";
import { resolveModules } from "./src/link.js";
import { compileWasm } from "./src/wasm.js";
import { startLsp } from "./src/lsp.js";
import { startDev } from "./src/dev.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNTIME = readFileSync(resolve(HERE, "src/runtime.js"), "utf8");

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") return usage(0);
  if (!["check", "build", "run", "fmt", "lsp", "dev", "test", "new"].includes(cmd)) { console.error(`pcx: unknown command "${cmd}"`); return usage(1); }
  if (cmd === "lsp") { startLsp(); return; }
  if (cmd === "test") { return runTests(rest); }
  if (cmd === "new") { return scaffold(rest); }

  const file = rest.find((a) => !a.startsWith("-"));
  if (!file) { console.error("pcx: no input file"); return usage(1); }

  if (cmd === "fmt") {
    let src; try { src = readFileSync(file, "utf8"); } catch { console.error(`pcx: cannot read ${file}`); process.exit(1); }
    let program;
    try { program = parse(lex(src)); }
    catch (e) { if (e instanceof LexError || e instanceof ParseError) { console.error(`${file}: ${e.message}`); process.exit(1); } throw e; }
    const out = formatProgram(program);
    if (rest.includes("-w")) { writeFileSync(file, out); console.log(`✓ formatted ${basename(file)}`); }
    else process.stdout.write(out);
    return;
  }
  let outPath = null;
  const oi = rest.indexOf("-o");
  if (oi !== -1) outPath = rest[oi + 1];
  const ti = rest.indexOf("--target");
  const target = ti !== -1 ? rest[ti + 1] : "js";

  try { readFileSync(file, "utf8"); }
  catch { console.error(`pcx: cannot read ${file}`); process.exit(1); }

  if (cmd === "dev") {
    const pi = rest.indexOf("-p");
    const port = pi !== -1 ? Number(rest[pi + 1]) : 8080;
    startDev(file, port, () => buildDomHtml(file));
    return;
  }

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
  const report = (file, d) => { const at = d.line ? `:${d.line}:${d.col || 1}` : ""; console.error(`${file}${at}: ${d.severity} [${d.code}] ${d.message}`); if (d.severity === "error") errors++; };
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
    try { const dest = outPath || file.replace(/\.px$/, "") + ".html"; writeFileSync(dest, buildDomHtml(file)); console.log(`✓ wrote ${dest}`); }
    catch (e) { console.error(`pcx: ${e.message}`); process.exit(1); }
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

// ---- pcx test ---------------------------------------------------------------
// Discovers every `.px` under the given path (default: ./tests if present, else
// .) that declares zero-arg `fn test...(): Bool` functions, links each such file
// with its dependencies, and runs its tests, reporting pass/fail counts.
function runTests(rest) {
  const arg = rest.find((a) => !a.startsWith("-"));
  const target = resolve(arg || (existsSync("tests") ? "tests" : "."));
  let files;
  try { files = statSync(target).isFile() ? [target] : walkPx(target); }
  catch { console.error(`pcx: cannot read ${target}`); process.exit(1); }

  const suites = [];
  for (const file of files.sort()) {
    let program; try { program = parse(lex(readFileSync(file, "utf8"))); } catch { continue; }
    const tests = program.decls.filter((d) => d.kind === "Fn" && /^test/.test(d.name) && d.params.length === 0).map((d) => d.name);
    if (tests.length) suites.push({ file, tests });
  }
  if (!suites.length) { console.log(`pcx test: no tests found under ${relative(process.cwd(), target) || "."}.\n  (define zero-arg functions named test… that return Bool — e.g. \`fn testAdd(): Bool = add(2, 3) == 5\`)`); process.exit(0); }

  let pass = 0, fail = 0, errored = 0;
  for (const { file, tests } of suites) {
    console.log(`\n${relative(process.cwd(), file) || file}`);
    let ordered, entryName;
    try { ({ ordered, entryName } = resolveModules(file)); }
    catch (e) { console.error(`  ! cannot resolve modules: ${e.message}`); errored++; continue; }

    let errs = 0;
    for (const mod of ordered) for (const d of check(mod.program)) if (d.severity === "error") { console.error(`  ! ${basename(mod.file)}:${d.line || 1}: [${d.code}] ${d.message}`); errs++; }
    if (errs) { errored++; continue; }

    let linked;
    try { linked = generateLinked(ordered, entryName, { tests }); }
    catch (e) { console.error(`  ! codegen: ${e.message}`); errored++; continue; }

    const tmp = resolve(tmpdir(), `pcx-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}.mjs`);
    writeFileSync(tmp, `${RUNTIME}\n${linked.js}`);
    const r = spawnSync(process.execPath, [tmp], { encoding: "utf8" });
    try { unlinkSync(tmp); } catch {}

    let sawResult = false;
    for (const line of (r.stdout || "").split("\n")) {
      const m = /^__PCX_RESULT__ (\d+) (\d+)$/.exec(line);
      if (m) { pass += +m[1]; fail += +m[2]; sawResult = true; }
      else if (line.length) console.log(line);
    }
    if (!sawResult) { console.error(`  ! runtime error\n${(r.stderr || "").trim()}`); errored++; }
  }

  const summary = `${pass} passed, ${fail} failed${errored ? `, ${errored} file(s) errored` : ""}`;
  console.log(`\n${summary}`);
  process.exit(fail || errored ? 1 : 0);
}

// ---- pcx new ----------------------------------------------------------------
// Scaffolds a runnable project: a counter DOM app, a unit-test module, a
// manifest, a README, and a .gitignore. The layout is flat so that
// `pcx test`, `pcx dev Main.px`, and `pcx run Main.px` all work out of the box.
function scaffold(rest) {
  const name = rest.find((a) => !a.startsWith("-"));
  if (!name) { console.error("pcx: usage: pcx new <name>"); process.exit(1); }
  const dir = resolve(name);
  if (existsSync(dir) && readdirSync(dir).length) { console.error(`pcx: "${name}" already exists and is not empty`); process.exit(1); }
  const pkg = basename(name).replace(/[^A-Za-z0-9_.\-]/g, "-");

  mkdirSync(dir, { recursive: true });
  const w = (rel, body) => writeFileSync(join(dir, rel), body);
  w("pecanx.toml", `[package]\nname = "${pkg}"\nversion = "0.1.0"\n\n[dependencies]\n`);
  w(".gitignore", "orchard_modules/\n*.mjs\n*.wasm\n*.out.html\ndist/\nnode_modules/\n");
  w("Main.px", SCAFFOLD_MAIN);
  w("MainTest.px", SCAFFOLD_TEST);
  w("README.md", scaffoldReadme(pkg));

  console.log(`✓ created ${name}/
    ${name}/pecanx.toml
    ${name}/Main.px         the app (counter)
    ${name}/MainTest.px     unit tests

next steps:
    cd ${name}
    pcx run  Main.px        # run it headless
    pcx test               # run the unit tests
    pcx dev  Main.px        # serve the live app at http://localhost:8080
    pcx build Main.px --target dom -o app.html`);
}

function scaffoldReadme(pkg) {
  return `# ${pkg}

A PecanX project. The whole app is a single \`Model / Msg / update / view\` loop;
\`update\` is pure and its \`match\` is checked for exhaustiveness at compile time.

\`\`\`bash
pcx run   Main.px      # run headless (prints the rendered view)
pcx test               # run MainTest.px
pcx dev   Main.px      # live dev server → http://localhost:8080
pcx build Main.px --target dom -o app.html   # a single deployable HTML file
\`\`\`
`;
}

const SCAFFOLD_MAIN = `module Main

-- A starter PecanX app: a counter following the Model / Msg / update / view
-- architecture. \`pcx dev Main.px\` serves it live; \`pcx test\` runs MainTest.px.

import Html
import Attr
import Event

type alias Model = Int

type Msg =
  | Increment
  | Decrement
  | Reset

-- The pure state transition — small, total, and easy to unit-test (MainTest.px).
fn step(msg: Msg, count: Int): Int =
  match msg {
    Increment -> count + 1
    Decrement -> count - 1
    Reset     -> 0
  }

fn init(): (Model, Cmd<Msg>) =
  (0, Cmd.none)

fn update(msg: Msg, model: Model): (Model, Cmd<Msg>) =
  (step(msg, model), Cmd.none)

fn view(model: Model): Html<Msg> =
  Html.div([Attr.class("counter")], [
    Html.button([Event.onClick(Decrement)], [Html.text("-")]),
    Html.span([Attr.class("count")], [Html.text("Count: \${Int.toString(model)}")]),
    Html.button([Event.onClick(Increment)], [Html.text("+")]),
    Html.button([Event.onClick(Reset)], [Html.text("Reset")])
  ])
`;

const SCAFFOLD_TEST = `module MainTest

-- Unit tests. \`pcx test\` runs every zero-arg \`fn test…(): Bool\` it finds; a
-- test passes when it returns true.

import Main exposing (step, Increment, Decrement, Reset)

fn testIncrement(): Bool =
  step(Increment, 0) == 1

fn testDecrement(): Bool =
  step(Decrement, 5) == 4

fn testReset(): Bool =
  step(Reset, 99) == 0

fn testSequence(): Bool =
  step(Increment, step(Increment, 0)) == 2
`;

function walkPx(dir) {
  const out = [];
  let entries; try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === "orchard_modules" || e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkPx(p));
    else if (e.name.endsWith(".px")) out.push(p);
  }
  return out;
}

// Build the entry app's real-DOM HTML (used by `build --target dom` and `dev`).
function buildDomHtml(file) {
  const { ordered, entryName } = resolveModules(file);
  const entryProgram = ordered.find((m) => m.name === entryName).program;
  const have = new Set(entryProgram.decls.filter((d) => d.kind === "Fn").map((d) => d.name));
  const missing = ["init", "update", "view"].filter((n) => !have.has(n));
  if (missing.length) throw new Error(`--target dom requires ${missing.join(", ")} in the entry module`);
  const linked = generateLinked(ordered, entryName, { domMount: true });
  return domHtml(basename(file), `${RUNTIME}\n${linked.js}`);
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
  console.log(`pcx — the PecanX compiler (v0.4)

usage:
  pcx new   <name>               scaffold a new project (app + tests + manifest)
  pcx check [--types] <file.px>   exhaustiveness checks; --types adds Hindley-Milner inference
  pcx build <file.px> [--target js|wasm|dom] [-o out]
                                  compile + link (js → .mjs, wasm → .wasm, dom → .html)
  pcx run   <file.px>             compile, link, and execute (runs main() if present)
  pcx test  [path]               run zero-arg test… functions (default: ./tests or .)
  pcx fmt   <file.px> [-w]        format source (print, or -w to write in place)
  pcx lsp                         run the language server (LSP over stdio)
  pcx dev   <file.px> [-p port]   serve the real-DOM app (default port 8080)
`);
  process.exit(code);
}

main();
