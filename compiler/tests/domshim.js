// A minimal DOM implementation — just enough of the standard API for the PecanX
// DOM runtime to render into and dispatch events under Node. The runtime uses
// only these methods, so passing this test means the same code runs in a browser.

class Node {
  constructor(tag) {
    this.tag = tag;
    this.attrs = {};
    this.children = [];
    this.listeners = {};
    this.value = undefined;
    this._text = undefined;
  }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  appendChild(c) { this.children.push(c); return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); }
  replaceChildren(...nodes) { this.children = nodes; }
  get firstChild() { return this.children[0]; }
  get textContent() {
    if (this._text !== undefined) return this._text;
    return this.children.map((c) => c.textContent).join("");
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
