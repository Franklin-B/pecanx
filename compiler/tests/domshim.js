// A minimal DOM implementation — just enough of the standard API for the PecanX
// DOM runtime (create/patch/diff) to render into and dispatch events under Node.
// The runtime uses only these methods, so passing this test means the same code
// runs in a browser.

class Node {
  constructor(tag) {
    this.tag = tag;
    this.attrs = {};
    this.children = [];
    this.listeners = {};
    this.value = undefined;
    this._text = tag === "#text" ? "" : undefined;
  }
  setAttribute(k, v) { this.attrs[k] = v; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  appendChild(c) { this.children.push(c); return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; }
  replaceChild(nw, old) { const i = this.children.indexOf(old); if (i >= 0) this.children[i] = nw; return old; }
  replaceChildren(...nodes) { this.children = nodes; }
  get childNodes() { return this.children; }
  get firstChild() { return this.children[0]; }
  get textContent() {
    if (this.tag === "#text") return this._text;
    return this.children.map((c) => c.textContent).join("");
  }
  set textContent(v) {
    if (this.tag === "#text") { this._text = String(v); return; }
    const t = new Node("#text"); t._text = String(v); this.children = [t];
  }
  fire(type, ev) { for (const fn of (this.listeners[type] || [])) fn(ev); }
  find(pred) {
    if (pred(this)) return this;
    for (const c of this.children) { const r = c.find(pred); if (r) return r; }
    return null;
  }
}

export function makeDocument() {
  const root = new Node("div");
  root.attrs.id = "app";
  const document = {
    createElement: (tag) => new Node(tag),
    createTextNode: (t) => { const n = new Node("#text"); n._text = String(t); return n; },
    getElementById: (id) => (id === "app" ? root : null),
  };
  return { document, root };
}
