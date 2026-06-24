// PecanX playground — the pcx compiler, running entirely in your browser.
//
// It imports the *same* browser-safe compiler modules the CLI uses (lexer →
// parser → check → type-inference → codegen / wasm / format) and executes
// generated programs inside a sandboxed iframe. Nothing is sent to a server.

import { lex, LexError } from "../compiler/src/lexer.js";
import { parse, ParseError } from "../compiler/src/parser.js";
import { check } from "../compiler/src/check.js";
import { inferTypesLinked } from "../compiler/src/types.js";
import { generateLinked, CodegenError } from "../compiler/src/codegen.js";
import { compileWasm } from "../compiler/src/wasm.js";
import { formatProgram } from "../compiler/src/format.js";

// ---------------------------------------------------------------------------
// Examples + the default buffer
// ---------------------------------------------------------------------------

const WELCOME = `module Welcome

-- Welcome to the PecanX playground! This is the real pcx compiler, running
-- in your browser. Edit the code, then press Run (Ctrl/Cmd + Enter).
--
-- Try deleting the \`Clubs\` arm below — you'll get a live PX0001 squiggle,
-- because pcx checks that every \`match\` covers every case.

type Suit = Hearts | Spades | Clubs | Diamonds

fn color(s: Suit): String =
  match s {
    Hearts   -> "red"
    Diamonds -> "red"
    Spades   -> "black"
    Clubs    -> "black"
  }

fn main(): Unit =
  Console.log("Hearts are " ++ color(Hearts))
`;

// Fetched on demand (paths are relative to the repo, which serves this page).
const EXAMPLES = [
  { id: "welcome", label: "Welcome", inline: WELCOME },
  { id: "counter", label: "Counter (DOM app)", path: "../examples/counter/Main.px" },
  { id: "signup", label: "Isomorphic validation (console)", path: "../compiler/examples/signup_demo.px" },
  { id: "sumtypes", label: "Sum types → WebAssembly", path: "../compiler/examples/sumtypes.px" },
  { id: "math", label: "Numeric → WebAssembly", path: "../compiler/examples/math.px" },
];

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const code = $("code");
const highlightEl = $("highlight").querySelector("code");
const gutter = $("gutter");
const squiggles = $("squiggles");
const codeArea = $("code-area");
const previewFrame = $("preview-frame");
const previewPanel = document.querySelector('.panel[data-panel="preview"]');
const consoleOut = $("console-out");
const jsOut = $("js-out").querySelector("code");
const wasmOut = $("wasm-out");
const problemsOut = $("problems-out");
const problemCount = $("problem-count");
const targetSel = $("target");
const targetBadge = $("target-badge");
const statusDiag = $("status-diag");
const statusPos = $("status-pos");

let gutInner = document.createElement("div");
gutInner.className = "gut-inner";
gutter.appendChild(gutInner);
let sqInner = document.createElement("div");
sqInner.className = "sq-inner";
squiggles.appendChild(sqInner);

// ---------------------------------------------------------------------------
// Syntax highlighting (display only — diagnostics come from the real compiler)
// ---------------------------------------------------------------------------

const KW = new Set(["module", "import", "exposing", "as", "type", "alias", "opaque", "parse", "fn", "server", "let", "effect"]);
const CTRL = new Set(["if", "then", "else", "match"]);
const WORDOP = new Set(["not", "and", "or"]);
const BOOLU = new Set(["true", "false", "unit"]);
const CTORS = new Set(["Ok", "Err", "Some", "None", "NotAsked", "Loading", "Failure", "Success"]);
const STD = new Set(["String", "Int", "Float", "List", "Dict", "Option", "Result", "Char", "Console", "Html", "Attr", "Event", "Cmd", "Http", "Time", "Random", "Nav", "Server", "Db", "Decode", "Json", "Bool", "Set", "Program", "Remote"]);

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const isW = (c) => c >= "0" && c <= "9" || c >= "a" && c <= "z" || c >= "A" && c <= "Z" || c === "_";
const isD = (c) => c >= "0" && c <= "9";

