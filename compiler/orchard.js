#!/usr/bin/env node
// orchard — the PecanX package manager (v0.3, local file-based registry).
//
//   orchard add <name> [--registry <dir>] [--path <dir>] [--manifest <file>]
//   orchard install [--registry <dir>]      resolve every dependency in pecanx.toml
//   orchard list                            show installed packages
//
// Packages install into ./orchard_modules/<name>/, which the pcx linker already
// scans — so an installed package's modules resolve automatically. A "registry"
// is just a directory whose subfolders are packages. (A networked registry,
// version solving, and lockfiles are future work.)

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, cpSync } from "node:fs";
import { resolve, join } from "node:path";

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (n) => { const i = args.indexOf(n); return i !== -1 ? args[i + 1] : null; };
const MANIFEST = resolve(flag("--manifest") || "pecanx.toml");
const REGISTRY = resolve(flag("--registry") || process.env.ORCHARD_REGISTRY || "registry");
const MODULES = resolve("orchard_modules");

function pkgVersion(dir) {
  try { const m = /version\s*=\s*"([^"]+)"/.exec(readFileSync(join(dir, "pecanx.toml"), "utf8")); return m ? m[1] : null; } catch { return null; }
}

function readManifest() { return existsSync(MANIFEST) ? readFileSync(MANIFEST, "utf8") : '[package]\nname = "app"\nversion = "0.1.0"\n'; }

function readDeps(text) {
  const deps = {};
  const lines = text.split(/\r?\n/);
  let inDeps = false;
  for (const line of lines) {
    const sec = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (sec) { inDeps = sec[1] === "dependencies"; continue; }
    if (!inDeps) continue;
    const m = /^\s*([A-Za-z0-9_.\-]+)\s*=\s*(.+?)\s*$/.exec(line);
    if (m) deps[m[1]] = m[2];
  }
  return deps;
}

function setDep(text, name, value) {
  const lines = text.split(/\r?\n/);
  let depStart = -1, depEnd = lines.length, replaced = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*\[dependencies\]\s*$/.test(lines[i])) { depStart = i; for (let j = i + 1; j < lines.length; j++) { if (/^\s*\[/.test(lines[j])) { depEnd = j; break; } } break; }
  }
  if (depStart === -1) { const t = text.replace(/\s*$/, ""); return t + `\n\n[dependencies]\n${name} = ${value}\n`; }
  for (let i = depStart + 1; i < depEnd; i++) { if (new RegExp(`^\\s*${name}\\s*=`).test(lines[i])) { lines[i] = `${name} = ${value}`; replaced = true; break; } }
  if (!replaced) lines.splice(depEnd, 0, `${name} = ${value}`);
  return lines.join("\n");
}

function install(name, srcDir) {
  if (!existsSync(srcDir)) { console.error(`orchard: package "${name}" not found at ${srcDir}`); process.exit(1); }
  mkdirSync(MODULES, { recursive: true });
  cpSync(srcDir, join(MODULES, name), { recursive: true });
}

function add(name) {
  const path = flag("--path");
  const srcDir = path ? resolve(path) : join(REGISTRY, name);
  install(name, srcDir);
  const version = pkgVersion(srcDir) || "1.0.0";
  const value = path ? `{ path = "${path}" }` : `"${version}"`;
  writeFileSync(MANIFEST, setDep(readManifest(), name, value));
  console.log(`✓ added ${name} ${path ? `(path ${path})` : version} → orchard_modules/${name}`);
}

function installAll() {
  const deps = readDeps(readManifest());
  const names = Object.keys(deps);
  for (const name of names) {
    const v = deps[name];
    const pm = /path\s*=\s*"([^"]+)"/.exec(v);
    install(name, pm ? resolve(pm[1]) : join(REGISTRY, name));
  }
  console.log(`✓ installed ${names.length} package(s): ${names.join(", ") || "(none)"}`);
}

function list() {
  if (!existsSync(MODULES)) { console.log("(no packages installed)"); return; }
  for (const n of readdirSync(MODULES)) console.log(`${n} ${pkgVersion(join(MODULES, n)) || ""}`.trim());
}

switch (cmd) {
  case "add": if (!args[1]) { console.error("orchard: usage: orchard add <name>"); process.exit(1); } add(args[1]); break;
  case "install": installAll(); break;
  case "list": list(); break;
  default:
    console.log(`orchard — the PecanX package manager (v0.3)

usage:
  orchard add <name> [--registry <dir>] [--path <dir>]   install a package + record it
  orchard install [--registry <dir>]                     install all pecanx.toml dependencies
  orchard list                                           list installed packages
`);
    process.exit(cmd ? 1 : 0);
}
