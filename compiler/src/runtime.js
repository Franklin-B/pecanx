// PecanX runtime prelude (pcx v0.3).
//
// This file is NOT imported — `pcx` reads it as text and prepends it to every
// compiled program, producing a single self-contained JS module. It therefore
// uses only plain statements (no import/export) and defines the constructors and
// standard-library modules that generated code refers to.

// --- structural equality (for == / /=) --------------------------------------
function $eq(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!$eq(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) { if (!(k in b)) return false; if (!$eq(a[k], b[k])) return false; }
  return true;
}

// --- ++ (string or list concatenation) --------------------------------------
function $concat(a, b) {
  if (typeof a === "string") return a + b;
  if (Array.isArray(a)) return a.concat(b);
  throw new Error("(++) expects two Strings or two Lists");
}

const $unit = null;

// --- built-in sum-type constructors -----------------------------------------
function Ok(_0) { return { $: "Ok", _0 }; }
function Err(_0) { return { $: "Err", _0 }; }
function Some(_0) { return { $: "Some", _0 }; }
const None = { $: "None" };
const NotAsked = { $: "NotAsked" };
const Loading = { $: "Loading" };
function Failure(_0) { return { $: "Failure", _0 }; }
function Success(_0) { return { $: "Success", _0 }; }

// --- helper for stubbed (not-yet-executable) modules ------------------------
function $stub(name) {
  return new Proxy({}, {
    get: (_t, prop) => (...args) => {
      throw new Error(
        "pcx v0.3: " + name + "." + String(prop) +
        " is not executable yet (UI/effect/FFI backends are pending — see docs/appendix-b-reference.md)"
      );
    },
  });
}

// --- minimal effect runtime: Html as data + a headless renderer -------------
function $node(tag, attrs, kids) { return { $html: tag, attrs: attrs || [], kids: kids || [] }; }
function $text(s) { return { $html: "#text", text: String(s) }; }
function $renderAttrs(attrs) {
  const parts = [];
  for (const a of attrs) {
    if (!a || a.event) continue;                 // event handlers don't render
    if (a.k === "disabled") { if (a.v) parts.push("disabled"); continue; }
    parts.push(`${a.k}="${String(a.v)}"`);
  }
  return parts.length ? " " + parts.join(" ") : "";
}
function $render(node) {
  if (node == null) return "";
  if (node.$html === "#text") return node.text;
  if (node.$html === "input" || node.$html === "br" || node.$html === "hr") {
    return `<${node.$html}${$renderAttrs(node.attrs)} />`;
  }
  return `<${node.$html}${$renderAttrs(node.attrs)}>${node.kids.map($render).join("")}</${node.$html}>`;
}

// Build a real DOM element from an Html node, wiring events to `dispatch`.
// Uses only the standard DOM API, so it runs unchanged in a browser.
function $el(node, dispatch) {
  const doc = globalThis.document;
  if (node == null) return doc.createTextNode("");
  if (node.$html === "#text") return doc.createTextNode(node.text);
  const el = doc.createElement(node.$html);
  for (const a of node.attrs) {
    if (!a) continue;
    if (a.event) {
      if (a.event === "click") el.addEventListener("click", () => dispatch(a.msg));
      else if (a.event === "input") el.addEventListener("input", (e) => dispatch(a.fn(e && e.target ? e.target.value : "")));
      else if (a.event === "submit") el.addEventListener("submit", (e) => { if (e && e.preventDefault) e.preventDefault(); dispatch(a.msg); });
      else if (a.event === "blur") el.addEventListener("blur", () => dispatch(a.msg));
    } else if (a.k === "disabled") {
      if (a.v) el.setAttribute("disabled", "");
    } else if (a.k === "value") {
      el.setAttribute("value", String(a.v));
      try { el.value = a.v; } catch {}
    } else {
      el.setAttribute(a.k, String(a.v));
    }
  }
  for (const kid of node.kids) el.appendChild($el(kid, dispatch));
  return el;
}

// --- virtual-DOM diffing (production runtime) -------------------------------
// Builds real DOM, then patches it in place against the previous virtual tree:
// unchanged element nodes keep their identity (and input focus/value), only
// changed text/attrs are touched, and a single persistent listener per event
// type dispatches the *current* handler (updated on every patch).
function $createDom(v, dispatch) {
  const doc = globalThis.document;
  if (v == null) return doc.createTextNode("");
  if (v.$html === "#text") return doc.createTextNode(v.text);
  const el = doc.createElement(v.$html);
  el.__h = {};            // current handler per event type
  el.__on = {};           // event types we've already attached a listener for
  $applyAttrs(el, [], v.attrs, dispatch);
  for (const kid of v.kids) el.appendChild($createDom(kid, dispatch));
  return el;
}

