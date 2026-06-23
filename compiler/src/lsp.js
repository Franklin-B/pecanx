// pcx lsp — a minimal Language Server (LSP over stdio).
//
// Speaks just enough of the protocol to be useful in an editor: `initialize`,
// document open/change, and `textDocument/publishDiagnostics` driven by the same
// exhaustiveness check + Hindley-Milner type inference the CLI uses. Diagnostic
// ranges are coarse in v0.3 (parse errors carry a line/col; semantic diagnostics
// point at the file start).

import { lex, LexError } from "./lexer.js";
import { parse, ParseError } from "./parser.js";
import { check } from "./check.js";
import { inferTypesLinked } from "./types.js";

export function startLsp(io = { input: process.stdin, output: process.stdout }) {
  let buf = Buffer.alloc(0);
  const send = (msg) => { const s = JSON.stringify(msg); io.output.write(`Content-Length: ${Buffer.byteLength(s)}\r\n\r\n${s}`); };

  io.input.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const headerEnd = buf.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const m = /Content-Length:\s*(\d+)/i.exec(buf.slice(0, headerEnd).toString());
      if (!m) { buf = buf.slice(headerEnd + 4); continue; }
      const len = +m[1], start = headerEnd + 4;
      if (buf.length < start + len) return;
      const body = buf.slice(start, start + len).toString();
      buf = buf.slice(start + len);
      try { handle(JSON.parse(body)); } catch { /* ignore malformed */ }
    }
  });

  function handle(msg) {
    switch (msg.method) {
      case "initialize":
        send({ jsonrpc: "2.0", id: msg.id, result: { capabilities: { textDocumentSync: 1, diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false } }, serverInfo: { name: "pcx", version: "0.3" } } });
        return;
      case "initialized": return;
      case "textDocument/didOpen": return validate(msg.params.textDocument.uri, msg.params.textDocument.text);
      case "textDocument/didChange": return validate(msg.params.textDocument.uri, msg.params.contentChanges[msg.params.contentChanges.length - 1].text);
      case "shutdown": send({ jsonrpc: "2.0", id: msg.id, result: null }); return;
      case "exit": process.exit(0);
      default: if (msg.id != null) send({ jsonrpc: "2.0", id: msg.id, result: null });
    }
  }

  function validate(uri, text) {
    let program;
    try { program = parse(lex(text)); }
    catch (e) {
      if (e instanceof LexError || e instanceof ParseError) { const mm = /at (\d+):(\d+)/.exec(e.message || ""); publish(uri, [diag(mm ? +mm[1] - 1 : 0, mm ? +mm[2] - 1 : 0, e.message)]); return; }
      throw e;
    }
    const name = (program.decls.find((d) => d.kind === "Module") || {}).name || "Main";
    const ds = [...check(program), ...inferTypesLinked([{ name, program, file: uri }])];
    publish(uri, ds.map((d) => diag(0, 0, `[${d.code}] ${d.message}`)));
  }

  function publish(uri, diagnostics) { send({ jsonrpc: "2.0", method: "textDocument/publishDiagnostics", params: { uri, diagnostics } }); }
  function diag(line, character, message) { return { range: { start: { line, character }, end: { line, character: character + 1 } }, severity: 1, source: "pcx", message }; }
}
