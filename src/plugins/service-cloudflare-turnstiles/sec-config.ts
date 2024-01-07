import { z } from "zod";

export const secSchema = z
  .object({
    serverMode: z.boolean().default(false).describe("Server Mode"),
    turnstileJsPath: z.string().default("/cf-turnstile.js").optional().describe("The path to the turnstile.js script")
  })
  .default({}).optional();
