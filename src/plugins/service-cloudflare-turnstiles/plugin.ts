import {
  BSBPluginConfig,
  BSBPluginEvents,
  BSBService,
  BSBServiceConstructor,
  ServiceEventsBase,
} from "@bettercorp/service-base";
import { Fastify } from "@bettercorp/service-base-plugin-fastify";
import { Tools } from "@bettercorp/tools/lib/Tools";
import { z } from "zod";
import { randomUUID } from "crypto";

export const secSchema = z
  .object({
    serverMode: z.boolean().default(false).describe("Server Mode"),
    turnstileJsPath: z
      .string()
      .default("/cf-turnstile.js")
      .optional()
      .describe("The path to the turnstile.js script"),
  })
  .default({})
  .optional();

export interface onReturnableEvents extends ServiceEventsBase {
  getTurnstileScriptUrl(
    method?: "implicit" | "explicit",
    onLoadFunction?: string
  ): Promise<string>;
  getTurnstileHTMXForm(
    config: z.infer<typeof GetTurnstileHTMXFormSchema>,
    functions: z.infer<typeof GetTurnstileHTMXFormFunctionSchema>
  ): Promise<string>;
  verifyCaptcha(
    response: string,
    clientIP: string,
    secret: string,
    action?: string,
    cData?: string
  ): Promise<true | Array<ErrorCode>>;
}
export interface ServiceTypes extends BSBPluginEvents {
  onEvents: ServiceEventsBase;
  emitEvents: ServiceEventsBase;
  onReturnableEvents: onReturnableEvents;
  emitReturnableEvents: ServiceEventsBase;
  onBroadcast: ServiceEventsBase;
  emitBroadcast: ServiceEventsBase;
}

export const GetTurnstileHTMXFormSchema = z.object({
  siteKey: z.string().max(255),
  action: z
    .string()
    .max(32)
    .regex(/^[\w-]{1,32}$/)
    .optional(),
  cData: z
    .string()
    .max(255)
    .regex(/^[\w-]{1,255}$/)
    .optional(),
  size: z.enum(["normal", "compact"]).default("normal").optional(),
  appearance: z
    .enum(["always", "execute", "interaction-only"])
    .default("interaction-only")
    .optional(),
  theme: z.enum(["light", "dark", "auto"]).default("auto").optional(),
  language: z
    .string()
    .regex(/^(auto|[a-z]{2}(-[A-Z]{2})?)$/)
    .default("auto")
    .optional(),
  tabindex: z.number().min(-100).max(9999).default(0).optional(),
  responseFieldName: z.string().default("cf-turnstile-response").optional(),
  refreshExpired: z
    .enum(["auto", "manual", "never"])
    .default("auto")
    .optional(),
  retry: z.enum(["auto", "never"]).default("auto").optional(),
  retryInterval: z.number().positive().max(899999).default(8000).optional(),
});

export const GetTurnstileHTMXFormFunctionSchema = z
  .object({
    callback: z.string().max(255).optional(),
    errorCallback: z.string().max(255).optional(),
    beforeInteractiveCallback: z.string().max(255).optional(),
    afterInteractiveCallback: z.string().max(255).optional(),
    unsupportedCallback: z.string().max(255).optional(),
    timeoutCallback: z.string().max(255).optional(),
  })
  .default({})
  .optional();

export class Config extends BSBPluginConfig<typeof secSchema> {
  validationSchema = secSchema;

  migrate(
    toVersion: string,
    fromVersion: string | null,
    fromConfig: any | null
  ) {
    return fromConfig;
  }
}

export class Plugin extends BSBService<Config, ServiceTypes> {
  private fastify?: Fastify;
  constructor(context: BSBServiceConstructor) {
    super(context);
    if (this.config && this.config.serverMode === true)
      this.fastify = new Fastify(this);
  }
  initBeforePlugins?: string[] | undefined;
  initAfterPlugins?: string[] | undefined;
  runBeforePlugins?: string[] | undefined;
  runAfterPlugins?: string[] | undefined;
  methods = {};
  dispose(): void {}
  public run?(): void;

