# PecanX Playground

The PecanX compiler — `pcx` — running **entirely in your browser**. No install, no
server round-trips: the lexer, parser, exhaustiveness checker, Hindley-Milner type
inference, and the JavaScript / WebAssembly / DOM backends all run client-side,
because they're pure zero-dependency ES modules.

![targets: JS · DOM · Wasm](https://img.shields.io/badge/targets-JS·DOM·Wasm-c98a3a)

## Run it

ES-module imports need to be served over HTTP (not opened as a `file://`), so start
the bundled static server from the repo root:

```bash
node playground/serve.mjs
# → http://localhost:5173/playground/
```

(Any static server rooted at the repo works, e.g. `npx serve` or
`python -m http.server` — the page just needs `../compiler/` and `../examples/`
reachable as siblings.)

## What it does

- **Live diagnostics** — exhaustiveness (`PX0001`), misplaced `?` (`PX0101`), and
  whole-program type errors (`PX0200`) appear as red squiggles and in the Problems
  tab as you type, with precise line/column ranges. Same checker as `pcx check --types`.
- **Run** (Ctrl/Cmd + Enter) — auto-detects the target:
  - a program with `init`/`update`/`view` mounts as a **live DOM app** in the Preview tab;
  - a program with `main` runs and its `Console.log` output streams to the **Console** tab;
  - a pure numeric / record / sum-type program compiles to **WebAssembly** — the Wasm
    tab shows the real module (size, exports), lets you download the `.wasm`, and (on a
    WasmGC-capable browser) call its integer exports right there.
  - Override the auto choice with the target selector.
- **JS tab** — the exact JavaScript `pcx build` would emit.
- **Format** (Shift+Alt+F) — runs the real `pcx fmt`.
- **Share** — encodes your buffer into the URL so you can send a link.
- **Download** — saves the current buffer as a `.px` file.
- **New / theme / help** — reset to the welcome program, toggle light/dark, or open
  an about-and-shortcuts dialog. Your buffer and theme persist in `localStorage`.
- **Examples** — Counter (DOM), a live input form (DOM), the `?` operator
  (`Result`/`Option`), isomorphic validation (console), sum types and numeric code (Wasm).

## How it's wired

```
playground.js  ──imports──►  ../compiler/src/{lexer,parser,check,types,codegen,wasm,format}.js
               ──fetch────►  ../compiler/src/runtime.js   (prepended to compiled output)
               ──iframe───►  sandboxed execution (allow-scripts), console piped back via postMessage
```

Everything executes in a `sandbox="allow-scripts"` iframe, so the page itself is
never affected by the code you run.

## Build & deploy

`playground/build.mjs` assembles a **self-contained static site** into `dist/` —
the landing page, the IDE, and a copy of the browser-safe compiler modules and the
example sources, mirroring the repo layout so every relative import still resolves.
No bundler, no dependencies.

```bash
npm run build                      # → dist/  (node playground/build.mjs)
npm run preview                    # serve the built site (node playground/serve.mjs dist)
# → http://localhost:5173/
```

`dist/` is a plain static folder; deploy it to any host. Configs are included for
**Vercel** (`vercel.json`), **Netlify** (`netlify.toml`), and **GitHub Pages**
(`.github/workflows/pages.yml`) — each runs `node playground/build.mjs` and
publishes `dist/`. The example loader is path-driven, so new examples added to the
`EXAMPLES` list in `playground.js` are bundled automatically.