function highlight(src) {
  let out = "", i = 0;
  const n = src.length;
  const span = (cls, t) => { out += `<span class="${cls}">${esc(t)}</span>`; };
  while (i < n) {
    const c = src[i];
    if (c === "{" && src[i + 1] === "-") {
      let j = i + 2, depth = 1;
      while (j < n && depth > 0) {
        if (src[j] === "{" && src[j + 1] === "-") { depth++; j += 2; }
        else if (src[j] === "-" && src[j + 1] === "}") { depth--; j += 2; }
        else j++;
      }
      span("tok-comment", src.slice(i, j)); i = j; continue;
    }
    if (c === "-" && src[i + 1] === "-") { let j = i + 2; while (j < n && src[j] !== "\n") j++; span("tok-comment", src.slice(i, j)); i = j; continue; }
    if (c === '"') { let j = i + 1; while (j < n) { if (src[j] === "\\") { j += 2; continue; } if (src[j] === '"') { j++; break; } j++; } span("tok-string", src.slice(i, j)); i = j; continue; }
    if (c === "@") { let j = i + 1; while (j < n && isW(src[j])) j++; span("tok-ann", src.slice(i, j)); i = j; continue; }
    if (isD(c)) {
      let j = i + 1; while (j < n && (isD(src[j]) || src[j] === "_")) j++;
      if (src[j] === "." && isD(src[j + 1])) { j++; while (j < n && (isD(src[j]) || src[j] === "_")) j++; }
      if (src[j] === "e" || src[j] === "E") { j++; if (src[j] === "+" || src[j] === "-") j++; while (j < n && isD(src[j])) j++; }
      span("tok-num", src.slice(i, j)); i = j; continue;
    }
    if (isW(c) && !isD(c)) {
      let j = i + 1; while (j < n && isW(src[j])) j++;
      const w = src.slice(i, j);
      let k = j; while (k < n && (src[k] === " " || src[k] === "\t")) k++;
      const call = src[k] === "(";
      let cls = null;
      if (CTRL.has(w)) cls = "tok-ctrl";
      else if (KW.has(w)) cls = "tok-kw";
      else if (WORDOP.has(w)) cls = "tok-op";
      else if (BOOLU.has(w)) cls = "tok-bool";
      else if (CTORS.has(w)) cls = "tok-ctor";
      else if (STD.has(w)) cls = "tok-stdlib";
      else if (w[0] >= "A" && w[0] <= "Z") cls = "tok-type";
      else if (call) cls = "tok-fn";
      if (cls) span(cls, w); else out += esc(w);
      i = j; continue;
    }
    const three = src.substr(i, 3), two = src.substr(i, 2);
    if (three === "...") { span("tok-op", "..."); i += 3; continue; }
    if (["->", "|>", "++", "==", "/=", "<=", ">=", "::"].includes(two)) { span("tok-op", two); i += 2; continue; }
    if ("+-*/%<>=|\\?.,:".includes(c)) { span("tok-op", c); i++; continue; }
    out += esc(c); i++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Editor rendering (gutter, highlight overlay, squiggles)
// ---------------------------------------------------------------------------

let charW = 8, lineH = 20, padL = 12, padT = 10;

function measureMetrics() {
  const cs = getComputedStyle(code);
  lineH = parseFloat(cs.lineHeight) || 20;
  padL = parseFloat(cs.paddingLeft) || 12;
  padT = parseFloat(cs.paddingTop) || 10;
  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre;";
  probe.style.font = cs.font || `${cs.fontSize}/${cs.lineHeight} ${cs.fontFamily}`;
  probe.textContent = "M".repeat(80);
  document.body.appendChild(probe);
  charW = probe.getBoundingClientRect().width / 80 || 8;
  probe.remove();
}

let lastDiags = [];

function renderEditor() {
  const src = code.value;
  highlightEl.innerHTML = highlight(src);
  const lines = src.split("\n");
  // gutter
  const errLines = new Set(lastDiags.filter((d) => d.line).map((d) => d.line));
  let g = "";
  for (let i = 1; i <= lines.length; i++) {
    const e = errLines.has(i);
    g += `<div class="ln${e ? " has-error" : ""}">${e ? '<span class="dot">●</span>' : ""}${i}</div>`;
  }
  gutInner.innerHTML = g;
  renderSquiggles(lines);
  syncScroll();
}

function renderSquiggles(lines) {
  let html = "";
  for (const d of lastDiags) {
    if (!d.line) continue;
    const s = lines[d.line - 1] || "";
    let start = (d.col || 1) - 1;
    let end = start;
    while (end < s.length && isW(s[end])) end++;
    if (end === start) end = start + 1;
    const x = padL + start * charW;
    const y = padT + (d.line - 1) * lineH + lineH - 3;
    const w = Math.max(charW, (end - start) * charW);
    html += `<div class="sq" style="left:${x}px;top:${y}px;width:${w}px"></div>`;
  }
  sqInner.innerHTML = html;
}

function syncScroll() {
  const sl = code.scrollLeft, st = code.scrollTop;
  highlightEl.style.transform = `translate(${-sl}px, ${-st}px)`;
  sqInner.style.transform = `translate(${-sl}px, ${-st}px)`;
  gutInner.style.transform = `translateY(${-st}px)`;
}

function updateCaret() {
  const upto = code.value.slice(0, code.selectionStart);
  const line = (upto.match(/\n/g) || []).length + 1;
  const col = upto.length - upto.lastIndexOf("\n");
  statusPos.textContent = `Ln ${line}, Col ${col}`;
}

// ---------------------------------------------------------------------------
// Compile
// ---------------------------------------------------------------------------

function compile(src) {
  let program;
  try { program = parse(lex(src)); }
  catch (e) {
    const m = /(\d+):(\d+)/.exec(e.message || "");
    return { ok: false, diags: [{ severity: "error", code: e instanceof LexError ? "PX0000" : "PX0010", message: e.message, line: m ? +m[1] : 1, col: m ? +m[2] : 1 }] };
  }
  const name = (program.decls.find((d) => d.kind === "Module") || {}).name || "Main";
  const mods = [{ name, program, file: "playground.px" }];
  const diags = [...check(program), ...inferTypesLinked(mods)];
  const fns = new Set(program.decls.filter((d) => d.kind === "Fn").map((d) => d.name));
  const isDom = ["init", "update", "view"].every((n) => fns.has(n));
  const hasMain = fns.has("main");
  let jsForDisplay = "";
  try { jsForDisplay = generateLinked(mods, name, { domMount: isDom }).js; }
  catch (e) { if (e instanceof CodegenError) diags.push({ severity: "error", code: "PX0300", message: "codegen: " + e.message, line: 1, col: 1 }); else throw e; }
  return { ok: true, program, name, mods, diags, isDom, hasMain, jsForDisplay };
}

function resolveTarget(c) {
  const sel = targetSel.value;
  if (sel !== "auto") return sel;
  if (!c.ok) return "js";
  if (c.isDom) return "dom";
  if (c.hasMain) return "js";
  return "wasm";
}

const TARGET_LABEL = { dom: "DOM", js: "RUN · JS", wasm: "WASM" };

function renderDiagnostics(c) {
  lastDiags = c.diags || [];
  const errs = lastDiags.filter((d) => d.severity === "error");
  // status
  if (errs.length === 0) { statusDiag.textContent = "✓ no problems"; statusDiag.className = "status-ok"; }
  else { statusDiag.textContent = `${errs.length} problem${errs.length > 1 ? "s" : ""}`; statusDiag.className = "status-err"; }
  problemCount.textContent = errs.length ? `(${errs.length})` : "";
  // problems panel
  if (lastDiags.length === 0) problemsOut.innerHTML = '<div class="empty">No problems.</div>';
  else problemsOut.innerHTML = lastDiags.map((d, i) =>
    `<div class="prob sev-${d.severity}" data-i="${i}"><span class="loc">${d.line ? `${d.line}:${d.col || 1}` : "—"}</span><span class="code">${d.code}</span><span class="msg">${esc(d.message)}</span></div>`
  ).join("");
  // js tab
  jsOut.textContent = c.ok ? c.jsForDisplay : "// This program does not parse yet — fix the error in the Problems tab.";
  // badge reflects what Run would do
  const t = resolveTarget(c);
  targetBadge.textContent = TARGET_LABEL[t] || "—";
}

// jump the caret to a diagnostic when its row is clicked
problemsOut.addEventListener("click", (e) => {
  const row = e.target.closest(".prob");
  if (!row) return;
  const d = lastDiags[+row.dataset.i];
  if (!d || !d.line) return;
  const lines = code.value.split("\n");
  let pos = 0;
  for (let i = 0; i < d.line - 1; i++) pos += lines[i].length + 1;
  pos += (d.col || 1) - 1;
  code.focus();
  code.setSelectionRange(pos, pos);
  updateCaret();
  // bring into view
  code.scrollTop = Math.max(0, (d.line - 1) * lineH - codeArea.clientHeight / 2);
  syncScroll();
});

// ---------------------------------------------------------------------------
// Execution (sandboxed iframe + console capture)
// ---------------------------------------------------------------------------

let RUNTIME = null;
async function getRuntime() {
  if (RUNTIME != null) return RUNTIME;
  const r = await fetch(new URL("../compiler/src/runtime.js", import.meta.url));
  RUNTIME = await r.text();
  return RUNTIME;
}

// Injected (classic) into the iframe before the program so Console.log and
// uncaught errors stream back to the parent via postMessage.
function pcxConsoleShim() {
  function fmt(x) { if (typeof x === "string") return x; try { return JSON.stringify(x); } catch (e) { return String(x); } }
  function post(level, args) { try { parent.postMessage({ __pcx: 1, kind: "log", level: level, text: Array.prototype.map.call(args, fmt).join(" ") }, "*"); } catch (e) {} }
  ["log", "info", "warn", "error"].forEach(function (l) {
    var orig = console[l] ? console[l].bind(console) : function () {};
    console[l] = function () { post(l === "info" ? "log" : l, arguments); orig.apply(console, arguments); };
  });
  window.addEventListener("error", function (e) { post("error", [String(e.message) + (e.error && e.error.stack ? "\n" + e.error.stack : "")]); });
  window.addEventListener("unhandledrejection", function (e) { var r = e.reason; post("error", ["Unhandled rejection: " + (r && r.message ? r.message : String(r))]); });
}

function neutralize(s) { return s.replace(/<\/(script)/gi, "<\\/$1"); }

function buildPreviewDoc(runtime, linkedJs, isDom) {
  const program = neutralize(runtime + "\n" + linkedJs);
  const shim = "(" + pcxConsoleShim.toString() + ")()";
  return `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;font:14px/1.5 system-ui,-apple-system,sans-serif;color:#16181d}#app{padding:14px}button{font:inherit}</style></head>
<body>${isDom ? '<div id="app"></div>' : ""}
<script>${shim}</script>
<script type="module">${program}</script>
</body></html>`;
}

window.addEventListener("message", (e) => {
  const d = e.data;
  if (!d || d.__pcx !== 1) return;
  if (e.source !== previewFrame.contentWindow) return;
  if (d.kind === "log") appendConsole(d.level, d.text);
});

function clearConsole() { consoleOut.innerHTML = ""; }
function setConsoleNote(text) { consoleOut.innerHTML = `<div class="log-line log-meta">${esc(text)}</div>`; }
function appendConsole(level, text) {
  const div = document.createElement("div");
  div.className = "log-line" + (level === "warn" ? " log-warn" : level === "error" ? " log-error" : "");
  div.textContent = text;
  consoleOut.appendChild(div);
  consoleOut.scrollTop = consoleOut.scrollHeight;
}
function showPreview(on) { previewPanel.classList.toggle("showing", !!on); }

async function run() {
  const c = compile(code.value);
  renderDiagnostics(c);
  renderEditor();
  if (!c.ok) { switchTab("problems"); return; }

  const target = resolveTarget(c);
  if (target === "wasm") { switchTab("wasm"); buildWasmTab(c); return; }

  if (target === "dom") {
    if (!c.isDom) { switchTab("console"); setConsoleNote("This program has no init/update/view to mount as a DOM app."); return; }
    const runtime = await getRuntime();
    const linked = generateLinked(c.mods, c.name, { domMount: true }).js;
    clearConsole(); showPreview(true); switchTab("preview");
    previewFrame.srcdoc = buildPreviewDoc(runtime, linked, true);
    return;
  }

  // js / main
  if (!c.hasMain) { switchTab("console"); setConsoleNote("Nothing to run: no `main`, and no init/update/view. It still compiles — see the JS tab."); showPreview(false); return; }
  const runtime = await getRuntime();
  const linked = generateLinked(c.mods, c.name).js;
  clearConsole(); showPreview(false); switchTab("console");
  previewFrame.srcdoc = buildPreviewDoc(runtime, linked, false);
}

// ---------------------------------------------------------------------------
// WebAssembly tab
// ---------------------------------------------------------------------------

function fnInfo(program, name) {
  const d = program.decls.find((x) => x.kind === "Fn" && x.name === name);
  if (!d) return null;
  const ptypes = (d.paramTypes || []).map((t) => (t && t.t === "name" ? t.name : null));
  const ret = d.retType && d.retType.t === "name" ? d.retType.name : null;
  return { arity: d.params.length, params: d.params, ptypes, ret };
}

async function buildWasmTab(c) {
  let res;
  try { res = compileWasm(c.program); }
  catch (e) { wasmOut.innerHTML = `<div class="err">Wasm compile error: ${esc(e.message || String(e))}</div>`; return; }
  const { bytes, exports, skipped } = res;
  if (!exports.length) {
    wasmOut.innerHTML = `<div class="row">No Wasm-eligible functions found.</div><div class="row skip">The Wasm backend compiles pure numeric / record / sum-type / string functions. ${skipped.length ? "Skipped: " + esc(skipped.join(", ")) : ""}</div>`;
    return;
  }
  const blob = new Blob([bytes], { type: "application/wasm" });
  const url = URL.createObjectURL(blob);
  let html = `<h3>Compiled a real WebAssembly module — ${bytes.length} bytes</h3>`;
  html += `<div class="row">Exports: ${exports.map((n) => `<span class="pill">${esc(n)}</span>`).join("")}</div>`;
  if (skipped.length) html += `<div class="row skip">Skipped (not Wasm-eligible): ${esc(skipped.join(", "))}</div>`;
  html += `<div class="row"><a class="dl" href="${url}" download="${esc(c.name)}.wasm">⬇ Download ${esc(c.name)}.wasm</a></div>`;
  html += `<div id="wasm-status" class="row"></div>`;
  html += `<div id="wasm-caller" class="caller"></div>`;
  wasmOut.innerHTML = html;

  // Try to instantiate (WasmGC modules need a modern browser).
  try {
    const { instance } = await WebAssembly.instantiate(bytes, {});
    $("wasm-status").innerHTML = `<span class="ok">✓ instantiates in your browser.</span>`;
    const caller = $("wasm-caller");
    const callable = exports.map((n) => ({ n, info: fnInfo(c.program, n) }))
      .filter((x) => x.info && x.info.ptypes.every((t) => t === "Int" || t === "Float"));
    if (callable.length) {
      caller.innerHTML = "<h3>Call an export</h3>";
      for (const { n, info } of callable) {
        const row = document.createElement("div");
        row.className = "fn";
        const inputs = info.params.map((p, k) => `<input data-k="${k}" placeholder="${esc(p)}" value="${info.ptypes[k] === "Float" ? "1.0" : "5"}" />`).join("");
        row.innerHTML = `<span class="fn-name">${esc(n)}</span>(${inputs})<button data-fn="${esc(n)}">call</button> <span class="res" data-res="${esc(n)}"></span>`;
        caller.appendChild(row);
      }
      caller.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-fn]");
        if (!btn) return;
        const name = btn.dataset.fn;
        const row = btn.closest(".fn");
        const args = [...row.querySelectorAll("input")].map((inp) => Number(inp.value) || 0);
        try { row.querySelector(`[data-res="${CSS.escape(name)}"]`).textContent = "= " + instance.exports[name](...args); }
        catch (err) { row.querySelector(`[data-res="${CSS.escape(name)}"]`).textContent = "error: " + (err.message || err); }
      });
    }
  } catch (e) {
    $("wasm-status").innerHTML = `<span class="skip">Compiled ✓ — download above. (Your browser couldn't instantiate it: ${esc(e.message || String(e))}. WasmGC needs a recent Chrome/Firefox.)</span>`;
  }
}