  public async init(): Promise<void> {
    await this.events.onReturnableEvent(
      "getTurnstileScriptUrl",
      async (method?: "implicit" | "explicit", onLoadFunction?: string) =>
        this.getTurnstileScriptUrl(method, onLoadFunction)
    );
    await this.events.onReturnableEvent(
      "getTurnstileHTMXForm",
      async (
        config: z.infer<typeof GetTurnstileHTMXFormSchema>,
        functions?: z.infer<typeof GetTurnstileHTMXFormFunctionSchema>
      ) => this.getTurnstileHTMXForm(config, functions)
    );
    await this.events.onReturnableEvent(
      "verifyCaptcha",
      async (response, clientIP, secret, action, cData) =>
        this.verifyCaptcha(response, clientIP, secret, action, cData)
    );

    if (this.fastify) {
      let path = "/cf-turnstile.js";
      if (!Tools.isNullOrUndefined(this.config)) {
        if (Tools.isString(this.config.turnstileJsPath))
          path = this.config.turnstileJsPath;
      }
      await this.fastify.get(path, async (reply, params, query) => {
        const parsedQuery = z
          .object({
            method: z
              .enum(["implicit", "explicit"])
              .optional()
              .describe(
                "You can initialize and customize the Turnstile widget on your web page via implicit or explicit rendering. - see https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/#disable-implicit-rendering"
              ),
            onLoadFunction: z
              .string()
              .max(255)
              .optional()
              .describe(
                "The name of the function to call when the Turnstile widget is ready to be rendered. - see https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/#explicitly-render-the-turnstile-widget"
              ),
          })
          .optional()
          .default({})
          .transform((x) => {
            if (Tools.isString(x.onLoadFunction)) x.method = "explicit";
            return x;
          })
          .parse(query);

        reply.redirect(
          303,
          await this.getTurnstileScriptUrl(
            parsedQuery.method,
            parsedQuery.onLoadFunction
          )
        );
      });
    }
  }

  private getTurnstileScriptUrl(
    method?: "implicit" | "explicit",
    onLoadFunction?: string
  ): string {
    if (Tools.isString(onLoadFunction)) method = "explicit";
    return (
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=" +
      (method ?? "implicit") +
      (Tools.isString(onLoadFunction) ? "&onload=" + onLoadFunction : "")
    );
  }
  private getTurnstileHTMXForm(
    config: z.infer<typeof GetTurnstileHTMXFormSchema>,
    functions?: z.infer<typeof GetTurnstileHTMXFormFunctionSchema>
  ): string {
    const parsedData = GetTurnstileHTMXFormSchema.parse(config);
    const params: Record<string, string | number> = {
      sitekey: parsedData.siteKey,
    };
    if (parsedData.action) params["action"] = parsedData.action;
    if (parsedData.cData) params["cData"] = parsedData.cData;
    if (parsedData.size) params["size"] = parsedData.size;
    if (parsedData.appearance) params["appearance"] = parsedData.appearance;
    if (parsedData.theme) params["theme"] = parsedData.theme;
    if (parsedData.language) params["language"] = parsedData.language;
    if (parsedData.tabindex) params["tabindex"] = parsedData.tabindex;
    if (parsedData.responseFieldName)
      params["response-field-name"] = parsedData.responseFieldName;
    if (parsedData.refreshExpired)
      params["refresh-expired"] = parsedData.refreshExpired;
    if (parsedData.retry) params["retry"] = parsedData.retry;
    if (parsedData.retryInterval)
      params["retry-interval"] = parsedData.retryInterval;
    const functionParams: Array<string> = [];
    if (functions !== undefined && functions !== null) {
      const parsedFunctions =
        GetTurnstileHTMXFormFunctionSchema.parse(functions);
      if (parsedFunctions !== undefined) {
        if (parsedFunctions.callback)
          functionParams.push(
            `tsconfig['callback'] = function (token) { ${parsedFunctions.callback} }; `
          );
        if (parsedFunctions.errorCallback)
          functionParams.push(
            `tsconfig['error-callback'] = function (errorCode) { ${parsedFunctions.errorCallback} }; `
          );
        if (parsedFunctions.beforeInteractiveCallback)
          functionParams.push(
            `tsconfig['before-interactive-callback'] = function () { ${parsedFunctions.beforeInteractiveCallback} }; `
          );
        if (parsedFunctions.afterInteractiveCallback)
          functionParams.push(
            `tsconfig['after-interactive-callback'] = function () { ${parsedFunctions.afterInteractiveCallback} }; `
          );
        if (parsedFunctions.unsupportedCallback)
          functionParams.push(
            `tsconfig['unsupported-callback'] = function () { ${parsedFunctions.unsupportedCallback} }; `
          );
        if (parsedFunctions.timeoutCallback)
          functionParams.push(
            `tsconfig['timeout-callback'] = function () { ${parsedFunctions.timeoutCallback} }; `
          );
      }
    }

    const elemID = randomUUID();
    const scriptUrl = this.getTurnstileScriptUrl("explicit");

    const JSScript = [
      "var waitForTurnstile = async () => {",
      "let startTime = Date.now();",
      "while (typeof turnstile === 'undefined' && Date.now() - startTime < 10000) {",
      "await new Promise(resolve => setTimeout(resolve, 100));",
      "}",
      "if (typeof turnstile === 'undefined') {",
      `document.getElementById('cf-${elemID}').innerText = 'Failed to load Captcha. Please reload the page';`,
      `document.getElementById('cf-${elemID}-cfscript').remove();`,
      `document.getElementById('cf-${elemID}-script').remove();`,
      " } else {",
      `turnstile.ready(() => { ` +
        `let tsconfig = ${JSON.stringify(params)}; ` +
        `${functionParams.join("")}; ` +
        `turnstile.render('#cf-${elemID}', tsconfig) }); `,
      `document.getElementById('cf-${elemID}-cfscript').remove();`,
      `document.getElementById('cf-${elemID}-script').remove();`,
      "}",
      "};",
      "waitForTurnstile();",
    ].join(" ");
    let html = `<div id="cf-${elemID}"></div>`;
    html += `<script id="cf-${elemID}-cfscript" src="${scriptUrl}"></script>`;
    html += `<script id="cf-${elemID}-script">${JSScript}</script>`;
    return html;
  }

