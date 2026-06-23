import {
  signupSchema,
  fieldErrors,
  type RawSignup,
  type FieldName,
  type FieldErrors,
} from "../shared/signup";
import "./styles.css";

/* ------------------------------------------------------------------ *
 * A tiny Elm-style runtime: Model / Msg / update / view.
 * It mirrors the language design — state is immutable, every update
 * returns a fresh Model, side effects (the HTTP POST) are fired by the
 * runtime, not buried inside update().
 * ------------------------------------------------------------------ */

type Status =
  | { kind: "editing" }
  | { kind: "submitting" }
  | { kind: "success"; id: string };

type Model = {
  form: RawSignup;
  errors: FieldErrors;
  status: Status;
};

type Msg =
  | { type: "changed"; field: FieldName; value: string }
  | { type: "submit" }
  | { type: "ok"; id: string }
  | { type: "rejected"; errors: FieldErrors };

const init: Model = {
  form: { email: "", password: "", confirm: "", age: "" },
  errors: {},
  status: { kind: "editing" },
};

// Live validation — the SAME schema the server uses as its authority.
function liveErrors(form: RawSignup): FieldErrors {
  const result = signupSchema.safeParse(form);
  return result.success ? {} : fieldErrors(result.error);
}

function update(model: Model, msg: Msg): Model {
  switch (msg.type) {
    case "changed": {
      const form = { ...model.form, [msg.field]: msg.value };
      return { ...model, form, errors: liveErrors(form) };
    }
    case "submit": {
      const errors = liveErrors(model.form);
      if (Object.keys(errors).length > 0) {
        return { ...model, errors }; // block submit; show what's wrong
      }
      return { ...model, errors: {}, status: { kind: "submitting" } };
    }
    case "ok":
      return { ...model, status: { kind: "success", id: msg.id } };
    case "rejected":
      return { ...model, errors: msg.errors, status: { kind: "editing" } };
  }
}

/* ------------------------------- view ----------------------------- */

const FIELDS: { name: FieldName; label: string; type: string }[] = [
  { name: "email", label: "Email", type: "text" },
  { name: "password", label: "Password", type: "password" },
  { name: "confirm", label: "Confirm password", type: "password" },
  { name: "age", label: "Age", type: "text" },
];

const root = document.getElementById("app")!;
const inputs: Partial<Record<FieldName, HTMLInputElement>> = {};
const errorEls: Partial<Record<FieldName, HTMLParagraphElement>> = {};
let button!: HTMLButtonElement;
let banner!: HTMLParagraphElement;

let model = init;

function dispatch(msg: Msg): void {
  model = update(model, msg);
  paint();

  // The one side effect: after a clean submit, fire the request.
  if (msg.type === "submit" && model.status.kind === "submitting") {
    void submit(model.form);
  }
}

async function submit(form: RawSignup): Promise<void> {
  try {
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (data.ok) dispatch({ type: "ok", id: data.id });
    else dispatch({ type: "rejected", errors: data.errors ?? {} });
  } catch {
    dispatch({ type: "rejected", errors: { email: "Network error — is the API running?" } });
  }
}

function build(): void {
  const formEl = document.createElement("form");
  formEl.noValidate = true; // we do our own validation
  formEl.addEventListener("submit", (e) => {
    e.preventDefault();
    dispatch({ type: "submit" });
  });

  for (const f of FIELDS) {
    const wrap = document.createElement("div");
    wrap.className = "field";

    const label = document.createElement("label");
    label.textContent = f.label;
    label.htmlFor = f.name;

    const input = document.createElement("input");
    input.id = f.name;
    input.type = f.type;
    input.autocomplete = "off";
    input.addEventListener("input", () =>
      dispatch({ type: "changed", field: f.name, value: input.value })
    );

    const err = document.createElement("p");
    err.className = "error";

    wrap.append(label, input, err);
    formEl.append(wrap);
    inputs[f.name] = input;
    errorEls[f.name] = err;
  }

  button = document.createElement("button");
  button.type = "submit";
  button.textContent = "Create account";
  formEl.append(button);

  banner = document.createElement("p");
  banner.className = "banner";

  root.append(formEl, banner);
}

// Repaint only the parts that change — never recreate inputs, so focus
// and caret position survive per-keystroke validation.
function paint(): void {
  for (const f of FIELDS) {
    const msg = model.errors[f.name] ?? "";
    errorEls[f.name]!.textContent = msg;
    inputs[f.name]!.classList.toggle("invalid", msg !== "");
  }

  button.disabled = model.status.kind === "submitting";

  switch (model.status.kind) {
    case "editing":
      banner.textContent = "";
      banner.className = "banner";
      break;
    case "submitting":
      banner.textContent = "Submitting…";
      banner.className = "banner";
      break;
    case "success":
      banner.textContent = `✓ Account created. Your id is ${model.status.id}.`;
      banner.className = "banner ok";
      break;
  }
}

build();
paint();
