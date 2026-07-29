import { z } from "zod";

// ---------------------------------------------------------------------------
// Environment variables
// ---------------------------------------------------------------------------

export const EnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .url("DATABASE_URL must be a valid URL"),
  BRAIN_VAULT_PATH: z
    .string()
    .min(1, "BRAIN_VAULT_PATH is required")
    .refine((p) => p.startsWith("/"), {
      message: "BRAIN_VAULT_PATH must be an absolute path",
    }),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(5001),
});

export type Env = z.infer<typeof EnvSchema>;

/** Parse and validate process.env. Throws on missing/invalid values. */
export function parseEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    const messages = result.error.errors
      .map((e) => `  ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${messages}`);
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// POST /distill — request payload
// ---------------------------------------------------------------------------

const TextInputSchema = z.object({
  input_type: z.literal("text"),
  text: z.string().min(1, "text must not be empty"),
  session_id: z.string().uuid().optional(),
});

const AudioInputSchema = z.object({
  input_type: z.literal("audio"),
  session_id: z.string().uuid().optional(),
});

export const DistillPayloadSchema = z.discriminatedUnion("input_type", [
  TextInputSchema,
  AudioInputSchema,
]);

export type DistillPayload = z.infer<typeof DistillPayloadSchema>;

// ---------------------------------------------------------------------------
// POST /distill — success response shape
// ---------------------------------------------------------------------------

export const DistillResponseSchema = z.object({
  session_id: z.string().uuid(),
  response_type: z.enum(["clarify", "final"]),
  assistant_message: z.string(),
  turn_index: z.number().int().nonnegative(),
  is_complete: z.boolean(),
  final_markdown: z.string().nullable(),
  final_title: z.string().nullable(),
  milestone: z.string().nullable(),
});

export type DistillResponse = z.infer<typeof DistillResponseSchema>;