function $ensureListener(el, type, dispatch) {
  if (el.__on[type]) return;
  el.__on[type] = true;
  el.addEventListener(type, (e) => {
    const h = el.__h[type];
    if (h == null) return;
    if (type === "input") dispatch(h(e && e.target ? e.target.value : ""));
    else { if (type === "submit" && e && e.preventDefault) e.preventDefault(); dispatch(h); }
  });
}

function $applyAttrs(el, oldAttrs, newAttrs, dispatch) {
  const oldM = {}, newM = {}, seenEv = {};
  for (const a of oldAttrs) if (a && !a.event && a.k !== "key") oldM[a.k] = a.v;
  for (const a of newAttrs) if (a && !a.event && a.k !== "key") newM[a.k] = a.v;
  for (const k in newM) {
    if (oldM[k] === newM[k]) continue;
    if (k === "disabled") { if (newM[k]) el.setAttribute("disabled", ""); else el.removeAttribute("disabled"); }
    else { el.setAttribute(k, String(newM[k])); if (k === "value") { try { el.value = newM[k]; } catch {} } }
  }
  for (const k in oldM) if (!(k in newM)) el.removeAttribute(k);
  for (const a of newAttrs) {
    if (!a || !a.event) continue;
    el.__h[a.event] = a.event === "input" ? a.fn : a.msg;
    seenEv[a.event] = true;
    $ensureListener(el, a.event, dispatch);
  }
  for (const t in el.__h) if (!seenEv[t]) el.__h[t] = null;
}

function $patch(parent, dom, oldV, newV, dispatch) {
  const oldText = oldV && oldV.$html === "#text";
  const newText = newV && newV.$html === "#text";
  if (!oldV || oldText !== newText || (!oldText && oldV.$html !== newV.$html)) {
    const fresh = $createDom(newV, dispatch);
    parent.replaceChild(fresh, dom);
    return fresh;
  }
  if (newText) { if (oldV.text !== newV.text) { try { dom.textContent = newV.text; } catch { dom.data = newV.text; } } return dom; }
  $applyAttrs(dom, oldV.attrs, newV.attrs, dispatch);
  $patchKids(dom, oldV.kids, newV.kids, dispatch);
  return dom;
}

function $vkey(v) { if (!v || v.$html === "#text") return null; for (const a of v.attrs) if (a && a.k === "key") return a.v; return null; }

// Reconcile children. If the new children are all keyed (Attr.key), match by key
// so reordered/inserted/removed items reuse their DOM nodes (identity preserved
// across moves); otherwise diff positionally.
function $patchKids(parent, oldKids, newKids, dispatch) {
  const keyed = newKids.length > 0 && newKids.every((k) => $vkey(k) != null) && oldKids.some((k) => $vkey(k) != null);
  if (keyed) {
    const oldDoms = [...parent.childNodes];
    const byKey = new Map();
    oldKids.forEach((v, i) => { const k = $vkey(v); if (k != null) byKey.set(k, { v, dom: oldDoms[i] }); });
    const newDoms = newKids.map((nv) => {
      const k = $vkey(nv);
      const prev = k != null ? byKey.get(k) : null;
      if (prev) { $applyAttrs(prev.dom, prev.v.attrs, nv.attrs, dispatch); $patchKids(prev.dom, prev.v.kids, nv.kids, dispatch); byKey.delete(k); return prev.dom; }
      return $createDom(nv, dispatch);
    });
    if (parent.replaceChildren) parent.replaceChildren(...newDoms);
    else { while (parent.firstChild) parent.removeChild(parent.firstChild); for (const d of newDoms) parent.appendChild(d); }
    return;
  }
  const kids = parent.childNodes;
  const common = Math.min(oldKids.length, newKids.length);
  for (let i = 0; i < common; i++) $patch(parent, kids[i], oldKids[i], newKids[i], dispatch);
  for (let i = oldKids.length; i < newKids.length; i++) parent.appendChild($createDom(newKids[i], dispatch));
  for (let i = oldKids.length - 1; i >= newKids.length; i--) parent.removeChild(parent.childNodes[i]);
}

