import type { ProviderId } from './provider'

/**
 * WHICH MODEL, CHOSEN FROM THE BOT.
 *
 * AGENT_PROVIDER is a deploy-time variable: switching it means a terminal
 * and a redeploy. The owner wanted it from a button. So the choice lives
 * here -- in memory for the running process, in `agent_settings` for the
 * next one -- and providerOrder() reads it before the environment. Nothing
 * else about the chain changes: the chosen provider goes first, the rest
 * stay behind it as fallbacks.
 */
export const KNOWN_PROVIDERS: ProviderId[] = [
  'zai',
  'zai-lite',
  'nemotron',
  'ollama',
]
const KEY = 'agent_provider'

type Pool = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>
}

// owner-scope: per DEPLOYMENT by design: one model chain for the service
let chosen: ProviderId | null = null
// owner-scope: per process: the DDL runs once
let tableReady = false

export function isProviderId(x: unknown): x is ProviderId {
  return typeof x === 'string' && (KNOWN_PROVIDERS as string[]).includes(x)
}

/** The running process's choice, or null when the environment decides. */
export function chosenProvider(): ProviderId | null {
  return chosen
}

/** For tests. */
export function forgetProviderChoiceForTests(): void {
  chosen = null
  tableReady = false
}

async function ensureTable(pool: Pool): Promise<void> {
  if (tableReady) return
  await pool.query(
    `CREATE TABLE IF NOT EXISTS agent_settings (
       key text PRIMARY KEY,
       value text NOT NULL,
       updated_at timestamptz NOT NULL DEFAULT now()
     )`
  )
  tableReady = true
}

/** At startup: what the owner chose last time, if anything. Never throws. */
export async function loadProviderChoice(
  pool: Pool
): Promise<ProviderId | null> {
  try {
    await ensureTable(pool)
    const r = await pool.query(
      `SELECT value FROM agent_settings WHERE key = $1`,
      [KEY]
    )
    const v = r.rows[0]?.value
    chosen = isProviderId(v) ? v : null
  } catch (e) {
    console.warn('[agent] provider choice not loaded:', String(e).slice(0, 120))
    chosen = null
  }
  return chosen
}

/** The owner's choice: in memory now, in the table for the next process. */
export async function chooseProvider(
  pool: Pool | null,
  id: ProviderId
): Promise<void> {
  if (!isProviderId(id)) throw new Error(`unknown provider: ${String(id)}`)
  chosen = id
  if (!pool) return
  try {
    await ensureTable(pool)
    await pool.query(
      `INSERT INTO agent_settings (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [KEY, id]
    )
  } catch (e) {
    // The running process has the choice; only the next one would not.
    console.warn(
      '[agent] provider choice not persisted:',
      String(e).slice(0, 120)
    )
  }
}
