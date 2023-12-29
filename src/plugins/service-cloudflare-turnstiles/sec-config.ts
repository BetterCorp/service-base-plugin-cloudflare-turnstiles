import { BSBServiceConfig } from "@bettercorp/service-base";
import { z } from "zod";

export const secSchema = z
  .object({
    serverMode: z.boolean().default(false).describe("Server Mode"),
    turnstileJsPath: z.string().default("/cf-turnstile.js").optional().describe("The path to the turnstile.js script")
  })
  .default({}).optional();

export class Config extends BSBServiceConfig<typeof secSchema> {
  validationSchema = secSchema;

  migrate(
    toVersion: string,
    fromVersion: string | null,
    fromConfig: any | null
  ) {
    return fromConfig;
  }
}