  private async verifyCaptcha(
    response: string,
    clientIP: string,
    secret: string,
    action?: string,
    cData?: string
  ): Promise<true | Array<ErrorCode>> {
    const idempotencyKey = randomUUID();
    const formData = new FormData();
    formData.append("secret", secret);
    formData.append("response", response);
    formData.append("remoteip", clientIP);
    formData.append("idempotency_key", idempotencyKey);

    const url = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
    const result = await fetch(url, {
      body: formData,
      method: "POST",
    });
    const resultAsJson = (await result.json()) as CFVerificationResponse;
    if (resultAsJson["error-codes"].length > 0)
      return resultAsJson["error-codes"];
    if (Tools.isString(action)) {
      if (resultAsJson.action !== action) {
        return ["action-invalid"];
      }
    }
    if (Tools.isString(cData)) {
      if (resultAsJson.cdata !== cData) {
        return ["cdata-invalid"];
      }
    }
    return resultAsJson.success === true ? true : ["internal-error"];
  }
}

export interface CFVerificationResponse {
  success: boolean;
  challenge_ts: string;
  hostname: string;
  "error-codes": ErrorCode[];
  action: string;
  cdata: string;
}

export const ErrorCodes = {
  "missing-input-secret": "The secret parameter was not passed.",
  "invalid-input-secret": "The secret parameter was invalid or did not exist.",
  "missing-input-response": "The response parameter was not passed.",
  "invalid-input-response": "The response parameter is invalid or has expired.",
  "invalid-widget-id":
    "The widget ID extracted from the parsed site secret key was invalid or did not exist.",
  "invalid-parsed-secret":
    "The secret extracted from the parsed site secret key was invalid.",
  "bad-request": "The request was rejected because it was malformed.",
  "timeout-or-duplicate":
    "The response parameter has already been validated before.",
  "internal-error":
    "An internal error happened while validating the response. The request can be retried.",
  "cdata-invalid":
    "The cData passed in does not match the cData returned from the verification.",
  "action-invalid":
    "The action passed in does not match the action returned from the verification.",
} as const;

export type ErrorCode = keyof typeof ErrorCodes;
export type ErrorCodeDescription<T extends ErrorCode> = (typeof ErrorCodes)[T];