// ---------------------------------------------------------------------------
// Format
// ---------------------------------------------------------------------------

function formatBuffer() {
  let program;
  try { program = parse(lex(code.value)); }
  catch { statusDiag.textContent = "format: fix syntax first"; statusDiag.className = "status-err"; return; }
  const out = formatProgram(program);
  const pos = code.selectionStart;
  code.value = out;
  code.setSelectionRange(Math.min(pos, out.length), Math.min(pos, out.length));
  onEdit();
}

// ---------------------------------------------------------------------------
// Share via URL hash
// ---------------------------------------------------------------------------

function encodeBuffer() { return btoa(unescape(encodeURIComponent(code.value))); }
function decodeHash() {
  const m = /[#&]code=([^&]+)/.exec(location.hash);
  if (!m) return null;
  try { return decodeURIComponent(escape(atob(decodeURIComponent(m[1])))); } catch { return null; }
}
async function share() {
  location.hash = "code=" + encodeURIComponent(encodeBuffer());
  const link = location.href;
  try { await navigator.clipboard.writeText(link); statusDiag.textContent = "link copied to clipboard"; statusDiag.className = "status-ok"; }
  catch { statusDiag.textContent = "link is in the address bar"; statusDiag.className = "status-ok"; }
}

// ---------------------------------------------------------------------------
// Tabs + divider
// ---------------------------------------------------------------------------

function switchTab(name) {
  for (const t of document.querySelectorAll(".tab")) t.classList.toggle("active", t.dataset.tab === name);
  for (const p of document.querySelectorAll(".panel")) p.classList.toggle("active", p.dataset.panel === name);
}
document.getElementById("tabs").addEventListener("click", (e) => {
  const t = e.target.closest(".tab");
  if (t) switchTab(t.dataset.tab);
});

(function setupDivider() {
  const divider = $("divider");
  const workspace = document.querySelector(".workspace");
  const left = $("editor-pane");
  let dragging = false;
  divider.addEventListener("mousedown", () => { dragging = true; document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; });
  window.addEventListener("mouseup", () => { dragging = false; document.body.style.cursor = ""; document.body.style.userSelect = ""; });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const rect = workspace.getBoundingClientRect();
    const pct = Math.min(0.8, Math.max(0.2, (e.clientX - rect.left) / rect.width));
    left.style.flex = `0 0 ${pct * 100}%`;
  });
})();

