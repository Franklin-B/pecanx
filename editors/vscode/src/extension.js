// PecanX VS Code extension.
//
// Two halves:
//   1. The language server — spawns `pcx lsp` (the server we ship in compiler/)
//      and surfaces its diagnostics, hover, and outline live as you type.
//   2. Commands — Run / Build (JS·Wasm·DOM) / Check / Dev-server run pcx in a
//      shared integrated terminal; Format pipes the buffer through `pcx fmt`.
//
// The compiler is located in this order: the `pecanx.compilerPath` setting, then
// an upward search for `compiler/pcx.js` from the active file, then `pcx` on PATH.

const vscode = require("vscode");
const cp = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

let client = null;        // the running LanguageClient, or null
let terminal = null;      // shared "PecanX" terminal
let output = null;        // shared output channel for diagnostics-side messages
let formatterDisposable = null; // the fallback `pcx fmt` formatter, when registered

function log(msg) {
  if (!output) output = vscode.window.createOutputChannel("PecanX");
  output.appendLine(msg);
}

// --- compiler resolution -----------------------------------------------------

// Returns { kind: "node"|"bin", node, script, bin, cwd } describing how to
// invoke pcx, or null if nothing usable was found.
function resolveCompiler(doc) {
  const cfg = vscode.workspace.getConfiguration("pecanx");
  const nodePath = cfg.get("nodePath") || "node";
  const explicit = (cfg.get("compilerPath") || "").trim();

  if (explicit) {
    if (explicit.endsWith(".js")) return { kind: "node", node: nodePath, script: explicit, cwd: path.dirname(explicit) };
    return { kind: "bin", bin: explicit, cwd: undefined };
  }

  // Search upward from the active document (or the first workspace folder).
  const startDirs = [];
  if (doc && doc.uri && doc.uri.scheme === "file") startDirs.push(path.dirname(doc.uri.fsPath));
  for (const f of vscode.workspace.workspaceFolders || []) startDirs.push(f.uri.fsPath);
  for (const start of startDirs) {
    let dir = start;
    for (;;) {
      const candidate = path.join(dir, "compiler", "pcx.js");
      if (fs.existsSync(candidate)) return { kind: "node", node: nodePath, script: candidate, cwd: path.dirname(candidate) };
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }

  // Fall back to a `pcx` binary on PATH.
  return { kind: "bin", bin: "pcx", cwd: undefined };
}

// Build the argv (command + args) to run pcx with the given pcx-level arguments.
function pcxCommand(inv, args) {
  if (inv.kind === "node") return { command: inv.node, args: [inv.script, ...args] };
  return { command: inv.bin, args };
}

// Quote a single shell argument for the integrated terminal.
function shq(s) {
  if (process.platform === "win32") return /[\s"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  return /[^A-Za-z0-9_/.:=@-]/.test(s) ? `'${s.replace(/'/g, "'\\''")}'` : s;
}

// --- running pcx -------------------------------------------------------------

function getTerminal() {
  if (terminal && terminal.exitStatus === undefined) return terminal;
  terminal = vscode.window.createTerminal("PecanX");
  return terminal;
}

// Run a pcx subcommand in the shared terminal, operating on the active .px file.
async function runInTerminal(args, { needsFile = true } = {}) {
  const editor = vscode.window.activeTextEditor;
  const doc = editor && editor.document;
  if (needsFile) {
    if (!doc || doc.languageId !== "pecanx") {
      vscode.window.showErrorMessage("PecanX: open a .px file first.");
      return;
    }
    if (doc.isUntitled) {
      vscode.window.showErrorMessage("PecanX: save the file before running pcx.");
      return;
    }
    if (doc.isDirty) await doc.save();
  }
  const inv = resolveCompiler(doc);
  const file = doc ? doc.uri.fsPath : "";
  const fullArgs = needsFile ? [...args, file] : args;
  const { command, args: cmdArgs } = pcxCommand(inv, fullArgs);
  const line = [command, ...cmdArgs].map(shq).join(" ");
  const term = getTerminal();
  term.show(true);
  term.sendText(line);
}

// Run pcx and capture its output (used by the formatter).
function runCapture(inv, args, cwd) {
  return new Promise((resolve) => {
    const { command, args: cmdArgs } = pcxCommand(inv, args);
    cp.execFile(command, cmdArgs, { cwd, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ code: err && typeof err.code === "number" ? err.code : err ? 1 : 0, stdout: stdout || "", stderr: stderr || "" });
    });
  });
}

// --- formatting --------------------------------------------------------------

// `pcx fmt` reads a file path, so we format the live (possibly unsaved) buffer by
// writing it to a temp .px file, formatting that, and returning the result.
async function formatDocument(document) {
  const inv = resolveCompiler(document);
  const tmp = path.join(os.tmpdir(), `pcx-fmt-${process.pid}-${Date.now()}.px`);
  try {
    fs.writeFileSync(tmp, document.getText());
    const { code, stdout, stderr } = await runCapture(inv, ["fmt", tmp], inv.cwd);
    if (code !== 0) {
      log(`format failed: ${(stderr || stdout).trim()}`);
      vscode.window.setStatusBarMessage("PecanX: format failed (syntax error?)", 4000);
      return [];
    }
    const full = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
    return [vscode.TextEdit.replace(full, stdout)];
  } catch (e) {
    log(`format error: ${e && e.message ? e.message : e}`);
    return [];
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

// --- language server ---------------------------------------------------------

function startServer(context) {
  const cfg = vscode.workspace.getConfiguration("pecanx");
  if (!cfg.get("server.enabled")) return;

  let lc;
  try {
    lc = require("vscode-languageclient/node");
  } catch (e) {
    vscode.window.showWarningMessage(
      "PecanX: the language server needs its dependencies. Run `npm install` in the extension folder to enable live diagnostics. (Commands still work.)"
    );
    log(`vscode-languageclient not available: ${e && e.message}`);
    return;
  }

  const inv = resolveCompiler(vscode.window.activeTextEditor && vscode.window.activeTextEditor.document);
  const { command, args } = pcxCommand(inv, ["lsp"]);
  const executable = { command, args, options: { cwd: inv.cwd }, transport: lc.TransportKind.stdio };

  const serverOptions = { run: executable, debug: executable };
  const clientOptions = {
    documentSelector: [
      { scheme: "file", language: "pecanx" },
      { scheme: "untitled", language: "pecanx" },
    ],
    outputChannel: output || (output = vscode.window.createOutputChannel("PecanX")),
  };

  client = new lc.LanguageClient("pecanx", "PecanX Language Server", serverOptions, clientOptions);
  client.start().then(
    () => log(`language server started (${command} ${args.join(" ")})`),
    (err) => {
      vscode.window.showErrorMessage(`PecanX: failed to start the language server. Check 'pecanx.compilerPath' / 'pecanx.nodePath'. (${err && err.message ? err.message : err})`);
      log(`language server failed: ${err && err.message ? err.message : err}`);
      client = null;
    }
  );
  if (client) context.subscriptions.push(client);
}

async function stopServer() {
  if (!client) return;
  try { await client.stop(); } catch { /* ignore */ }
  client = null;
}

// --- activation --------------------------------------------------------------

function activate(context) {
  output = vscode.window.createOutputChannel("PecanX");
  log("PecanX extension activated.");

  startServer(context);

  const reg = (id, fn) => context.subscriptions.push(vscode.commands.registerCommand(id, fn));
  reg("pecanx.run", () => runInTerminal(["run"]));
  reg("pecanx.buildJs", () => runInTerminal(["build", "--target", "js"]));
  reg("pecanx.buildWasm", () => runInTerminal(["build", "--target", "wasm"]));
  reg("pecanx.buildDom", () => runInTerminal(["build", "--target", "dom"]));
  reg("pecanx.check", () => runInTerminal(["check"]));
  reg("pecanx.checkTypes", () => runInTerminal(["check", "--types"]));
  reg("pecanx.dev", () => runInTerminal(["dev"]));
  reg("pecanx.format", async () => {
    const ed = vscode.window.activeTextEditor;
    if (ed && ed.document.languageId === "pecanx") await vscode.commands.executeCommand("editor.action.formatDocument");
  });
  reg("pecanx.restartServer", async () => {
    await stopServer();
    startServer(context);
    vscode.window.setStatusBarMessage("PecanX: language server restarted", 3000);
  });

  // The language server provides formatting via `textDocument/formatting`, so the
  // standalone `pcx fmt` formatter is registered only when the server is disabled —
  // kept in sync below if `server.enabled` changes at runtime.
  syncFormatter(context);

  // Restart the server and reconcile the formatter when relevant settings change.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("pecanx.compilerPath") || e.affectsConfiguration("pecanx.nodePath") || e.affectsConfiguration("pecanx.server.enabled")) {
        stopServer().then(() => startServer(context));
      }
      if (e.affectsConfiguration("pecanx.server.enabled")) syncFormatter(context);
    })
  );
}

// Register the fallback `pcx fmt` formatter iff the language server is disabled
// (the server provides formatting itself), disposing it otherwise — so VS Code
// never sees two competing formatters, even as the setting toggles at runtime.
function syncFormatter(context) {
  const serverEnabled = vscode.workspace.getConfiguration("pecanx").get("server.enabled");
  if (serverEnabled) {
    if (formatterDisposable) { formatterDisposable.dispose(); formatterDisposable = null; }
    return;
  }
  if (formatterDisposable) return; // already registered
  formatterDisposable = vscode.languages.registerDocumentFormattingEditProvider(
    [{ scheme: "file", language: "pecanx" }, { scheme: "untitled", language: "pecanx" }],
    { provideDocumentFormattingEdits: (document) => formatDocument(document) }
  );
  context.subscriptions.push(formatterDisposable);
}

function deactivate() {
  return stopServer();
}

module.exports = { activate, deactivate };
