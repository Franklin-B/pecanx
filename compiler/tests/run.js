// pcx test runner. Spawns the CLI end-to-end and asserts behavior.
//   node tests/run.js

import { spawnSync, spawn } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { lex } from "../src/lexer.js";
import { parse } from "../src/parser.js";
import { compileWasm } from "../src/wasm.js";
import { resolveModules } from "../src/link.js";
import { generateLinked } from "../src/codegen.js";
import { formatProgram } from "../src/format.js";
import { startDev } from "../src/dev.js";
import { makeDocument } from "./domshim.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const PCX = resolve(ROOT, "pcx.js");

function pcx(args) {
  const r = spawnSync(process.execPath, [PCX, ...args], { encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

let pass = 0, fail = 0;
const ok = (name) => { console.log(`  ok   ${name}`); pass++; };
const bad = (name, detail) => { console.log(`  FAIL ${name}\n       ${detail}`); fail++; };

// --- programs that should run and produce exact output ----------------------
const RUN = [
  {
    name: "signup_demo runs",
    file: "examples/signup_demo.px",
    expect: [
      "OK   ada@example.com (age 21)",
      "FAIL that does not look like an email",
      "FAIL must be at least 18",
      "FAIL a required field was empty",
    ].join("\n"),
  },
  {
    name: "features runs",
    file: "tests/cases/features.px",
    expect: [
      "area circle = 12.56",
      "area rect = 12.0",
      "classify -3 = negative",
      "pipe 5 = positive",
      "sum = 10",
      "label = head 10, 2 more",
      "opt = 42",
    ].join("\n"),
  },
  {
    name: "edgecases runs",
    file: "tests/cases/edgecases.px",
    expect: [
      "tree = 6",
      "prec = 13",
      "bool = yes",
      "grade = B",
      "upd = 21",
      "combine = sum 3",
    ].join("\n"),
  },
  {
    name: "try_demo runs (? over Result and Option)",
    file: "examples/try_demo.px",
    expect: [
      "OK   Ada (age 36)",
      "FAIL a field was empty",
      "FAIL age must be positive",
      "FAIL age must be a number",
      "sum of ends = 8",
      "list was empty",
    ].join("\n"),
  },
];

for (const t of RUN) {
  const r = pcx(["run", resolve(ROOT, t.file)]);
  if (r.status === 0 && r.out === t.expect) ok(t.name);
  else bad(t.name, `status=${r.status}\n--- expected ---\n${t.expect}\n--- got ---\n${r.out}\n${r.err}`);
}

// --- cross-module + effect-runtime demos (assert key fragments) -------------
const RUN_CONTAINS = [
  {
    name: "counter demo (cross-module + runtime)",
    file: "../examples/counter/Demo.px",
    contains: ['class="count">Count: 0', 'Count: 1', 'Count: 2', 'Count: 3'],
    lastLineHas: "Count: 0",
  },
  {
    name: "remote-users demo (server fn + Cmd + Remote)",
    file: "../examples/remote-users/Demo.px",
    contains: ["Nothing loaded yet", "Loading...", "<li>#1 Ada</li>", "<li>#2 Linus</li>"],
  },
  {
    name: "todo demo (3-module link)",
    file: "../examples/todo/Demo.px",
    contains: ["Buy milk", "Walk dog", "todo-item done", 'todo-filter is-active">Active'],
  },
];

for (const t of RUN_CONTAINS) {
  const r = pcx(["run", resolve(ROOT, t.file)]);
  const missing = (t.contains || []).filter((s) => !r.out.includes(s));
  const lines = r.out.split("\n");
  const lastOk = !t.lastLineHas || (lines.length && lines[lines.length - 1].includes(t.lastLineHas));
  if (r.status === 0 && missing.length === 0 && lastOk) ok(t.name);
  else bad(t.name, `status=${r.status} missing=${JSON.stringify(missing)} lastOk=${lastOk}\n${r.out}\n${r.err}`);
}

// --- files that should type-check cleanly -----------------------------------
const CHECK_OK = [
  "examples/counter/Main.px",
  "examples/todo/Domain.px",
  "examples/todo/Main.px",
  "examples/remote-users/Api.px",
  "examples/remote-users/Main.px",
].map((f) => resolve(ROOT, "..", f));

for (const f of CHECK_OK) {
  const r = pcx(["check", f]);
  if (r.status === 0) ok(`check ok: ${f.split(/[\\/]/).slice(-2).join("/")}`);
  else bad(`check ok: ${f}`, `status=${r.status}\n${r.err}`);
}

// --- files that should be rejected ------------------------------------------
const CHECK_FAIL = [
  { file: resolve(ROOT, "examples/nonexhaustive.px"), code: "PX0001" },
  { file: resolve(ROOT, "examples/try_toplevel_bad.px"), code: "PX0101" },
];

for (const t of CHECK_FAIL) {
  const r = pcx(["check", t.file]);
  if (r.status !== 0 && r.err.includes(t.code)) ok(`check rejects (${t.code}): ${t.file.split(/[\\/]/).pop()}`);
  else bad(`check rejects: ${t.file}`, `status=${r.status}\n${r.err}`);
}

// --- type inference (HM) ----------------------------------------------------
const TYPES_OK = [
  "examples/types/ok.px", "examples/math.px", "examples/try_demo.px",
  "../examples/todo/Main.px", "../examples/remote-users/Main.px", "../examples/counter/Main.px",
  "../examples/todo/Demo.px", // multi-module (Demo → Main → Domain) under linked inference
];
for (const f of TYPES_OK) {
  const r = pcx(["check", "--types", resolve(ROOT, f)]);
  if (r.status === 0) ok(`types ok: ${f.split(/[\\/]/).slice(-2).join("/")}`);
  else bad(`types ok: ${f}`, r.err);
}
const TYPES_BAD = [["bad_arith", "Int with String"], ["bad_branch", "Int with String"], ["bad_arg", "Int with Bool"], ["bad_unbound", "unbound"]];
for (const [n, frag] of TYPES_BAD) {
  const r = pcx(["check", "--types", resolve(ROOT, `examples/types/${n}.px`)]);
  if (r.status !== 0 && r.err.includes("PX0200") && r.err.includes(frag)) ok(`types rejects: ${n}`);
  else bad(`types rejects: ${n}`, `status=${r.status}\n${r.err}`);
}
{
  const r = pcx(["check", "--types", resolve(ROOT, "examples/xmod/B.px")]);
  if (r.status !== 0 && r.err.includes("PX0200") && r.err.includes("Int with Bool") && r.err.includes("XmodB")) ok("types rejects: cross-module arg mismatch");
  else bad("types cross-module", `status=${r.status}\n${r.err}`);
}

// --- pcx fmt (idempotent + structure-preserving) ----------------------------
// Structure comparison ignores source positions (line/col), which are incidental
// metadata that naturally shifts when code is reformatted.
const stripPos = (v) => JSON.stringify(v, (k, val) => (k === "line" || k === "col" ? undefined : val));
for (const f of ["examples/signup_demo.px", "examples/sumtypes.px", "examples/try_demo.px", "../examples/todo/Main.px"]) {
  try {
    const src = readFileSync(resolve(ROOT, f), "utf8");
    const a1 = parse(lex(src));
    const f1 = formatProgram(a1);
    const a2 = parse(lex(f1));
    const f2 = formatProgram(a2);
    if (f1 === f2 && stripPos(a1) === stripPos(a2)) ok(`fmt: idempotent + structure-preserving (${f.split(/[\\/]/).pop()})`);
    else bad(`fmt: ${f}`, `idempotent=${f1 === f2} equivalent=${stripPos(a1) === stripPos(a2)}`);
  } catch (e) { bad(`fmt: ${f}`, String((e && e.stack) || e)); }
}

// --- WebAssembly backend (emit a real .wasm, run it in Node) ----------------
try {
  const program = parse(lex(readFileSync(resolve(ROOT, "examples/math.px"), "utf8")));
  const { bytes, exports } = compileWasm(program);
  const { instance } = await WebAssembly.instantiate(bytes);
  const x = instance.exports;
  const cases = [["fib(10)", x.fib(10), 55], ["fact(5)", x.fact(5), 120], ["gcd(48,36)", x.gcd(48, 36), 12], ["poly(3)", x.poly(3), 37]];
  const wrong = cases.filter(([, got, want]) => got !== want);
  const eligibleOk = exports.includes("fib") && exports.includes("poly") && !exports.includes("greet");
  if (wrong.length === 0 && eligibleOk) ok("wasm backend: integers (real .wasm runs in Node)");
  else bad("wasm backend", `wrong=${JSON.stringify(wrong)} exports=${JSON.stringify(exports)}`);
} catch (e) {
  bad("wasm backend", String((e && e.stack) || e));
}

try {
  const program = parse(lex(readFileSync(resolve(ROOT, "examples/geo.px"), "utf8")));
  const { bytes, exports } = compileWasm(program);
  const { instance } = await WebAssembly.instantiate(bytes);
  const x = instance.exports;
  const cases = [["hyp2(3,4)", x.hyp2(3, 4), 25], ["area(3,4)", x.area(3, 4), 12], ["hyp2(5,12)", x.hyp2(5, 12), 169]];
  const wrong = cases.filter(([, g, w]) => g !== w);
  if (wrong.length === 0 && exports.includes("mkPoint")) ok("wasm backend: Float + records (WasmGC structs)");
  else bad("wasm records", `wrong=${JSON.stringify(wrong)} exports=${JSON.stringify(exports)}`);
} catch (e) {
  bad("wasm records", String((e && e.stack) || e));
}

try {
  const program = parse(lex(readFileSync(resolve(ROOT, "examples/sumtypes.px"), "utf8")));
  const { instance } = await WebAssembly.instantiate(compileWasm(program).bytes);
  const x = instance.exports;
  if (x.test() === 325 && x.demo() === 12) ok("wasm backend: sum types (tagged WasmGC structs + match)");
  else bad("wasm sums", `test=${x.test()} demo=${x.demo()}`);
} catch (e) { bad("wasm sums", String((e && e.stack) || e)); }

try {
  const program = parse(lex(readFileSync(resolve(ROOT, "examples/strings.px"), "utf8")));
  const { instance } = await WebAssembly.instantiate(compileWasm(program).bytes);
  const x = instance.exports;
  if (x.hello() === 5 && x.empty() === 0 && x.long() === 10) ok("wasm backend: strings (array<i8> + array.len)");
  else bad("wasm strings", `hello=${x.hello()} empty=${x.empty()} long=${x.long()}`);
} catch (e) { bad("wasm strings", String((e && e.stack) || e)); }

// --- real-DOM runtime (verified in Node under a minimal DOM shim) -----------
function buildDom(entryFile) {
  const { ordered, entryName } = resolveModules(entryFile);
  const { js } = generateLinked(ordered, entryName, { domMount: true });
  return readFileSync(resolve(ROOT, "src/runtime.js"), "utf8") + "\n" + js;
}
async function loadDom(entryFile) {
  const { document, root } = makeDocument();
  globalThis.document = document;
  const tmp = resolve(tmpdir(), `pcx-dom-${Date.now()}-${Math.floor(Math.random() * 1e6)}.mjs`);
  writeFileSync(tmp, buildDom(entryFile));
  try { await import(pathToFileURL(tmp).href); } finally { try { unlinkSync(tmp); } catch {} }
  return root;
}

try {
  const root = await loadDom(resolve(ROOT, "../examples/counter/Main.px"));
  const initial = root.textContent.includes("Count: 0");
  const plus = root.find((n) => n.tag === "button" && n.textContent === "+");
  plus.fire("click");
  const after1 = root.textContent.includes("Count: 1");
  // diff preserves identity: the "+" button is the *same* DOM node after re-render
  const sameNode = root.find((n) => n.tag === "button" && n.textContent === "+") === plus;
  plus.fire("click");
  const after2 = root.textContent.includes("Count: 2");
  if (initial && after1 && after2 && sameNode) ok("dom runtime: VDOM diff patches in place (events + node identity)");
  else bad("dom diff", `initial=${initial} after1=${after1} after2=${after2} sameNode=${sameNode} :: ${root.textContent}`);
} catch (e) { bad("dom diff", String((e && e.stack) || e)); }

try {
  const root = await loadDom(resolve(ROOT, "../examples/async/Loader.px"));
  const loading = root.textContent.includes("loading...");
  await new Promise((r) => setTimeout(r, 50));
  const ready = root.textContent.includes("ready!");
  if (loading && ready) ok("dom runtime: async effect resolves and re-renders");
  else bad("dom async", `loading=${loading} ready=${ready} :: ${root.textContent}`);
} catch (e) { bad("dom async", String((e && e.stack) || e)); }

try {
  const root = await loadDom(resolve(ROOT, "../examples/keyed/Main.px"));
  const ul = root.find((n) => n.tag === "ul");
  const li2 = ul.childNodes[1]; // the "2" item before rotation
  const before = ul.childNodes.map((c) => c.textContent).join(",");
  root.find((n) => n.tag === "button" && n.textContent === "rotate").fire("click");
  const after = ul.childNodes.map((c) => c.textContent).join(",");
  // [1,2,3] -> [2,3,1]; keyed reconciliation reuses the same node for "2"
  const movedSame = ul.childNodes[0] === li2 && li2.textContent === "2";
  if (before === "1,2,3" && after === "2,3,1" && movedSame) ok("dom runtime: keyed reconciliation reuses nodes across reorder");
  else bad("dom keyed", `before=${before} after=${after} movedSame=${movedSame}`);
} catch (e) { bad("dom keyed", String((e && e.stack) || e)); }

// --- pcx lsp (diagnostics over stdio) ---------------------------------------
{
  const out = await new Promise((res) => {
    const p = spawn(process.execPath, [PCX, "lsp"]);
    let acc = "";
    p.stdout.on("data", (d) => (acc += d.toString()));
    const send = (m) => { const s = JSON.stringify(m); p.stdin.write(`Content-Length: ${Buffer.byteLength(s)}\r\n\r\n${s}`); };
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    const text = "module Bad\ntype Color =\n  | Red\n  | Green\n  | Blue\nfn name(c: Color): String =\n  match c {\n    Red -> \"r\"\n    Green -> \"g\"\n  }\n";
    send({ jsonrpc: "2.0", method: "textDocument/didOpen", params: { textDocument: { uri: "file:///bad.px", text } } });
    setTimeout(() => { try { p.kill(); } catch {} res(acc); }, 1200);
  });
  if (out.includes("capabilities") && out.includes("publishDiagnostics") && out.includes("PX0001")) ok("lsp: initialize + publishDiagnostics (PX0001)");
  else bad("lsp", out.slice(0, 300));
}

// --- pcx dev (serves the real-DOM build) ------------------------------------
{
  const runtimeSrc = readFileSync(resolve(ROOT, "src/runtime.js"), "utf8");
  const buildCounter = () => {
    const { ordered, entryName } = resolveModules(resolve(ROOT, "../examples/counter/Main.px"));
    const { js } = generateLinked(ordered, entryName, { domMount: true });
    return `<!doctype html><html><body><div id="app"></div><script type="module">${runtimeSrc}\n${js}</script></body></html>`;
  };
  const okDev = await new Promise((res) => {
    const server = startDev("counter", 0, buildCounter);
    server.on("listening", async () => {
      const port = server.address().port;
      try {
        const t1 = await (await fetch(`http://localhost:${port}/`)).text();
        const t2 = await (await fetch(`http://localhost:${port}/healthz`)).text();
        server.close();
        res(t1.includes('id="app"') && t1.includes("Program.mount") && t2 === "ok");
      } catch { server.close(); res(false); }
    });
    server.on("error", () => res(false));
  });
  if (okDev) ok("dev: serves the real-DOM build + /healthz");
  else bad("dev", "server/build/fetch failed");
}

// --- orchard (local package manager) + pcx integration ----------------------
{
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const proj = resolve(tmpdir(), `pcx-orch-${stamp}`);
  const reg = resolve(tmpdir(), `pcx-reg-${stamp}`);
  mkdirSync(join(reg, "greet"), { recursive: true });
  writeFileSync(join(reg, "greet", "Greet.px"), 'module Greet\nfn greeting(): String = "hi from orchard"\n');
  writeFileSync(join(reg, "greet", "pecanx.toml"), '[package]\nname = "greet"\nversion = "1.2.0"\n');
  mkdirSync(proj, { recursive: true });
  writeFileSync(join(proj, "pecanx.toml"), '[package]\nname = "app"\nversion = "0.1.0"\n');
  writeFileSync(join(proj, "Main.px"), 'module Main\nimport Greet exposing (greeting)\nfn main(): Unit = Console.log(greeting())\n');
  const ORCHARD = resolve(ROOT, "orchard.js");
  const addR = spawnSync(process.execPath, [ORCHARD, "add", "greet", "--registry", reg], { cwd: proj, encoding: "utf8" });
  const copied = existsSync(join(proj, "orchard_modules", "greet", "Greet.px"));
  const recorded = /greet\s*=\s*"1\.2\.0"/.test(readFileSync(join(proj, "pecanx.toml"), "utf8"));
  const runR = spawnSync(process.execPath, [PCX, "run", join(proj, "Main.px")], { encoding: "utf8" });
  const linked = (runR.stdout || "").includes("hi from orchard");
  if (addR.status === 0 && copied && recorded && linked) ok("orchard: add installs a package; pcx links it");
  else bad("orchard", `status=${addR.status} copied=${copied} recorded=${recorded} linked=${linked}\n${addR.stderr}\n${runR.stderr}`);
}

// --- browser-safety ---------------------------------------------------------
// The playground imports these modules straight into the browser, so they must
// not reference Node-only globals. Guards against regressions like the Wasm
// backend reaching for `Buffer` (which Node has but a browser does not).
{
  const BROWSER_SAFE = ["lexer", "parser", "check", "types", "codegen", "wasm", "format"];
  const FORBIDDEN = /\bBuffer\b|\bnode:|\brequire\s*\(|\b__dirname\b|\b__filename\b/;
  const offenders = [];
  for (const m of BROWSER_SAFE) {
    const src = readFileSync(resolve(ROOT, "src", `${m}.js`), "utf8");
    const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    const hit = FORBIDDEN.exec(code);
    if (hit) offenders.push(`${m}.js → ${hit[0]}`);
  }
  if (offenders.length === 0) ok("browser-safety: playground modules use no Node-only globals");
  else bad("browser-safety", `offenders: ${offenders.join(", ")}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