// ---------------------------------------------------------------------------
// Editing glue
// ---------------------------------------------------------------------------

let compileTimer = null;
function onEdit() {
  renderEditor();
  updateCaret();
  clearTimeout(compileTimer);
  compileTimer = setTimeout(() => {
    const c = compile(code.value);
    renderDiagnostics(c);
    renderEditor(); // repaint squiggles/gutter with fresh diags
  }, 140);
}

code.addEventListener("input", onEdit);
code.addEventListener("scroll", syncScroll);
code.addEventListener("keyup", updateCaret);
code.addEventListener("click", updateCaret);
code.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    const s = code.selectionStart, en = code.selectionEnd;
    code.value = code.value.slice(0, s) + "  " + code.value.slice(en);
    code.setSelectionRange(s + 2, s + 2);
    onEdit();
  } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault(); run();
  } else if (e.shiftKey && e.altKey && (e.key === "F" || e.key === "f")) {
    e.preventDefault(); formatBuffer();
  }
});

$("btn-run").addEventListener("click", run);
$("btn-format").addEventListener("click", formatBuffer);
$("btn-share").addEventListener("click", share);
targetSel.addEventListener("change", () => renderDiagnostics(compile(code.value)));

// ---------------------------------------------------------------------------
// Examples
// ---------------------------------------------------------------------------

(function populateExamples() {
  const sel = $("examples");
  for (const ex of EXAMPLES) {
    const o = document.createElement("option");
    o.value = ex.id; o.textContent = ex.label;
    sel.appendChild(o);
  }
  sel.addEventListener("change", async () => {
    const ex = EXAMPLES.find((x) => x.id === sel.value);
    sel.value = "";
    if (!ex) return;
    await loadExample(ex);
  });
})();

async function loadExample(ex) {
  let src = ex.inline;
  if (src == null && ex.path) {
    try { src = await (await fetch(new URL(ex.path, import.meta.url))).text(); }
    catch { setConsoleNote(`Could not fetch ${ex.path} — serve the playground from the repo root.`); return; }
  }
  setBuffer(src);
  run();
}

function setBuffer(src) {
  code.value = src;
  onEdit();
  code.scrollTop = 0; code.scrollLeft = 0; syncScroll();
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function boot() {
  measureMetrics();
  const fromHash = decodeHash();
  setBuffer(fromHash != null ? fromHash : WELCOME);
  // first compile + auto-run for an immediate result
  const c = compile(code.value);
  renderDiagnostics(c);
  renderEditor();
  run();
}

window.addEventListener("resize", () => { measureMetrics(); renderEditor(); });
boot();
