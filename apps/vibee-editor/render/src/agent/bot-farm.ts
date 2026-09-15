/**
 * THE FARM'S CASHIERS.
 *
 * This is a farm of bots, and every person in `users` belongs to one of them
 * (`users.bot_name`). A Stars invoice is a message from a bot: whoever mints
 * it is the bot the person will see asking for money, and the bot whose
 * owner's accounting receives the sale. One shared payment bot minting for
 * everybody made the wife of the owner pay a bot she had never talked to --
 * found live 2026-09-08 on the first real pitch.
 *
 * So the invoice is minted by the person's OWN bot when the farm knows it.
 * The tokens are already in this service's environment (BOT_TOKEN_N, plus
 * the two named ones); which username each token belongs to is learned once
 * per process by asking Telegram (getMe), never typed by hand -- a hand-typed
 * map would rot the day a bot is renamed or a token rotated.
 *
 * A bot that does not answer getMe is simply not a cashier today. An empty
 * map is not cached: a network blink at boot must not turn every invoice
 * into a default-cashier invoice for the life of the process.
 */

import { askSupabase } from './crm-tools'

export interface FarmBot {
  /** Lower-case username without the @. */
  username: string
  token: string
}

type Fetch = typeof fetch

function tokensFromEnv(env: NodeJS.ProcessEnv): string[] {
  const names = Object.keys(env)
    .filter(
      k =>
        /^BOT_TOKEN_\d+$/.test(k) ||
        k === 'TELEGRAM_BOT_TOKEN' ||
        k === 'TOKENS_PAYMENT_BOT_TOKEN'
    )
    .sort()
  const out: string[] = []
  const seen = new Set<string>()
  for (const k of names) {
    const v = String(env[k] ?? '').trim()
    if (v && !seen.has(v)) {
      seen.add(v)
      out.push(v)
    }
  }
  return out
}

// owner-scope: per process: the farm map belongs to the deployment
let farm: Promise<Map<string, string>> | undefined

async function build(
  fetchImpl: Fetch,
  env: NodeJS.ProcessEnv
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  await Promise.all(
    tokensFromEnv(env).map(async token => {
      try {
        const r = await fetchImpl(`https://api.telegram.org/bot${token}/getMe`)
        const d = (await r.json()) as {
          ok?: boolean
          result?: { username?: unknown }
        }
        const u = d?.ok
          ? normaliseBotName(String(d.result?.username ?? ''))
          : ''
        if (u && !map.has(u)) map.set(u, token)
      } catch {
        // Not a cashier today. The default cashier still answers.
      }
    })
  )
  return map
}

/** username -> token for every bot of the farm that answers getMe. */
export async function farmMap(
  fetchImpl: Fetch = fetch,
  env: NodeJS.ProcessEnv = process.env
): Promise<Map<string, string>> {
  if (!farm) {
    farm = build(fetchImpl, env).then(m => {
      if (m.size === 0) farm = undefined
      return m
    })
  }
  return farm
}

/**
 * `@Neuro_Blogger_Bot`, `neuro_blogger_bot` and the business-chat alias
 * `business_neuro_blogger_bot` all name the same bot.
 */
export function normaliseBotName(name: string | null | undefined): string {
  return String(name ?? '')
    .trim()
    .replace(/^@/, '')
    .replace(/^business_/i, '')
    .toLowerCase()
}

/** The token of the farm bot with this username, or null when unknown. */
export async function tokenForBot(
  botName: string | null | undefined,
  fetchImpl: Fetch = fetch
): Promise<FarmBot | null> {
  const username = normaliseBotName(botName)
  if (!username) return null
  const token = (await farmMap(fetchImpl)).get(username)
  return token ? { username, token } : null
}

/** Which bot of the farm this person belongs to, by `users.bot_name`. */
export async function botNameOf(
  telegramId: string | null | undefined
): Promise<string | null> {
  const id = String(telegramId ?? '').trim()
  if (!/^\d{5,15}$/.test(id)) return null
  try {
    const rows = await askSupabase<{ bot_name?: string | null }>(
      `users?select=bot_name&telegram_id=eq.${encodeURIComponent(id)}&limit=1`
    )
    return rows[0]?.bot_name || null
  } catch {
    return null
  }
}

export function forgetFarmForTests(): void {
  farm = undefined
}
