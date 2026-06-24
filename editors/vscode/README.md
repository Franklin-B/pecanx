# PecanX for VS Code

Write and compile [PecanX](../../README.md) without leaving the editor.

- **Live diagnostics** — exhaustiveness (`PX0001`), the `?` guard (`PX0100`), and
  whole-program Hindley-Milner type errors (`PX0200`) underline the exact `match`,
  declaration, or operator they refer to, as you type. Powered by `pcx lsp`.
- **Hover** — docs for keywords and stdlib modules, and the signature of any
  top-level function or type in the file.
- **Outline / breadcrumbs** — functions, types (with their variants/fields),
  opaque types, and top-level lets.
- **Syntax highlighting** for `.px`, including string interpolation and `@`-annotations.
- **Commands** (Command Palette → "PecanX:", editor title-bar ▶, right-click menu):
  Run · Build → JavaScript · Build → WebAssembly · Build → DOM (HTML) ·
  Check · Check (with types) · Start Dev Server · Format Document.
- **Formatting** via `pcx fmt` — works on unsaved buffers (Shift+Alt+F).
- **Snippets** — `module`, `fn`, `parse`, `type`, `record`, `match`, `app`, …

## Requirements

The extension drives the `pcx` compiler that lives in this repo (`compiler/pcx.js`),
which needs **Node.js** on your machine. It finds the compiler automatically:

1. the `pecanx.compilerPath` setting, if set;
2. otherwise an upward search for `compiler/pcx.js` from the file you're editing
   (so opening this repo just works);
3. otherwise a `pcx` executable on your `PATH`.

## Install (from source)

```bash
cd editors/vscode
npm install          # pulls in vscode-languageclient (for the LSP)
```

Then either:

- **Run it live:** open `editors/vscode` in VS Code and press <kbd>F5</kbd> to launch
  an Extension Development Host with PecanX loaded, or
- **Package a .vsix:** `npx @vscode/vsce package` and install the resulting file via
  *Extensions → ⋯ → Install from VSIX…*.

Open any `.px` file (try `examples/counter/Main.px`) and you'll get squiggles,
hover, and the PecanX commands.

> Live diagnostics need `npm install` to have been run (for `vscode-languageclient`).
> If you skip it, syntax highlighting, snippets, and all the Run/Build/Format
> commands still work — you just won't get inline squiggles.

## Settings

| Setting | Default | Description |
|---|---|---|
| `pecanx.compilerPath` | `""` | Absolute path to `pcx.js` or a `pcx` binary. Empty = auto-detect. |
| `pecanx.nodePath` | `node` | Node executable used to run `pcx.js` and the language server. |
| `pecanx.server.enabled` | `true` | Run the `pcx` language server. |
| `pecanx.trace.server` | `off` | Trace LSP traffic (`off` / `messages` / `verbose`). |

## How it works

The server half is just `pcx lsp` speaking LSP over stdio — the same checker the
CLI uses, so the editor and `pcx check --types` never disagree. The command half
shells out to `pcx run` / `pcx build` / `pcx dev` in a shared **PecanX** terminal,
and formatting pipes your buffer through `pcx fmt`.
