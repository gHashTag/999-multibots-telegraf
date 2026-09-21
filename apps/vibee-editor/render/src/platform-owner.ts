/**
 * THE PLATFORM OPERATOR'S OWN ACCOUNT: the fallback when a deployment sets no
 * OWNER_TELEGRAM_ID.
 *
 * It is the operator, not a client -- the same value render-server.ts
 * (TELEGRAM_OWNER_ID) and src/browser/routes.ts already use for their admin
 * gates. It moved here out of src/agent/telegram-tools.ts so that the agent
 * tree carries no person's id at all and its guard test can say so without an
 * exception for anybody (#2712).
 *
 * Whether to drop the fallback and require OWNER_TELEGRAM_ID on every
 * deployment is the owner's decision; without the fallback, a service that
 * forgot the variable would lock its own owner out of every owner-only tool.
 */
export const PLATFORM_OWNER_FALLBACK = '144022504'
