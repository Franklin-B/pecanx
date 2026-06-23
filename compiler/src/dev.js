// pcx dev — a minimal development server.
//
// Serves the entry app's real-DOM build at `/`, rebuilding on every request so a
// refresh always reflects the latest source (build-on-request). Compile errors
// are shown in the page. `/healthz` returns a liveness probe. Live-reload via a
// file watcher is left for a later iteration.

import { createServer } from "node:http";

export function startDev(file, port, buildHtml) {
  const server = createServer((req, res) => {
    if (req.url === "/healthz") { res.writeHead(200, { "content-type": "text/plain" }); res.end("ok"); return; }
    try {
      const html = buildHtml();
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
    } catch (e) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("pcx build error:\n\n" + (e && e.message ? e.message : String(e)));
    }
  });
  server.listen(port, () => console.log(`pcx dev: serving ${file} at http://localhost:${port}  (Ctrl-C to stop)`));
  return server;
}
