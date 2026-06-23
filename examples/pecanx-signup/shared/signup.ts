import { z } from "zod";

/**
 * THE shared schema.
 *
 * This file is imported UNCHANGED by both the browser client and the
 * Node server. It is the single source of truth for "what counts as a
 * valid signup". Because both sides run this exact code, client-side
 * validation (instant feedback) and server-side validation (the
 * authority) can never drift apart.
 *
 * This is the runnable, ships-today realization of the "one validate(),
 * two runtimes" idea from the language design.
 */
export const signupSchema = z
  .object({
    email: z
      .string()
      .trim()
      .min(1, "This field is required.")
      .email("That doesn't look like an email address."),

    password: z
      .string()
      .min(8, "Must be at least 8 characters.")
      .refine(
        (s) => /[A-Za-z]/.test(s) && /[0-9]/.test(s),
        "Use at least one letter and one number."
      ),

    confirm: z.string(),

    // Comes off the form as a string; ends up a validated number.
    age: z
      .string()
      .trim()
      .min(1, "This field is required.")
      .regex(/^\d+$/, "Enter your age as a whole number.")
      .transform((s) => parseInt(s, 10))
      .refine((n) => n >= 18, "You must be 18 or older."),
  })
  .refine((data) => data.password === data.confirm, {
    path: ["confirm"],
    message: "Passwords don't match.",
  });

/** Field names, used for the per-field error map. */
export type FieldName = "email" | "password" | "confirm" | "age";

/** What the form holds and what crosses the wire: all strings. */
export type RawSignup = z.input<typeof signupSchema>;

/** The trustworthy, fully-validated result. `age` is a number here. */
export type SignupRequest = z.output<typeof signupSchema>;

/** Absent key = that field is currently valid. */
export type FieldErrors = Partial<Record<FieldName, string>>;

/**
 * Collapse a ZodError into one message per field (the first one).
 * Used identically on both sides so the messages always match.
 */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in out)) {
      out[key as FieldName] = issue.message;
    }
  }
  return out;
}
