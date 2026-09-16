/**
 * Find every BOT_TOKEN_N in the environment -- together with its NAME.
 *
 * WHY THE NAME TRAVELS BESIDE THE TOKEN INSTEAD OF BEING COMPUTED FROM ITS
 * POSITION.
 *
 * The scan deliberately does not stop at the first gap: in production
 * BOT_TOKEN_11 is absent (that slot belongs to OM_AI_Digital_studio_bot) while
 * BOT_TOKEN_12 (`t27ai_bot`) is present. This function used to return bare
 * token strings, and the name used in logs was assembled as
 * `BOT_TOKEN_${index + 1}` -- that is, from the INDEX IN THE ARRAY. With a hole
 * at eleven the two drift apart: the twelfth token is checked and logged under
 * the name "BOT_TOKEN_11", a variable that does not exist in the environment.
 *
 * The cost is not cosmetic. That name is what goes into the invalid-token
 * message, the only thing the owner sees when a bot fails to start: it sends
 * them to fix a variable nobody has, while the broken one looks innocent. The
 * startup summary had the same defect -- it printed the range
 * "BOT_TOKEN_1 - BOT_TOKEN_<count>" and offered "add BOT_TOKEN_<count+1>", a
 * slot that already existed and was already loaded.
 *
 * Measured on production logs 2026-09-16: 109 secrets, a hole at 11, twelve
 * bots.
 */
export interface BotTokenEntry {
  /** Name of the environment variable the token came from. */
  key: string
  token: string
}

/** How many slots we scan. Gaps do not stop the scan. */
export const MAX_BOT_SLOTS = 100

export function discoverBotTokenEntries(
  env: NodeJS.ProcessEnv = process.env
): BotTokenEntry[] {
  const found: BotTokenEntry[] = []
  for (let i = 1; i <= MAX_BOT_SLOTS; i++) {
    const key = `BOT_TOKEN_${i}`
    const token = env[key]
    if (token) found.push({ key, token })
  }
  return found
}

/** Tokens without their names, for callers that do not need the name. */
export function discoverBotTokens(
  env: NodeJS.ProcessEnv = process.env
): string[] {
  return discoverBotTokenEntries(env).map(e => e.token)
}

/**
 * The first FREE slot, not "count + 1".
 *
 * The hint "add BOT_TOKEN_N" must name a slot that is genuinely empty. With a
 * hole at eleven, eleven slots are occupied but the free one IS the eleventh.
 */
export function nextFreeBotSlot(env: NodeJS.ProcessEnv = process.env): number {
  for (let i = 1; i <= MAX_BOT_SLOTS; i++) {
    if (!env[`BOT_TOKEN_${i}`]) return i
  }
  return MAX_BOT_SLOTS + 1
}