// --- the standard library, namespaced under $P -----------------------------
const $P = {
  Console: {
    log: (s) => { console.log(s); return $unit; },
    warn: (s) => { console.warn(s); return $unit; },
    error: (s) => { console.error(s); return $unit; },
  },

  String: {
    length: (s) => s.length,
    isEmpty: (s) => s.length === 0,
    trim: (s) => s.trim(),
    toLower: (s) => s.toLowerCase(),
    toUpper: (s) => s.toUpperCase(),
    contains: (hay, needle) => hay.includes(needle),
    startsWith: (hay, p) => hay.startsWith(p),
    endsWith: (hay, p) => hay.endsWith(p),
    split: (sep, s) => s.split(sep),
    join: (sep, list) => list.join(sep),
    slice: (a, b, s) => s.slice(a, b),
    replace: (target, repl, s) => s.split(target).join(repl),
    toList: (s) => Array.from(s),
  },

  Int: {
    parse: (s) => { const t = String(s).trim(); return /^[+-]?\d+$/.test(t) ? Some(parseInt(t, 10)) : None; },
    toString: (n) => String(n),
    toFloat: (n) => n,
    abs: (n) => Math.abs(n),
    min: (a, b) => Math.min(a, b),
    max: (a, b) => Math.max(a, b),
    clamp: (lo, hi, x) => Math.min(hi, Math.max(lo, x)),
  },

  Float: {
    parse: (s) => { const t = String(s).trim(); const n = Number(t); return t !== "" && !Number.isNaN(n) ? Some(n) : None; },
    toString: (x) => { const s = String(x); return s.includes(".") || s.includes("e") ? s : s + ".0"; },
    round: (x) => Math.round(x),
    floor: (x) => Math.floor(x),
    ceil: (x) => Math.ceil(x),
    sqrt: (x) => Math.sqrt(x),
    abs: (x) => Math.abs(x),
  },

  List: {
    length: (xs) => xs.length,
    isEmpty: (xs) => xs.length === 0,
    map: (f, xs) => xs.map((x) => f(x)),
    filter: (p, xs) => xs.filter((x) => p(x)),
    foldl: (f, init, xs) => { let acc = init; for (const x of xs) acc = f(x, acc); return acc; },
    find: (p, xs) => { const r = xs.find((x) => p(x)); return r === undefined ? None : Some(r); },
    any: (p, xs) => xs.some((x) => p(x)),
    all: (p, xs) => xs.every((x) => p(x)),
    head: (xs) => (xs.length ? Some(xs[0]) : None),
    last: (xs) => (xs.length ? Some(xs[xs.length - 1]) : None),
    reverse: (xs) => [...xs].reverse(),
    append: (a, b) => a.concat(b),
    range: (a, b) => { const out = []; for (let i = a; i <= b; i++) out.push(i); return out; },
    sortBy: (f, xs) => [...xs].sort((a, b) => { const ka = f(a), kb = f(b); return ka < kb ? -1 : ka > kb ? 1 : 0; }),
    each: (f, xs) => { for (const x of xs) f(x); return $unit; },
  },

  Option: {
    map: (f, o) => (o.$ === "Some" ? Some(f(o._0)) : o),
    andThen: (f, o) => (o.$ === "Some" ? f(o._0) : o),
    withDefault: (d, o) => (o.$ === "Some" ? o._0 : d),
    toResult: (e, o) => (o.$ === "Some" ? Ok(o._0) : Err(e)),
    isSome: (o) => o.$ === "Some",
    isNone: (o) => o.$ === "None",
  },

  Result: {
    map: (f, r) => (r.$ === "Ok" ? Ok(f(r._0)) : r),
    mapErr: (f, r) => (r.$ === "Err" ? Err(f(r._0)) : r),
    andThen: (f, r) => (r.$ === "Ok" ? f(r._0) : r),
    withDefault: (d, r) => (r.$ === "Ok" ? r._0 : d),
    map2: (a, b, f) => (a.$ !== "Ok" ? a : b.$ !== "Ok" ? b : Ok(f(a._0, b._0))),
    map3: (a, b, c, f) => (a.$ !== "Ok" ? a : b.$ !== "Ok" ? b : c.$ !== "Ok" ? c : Ok(f(a._0, b._0, c._0))),
    map4: (a, b, c, d, f) => (a.$ !== "Ok" ? a : b.$ !== "Ok" ? b : c.$ !== "Ok" ? c : d.$ !== "Ok" ? d : Ok(f(a._0, b._0, c._0, d._0))),
    map5: (a, b, c, d, e, f) => (a.$ !== "Ok" ? a : b.$ !== "Ok" ? b : c.$ !== "Ok" ? c : d.$ !== "Ok" ? d : e.$ !== "Ok" ? e : Ok(f(a._0, b._0, c._0, d._0, e._0))),
    all: (list) => { const out = []; for (const r of list) { if (r.$ !== "Ok") return r; out.push(r._0); } return Ok(out); },
    toOption: (r) => (r.$ === "Ok" ? Some(r._0) : None),
  },

  Char: {
    isAlpha: (c) => /^[A-Za-z]$/.test(c),
    isDigit: (c) => /^[0-9]$/.test(c),
  },

  // --- view layer (renders to a string in the headless v0.3 runtime) --------
  Html: {
    div: (a, k) => $node("div", a, k),
    span: (a, k) => $node("span", a, k),
    p: (a, k) => $node("p", a, k),
    button: (a, k) => $node("button", a, k),
    ul: (a, k) => $node("ul", a, k),
    li: (a, k) => $node("li", a, k),
    label: (a, k) => $node("label", a, k),
    input: (a) => $node("input", a, []),
    text: (s) => $text(s),
    empty: $text(""),
  },
  Attr: {
    class: (v) => ({ k: "class", v }),
    id: (v) => ({ k: "id", v }),
    value: (v) => ({ k: "value", v }),
    placeholder: (v) => ({ k: "placeholder", v }),
    type_: (v) => ({ k: "type", v }),
    disabled: (v) => ({ k: "disabled", v }),
    key: (v) => ({ k: "key", v }), // reconciliation key (not rendered)
  },
  Event: {
    onClick: (msg) => ({ event: "click", msg }),
    onInput: (fn) => ({ event: "input", fn }),
    onSubmit: (msg) => ({ event: "submit", msg }),
    onBlur: (msg) => ({ event: "blur", msg }),
  },

  // --- effects as data ------------------------------------------------------
  Cmd: {
    none: { tag: "none" },
    batch: (cmds) => ({ tag: "batch", cmds }),
  },
  // Server.call takes the (already-evaluated) server-fn Result and tags it.
  Server: { call: (value, toMsg) => ({ tag: "perform", value, toMsg }) },
  // Asynchronous, networked effects: an `async` Cmd carries a thunk returning a
  // Promise; the DOM runtime dispatches `toMsg(result)` when it resolves.
  Http: {
    get: (url, toMsg) => ({ tag: "async", toMsg, run: () => fetch(url).then((r) => r.json()).then((d) => Ok(d), () => Err({ $: "NetworkError" })) }),
    post: (url, body, toMsg) => ({ tag: "async", toMsg, run: () => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).then((d) => Ok(d), () => Err({ $: "NetworkError" })) }),
  },
  Nav: { push: (_url) => ({ tag: "none" }) },

  // In-memory database stub so `server fn` bodies execute end-to-end.
  Db: {
    query: (_sql) => Ok([{ id: 1, name: "Ada" }, { id: 2, name: "Linus" }]),
    emailExists: (_e) => false,
    insertUser: (_u) => Ok("user_1"),
    findUser: (_id) => None,
    errorToString: (e) => String(e),
  },

  // The headless Elm-style driver. Scripts a list of Msgs through update/view,
  // printing the rendered view after init and after every step; runs Cmds
  // synchronously (a `perform` Cmd dispatches its tagged Msg).
  Program: {
    // Headless driver: scripts `msgs` through update/view, printing the
    // rendered view. Synchronous Cmds (`perform`) run; `async` Cmds are skipped
    // (use Program.mount in a browser for those).
    run: (init, update, view, msgs) => {
      let model;
      const render = () => { console.log($render(view(model))); };
      const step = (cmd) => {
        if (!cmd || cmd.tag === "none") return;
        if (cmd.tag === "batch") { for (const c of cmd.cmds) step(c); return; }
        if (cmd.tag === "perform") { dispatch(cmd.toMsg(cmd.value)); return; }
      };
      const dispatch = (msg) => { const r = update(msg, model); model = r[0]; render(); step(r[1]); };
      const i = init(); model = i[0]; render(); step(i[1]);
      for (const m of (msgs || [])) dispatch(m);
      return $unit;
    },
    // Real-DOM driver: mounts to a DOM element, wires events, re-renders on every
    // update, and performs async Cmds (Http/Time) via Promises. Runs in a browser.
    mount: (root, init, update, view) => {
      let model, tree, dom;
      const step = (cmd) => {
        if (!cmd || cmd.tag === "none") return;
        if (cmd.tag === "batch") { for (const c of cmd.cmds) step(c); return; }
        if (cmd.tag === "perform") { dispatch(cmd.toMsg(cmd.value)); return; }
        if (cmd.tag === "async") { Promise.resolve(cmd.run()).then((v) => dispatch(cmd.toMsg(v))); return; }
      };
      const dispatch = (msg) => {
        const r = update(msg, model); model = r[0];
        const next = view(model);
        dom = $patch(root, dom, tree, next, dispatch); // diff & patch in place
        tree = next;
        step(r[1]);
      };
      const i = init(); model = i[0];
      tree = view(model);
      dom = $createDom(tree, dispatch);
      root.appendChild(dom);
      step(i[1]);
      return $unit;
    },
  },

  Time: { delay: (ms, toMsg) => ({ tag: "async", toMsg, run: () => new Promise((res) => setTimeout(() => res($unit), ms)) }) },
  Random: $stub("Random"),
  Decode: $stub("Decode"),
  Json: $stub("Json"),
};
