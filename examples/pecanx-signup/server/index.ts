import express from "express";
import { signupSchema, fieldErrors } from "../shared/signup";

const app = express();
app.use(express.json());

// A stand-in "database" so the example is self-contained.
const registeredEmails = new Set<string>();
let nextId = 1;

app.post("/api/signup", (req, res) => {
  // The SAME schema the browser just ran. The client's check was a
  // courtesy for fast feedback; THIS is the authority. Never trust the
  // client — but here we don't have to re-implement anything either.
  const result = signupSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(422).json({ ok: false, errors: fieldErrors(result.error) });
  }

  // `result.data` is a SignupRequest: every field is proven valid and
  // `age` is already a number. No defensive re-checking past this point.
  const user = result.data;

  if (registeredEmails.has(user.email)) {
    return res
      .status(409)
      .json({ ok: false, errors: { email: "That email is already registered." } });
  }

  registeredEmails.add(user.email);
  const id = `user_${nextId++}`;
  console.log(`Registered ${user.email} (age ${user.age}) as ${id}`);
  return res.json({ ok: true, id });
});

const port = 3001;
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
