import { BSBService, BSBServiceClient } from "@bettercorp/service-base";
import {
  GetTurnstileHTMXFormSchema,
  ServiceTypes,
} from "../../plugins/service-cloudflare-turnstiles/plugin";
import { z } from "zod";

export class CFTurnstiles extends BSBServiceClient<ServiceTypes> {
  public readonly pluginName = "service-cloudflare-turnstiles";
  public readonly initBeforePlugins?: string[] | undefined;
  public initAfterPlugins: string[] = [];
  public readonly runBeforePlugins?: string[] | undefined;
  public readonly runAfterPlugins?: string[] | undefined;
  dispose?(): void;
  init?(): Promise<void>;
  run?(): Promise<void>;
  public constructor(context: BSBService<any, any>) {
    super(context);
  }

  public async getTurnstileScriptUrl(
    method?: "implicit" | "explicit",
    onLoadFunction?: string
  ): Promise<string> {
    return await this.events.emitEventAndReturn(
      "getTurnstileScriptUrl",
      5,
      method,
      onLoadFunction
    );
  }
  public async getTurnstileHTMXForm(
    config: z.infer<typeof GetTurnstileHTMXFormSchema>
  ): Promise<{
    script: string;
    formHtml: string;
  }> {
    return await this.events.emitEventAndReturn(
      "getTurnstileHTMXForm",
      5,
      config
    );
  }
  public async verifyCaptcha(
    response: string,
    clientIP: string,
    secret: string,
    cData?: string
  ): Promise<boolean> {
    return await this.events.emitEventAndReturn(
      "verifyCaptcha",
      5,
      response,
      clientIP,
      secret,
      cData
    );
  }
}
