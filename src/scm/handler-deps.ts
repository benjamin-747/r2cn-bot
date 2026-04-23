import type { Logger } from "pino";
import type { Config } from "../config/index.js";
import type { DeliveryMeta } from "../canonical/refs.js";
import type { ScmClient } from "./types.js";

/**
 * Per-webhook runtime without pre-loaded YAML config.
 * Handlers call {@link loadBotConfig} from `config/load-bot-config.js` when needed.
 */
export type WebhookRuntimeDeps = {
    scm: ScmClient;
    log: Logger;
    delivery?: DeliveryMeta;
};

/**
 * Dependencies passed into domain handlers (docs §8.3).
 * Handlers depend on this bundle instead of Probot `Context`.
 */
export type ScmHandlerDeps = {
    scm: ScmClient;
    config: Config;
    log: Logger;
    delivery?: DeliveryMeta;
};
