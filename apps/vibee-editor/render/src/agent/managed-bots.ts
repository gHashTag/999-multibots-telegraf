/**
 * A BOT MADE WITHOUT A TRIP TO BOTFATHER.
 *
 * Connecting a new owner meant: go to BotFather, /newbot, pick a name, copy
 * the token out of a chat, paste it to us. Four steps, one of them a secret
 * passing through a person's clipboard.
 *
 * Bot API 9.6 (3 Apr 2026) added Managed Bots. A link of the form
 * t.me/newbot/<us>/<suggested> asks Telegram to create a bot managed by us;
 * the `managed_bot` update then names it, and getManagedBotToken is the ONLY
 * way to read its token -- BotFather does not own it, we do. Which is why the
 * token has to be kept the moment it arrives: nobody can ask for it later.
 *
 * KEPT, NOT WIRED. The owner's decision, 2026-09-15: this table stores the
 * token and the farm does not read it. bot-farm.ts still builds its map from
 * the environment alone, so a new bot does not start serving by itself -- the
 * key is moved into Railway deliberately, by a person, in one step. Making
 * the farm boot bots out of the database is a different change with a
 * different trust model, and it waits.
 */
type Pool = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows?: unknown[] }>
}

/** Telegram's own rules for a bot username, checked before we suggest one. */
const BOT_USERNAME = /^[A-Za-z][A-Za-z0-9_]{3,30}[Bb][Oo][Tt]$/

/**
 * The link that makes Telegram create a bot managed by us.
 *
 * The suggested username is a SUGGESTION -- the person can change it in
 * Telegram's own flow -- but an invalid one makes the link useless, so it is
 * refused here rather than sent and wondered about.
 */
export function newBotLink(
  manager: string,
  suggested: string,
  name?: string | null
): string {
  const us = String(manager ?? '')
    .trim()
    .replace(/^@/, '')
  const bot = String(suggested ?? '')
    .trim()
    .replace(/^@/, '')
  if (!us) throw new Error('не задано имя бота-менеджера')
  if (!BOT_USERNAME.test(bot)) {
    throw new Error(
      `«${bot}» не подходит: имя бота — латиница, цифры и _, от 5 до 32 знаков, и обязано кончаться на bot`
    )
  }
  const base = `https://t.me/newbot/${us}/${bot}`
  const title = String(name ?? '').trim()
  return title ? `${base}?name=${encodeURIComponent(title)}` : base
}

let tableReady = false

/** For tests: the next call runs the DDL again. */
export function forgetManagedBotsTableForTests(): void {
  tableReady = false
}

async function ensureTable(pool: Pool): Promise<void> {
  if (tableReady) return
  await pool.query(
    `CREATE TABLE IF NOT EXISTS managed_bots (
       bot_id       bigint PRIMARY KEY,
       owner_id     text NOT NULL,
       bot_username text NOT NULL,
       token        text NOT NULL,
       created_at   timestamptz NOT NULL DEFAULT now(),
       updated_at   timestamptz NOT NULL DEFAULT now()
     )`
  )
  tableReady = true
}

export interface ManagedBot {
  owner: string
  botId: number
  botUsername: string
  token: string
}

/**
 * Keep the bot, its owner and its token.
 *
 * Upsert by bot id: the `managed_bot` update fires on creation AND on a token
 * change, and the second one must replace the first rather than fail on the
 * primary key -- a stored token that is no longer valid is worse than none,
 * because somebody would paste it and wonder.
 *
 * The token is never logged, never returned to a caller, and never sent to
 * the owner in a message. It goes from Telegram into this row and stops.
 */
export async function rememberManagedBot(
  pool: Pool,
  bot: ManagedBot
): Promise<'saved' | 'not saved'> {
  try {
    const id = Number(bot?.botId)
    const owner = String(bot?.owner ?? '').trim()
    const username = String(bot?.botUsername ?? '')
      .trim()
      .replace(/^@/, '')
    const token = String(bot?.token ?? '').trim()
    if (!Number.isFinite(id) || id <= 0) return 'not saved'
    if (!owner || !username || !token) return 'not saved'
    await ensureTable(pool)
    await pool.query(
      `INSERT INTO managed_bots (bot_id, owner_id, bot_username, token)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (bot_id) DO UPDATE
         SET owner_id     = EXCLUDED.owner_id,
             bot_username = EXCLUDED.bot_username,
             token        = EXCLUDED.token,
             updated_at   = now()`,
      [id, owner, username, token]
    )
    return 'saved'
  } catch {
    return 'not saved'
  }
}

/**
 * Which bots this owner has made through us, WITHOUT their tokens.
 *
 * The exclusion is the point: a listing exists to be shown, and a secret that
 * can be shown will eventually be shown. Moving a key into the environment is
 * a deliberate act with its own command, not a side effect of looking.
 */
export async function managedBotsOf(
  pool: Pool,
  owner: string
): Promise<Array<{ botId: number; botUsername: string; createdAt: string }>> {
  try {
    await ensureTable(pool)
    const r = await pool.query(
      `SELECT bot_id, bot_username, created_at FROM managed_bots
        WHERE owner_id = $1 ORDER BY created_at DESC`,
      [String(owner)]
    )
    return (r.rows ?? []).map((x: any) => ({
      botId: Number(x.bot_id),
      botUsername: String(x.bot_username ?? ''),
      createdAt: String(x.created_at ?? ''),
    }))
  } catch {
    return []
  }
}
