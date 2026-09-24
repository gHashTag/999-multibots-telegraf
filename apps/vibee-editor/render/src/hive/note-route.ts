/**
 * A NOTE FROM ANOTHER SERVICE INTO THE HIVE JOURNAL.
 *
 * Owner, 2026-09-11: "write every sweep of the seller into the hive journal."
 * The seller lives in the bot service; the journal lives here. Until now the
 * bot could only shout (logger.error -> Telegram) or stay silent (info ->
 * Railway log nobody reads). Quiet sweeps were invisible unless somebody had
 * the owner's laptop open on Railway.
 *
 * Server to server only: the caller must hold RENDER_API_KEY. A Mini App user
 * cannot write history about themselves or anybody else through this door.
 * Kinds are allow-listed: the journal's vocabulary is the report's vocabulary
 * (queen-report.ts NAMES), and an unknown kind would print as a raw token.
 */
import { record, type EventKind, type Severity } from './journal'

export function isHiveNotePath(path: string): boolean {
  return path === '/api/hive/note'
}

/** What another service may write. Widen deliberately, one line per kind. */
export const NOTABLE_KINDS: ReadonlySet<EventKind> = new Set<EventKind>([
  'sweep-idle',
  'sweep-card',
  'sweep-failed',
  // Alive while deliberately idle: the heartbeat that turns silence from an
  // ambiguity into evidence. Rate-limited by the bot, not here.
  'sweep-held',
  // The owner's press, written by the bot: the one act nothing recorded.
  'card-pressed',
  // And the same card leaving with nobody pressing anything. Missing from
  // this list until 2026-09-24, while the bot posted it: the door answered
  // 400 to every automatic send, so "how much went without you" was zero by
  // construction. A kind the bot can post and the door cannot accept is now
  // a failing test, not a silent 400 -- see every-kind-the-bot-can-post.
  'card-auto-sent',
  // Money on the chain that nothing ever credited. The bot's TON watch writes
  // it; the render cannot see the chain and the bot cannot see this journal
  // without the door, so this is the only way it can be recorded at all.
  'payment-unclaimed',
  // The same watches saying they looked and found nothing: without it, a
  // watch that died and a channel where nobody is owed anything are the same
  // silence.
  'watch-quiet',
  // Every error of every bot, rolled up by the bot into one line per window.
  // Only the bot sees its own failures; without this door they reach a log
  // nobody reads and nothing else at all.
  'bot-errors',
  // A person who wrote that something is broken, or who asked and was left.
  // The one fault report no log can contain, because nothing failed.
  'client-unanswered',
])

const SEVERITIES: ReadonlySet<Severity> = new Set<Severity>([
  'normal',
  'attention',
  'alarm',
])

type Pool = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>
}

export interface NoteDeps {
  getPool: () => Promise<Pool>
  /** True only for a caller that timing-safe-matched RENDER_API_KEY. */
  isServer: (req: unknown) => boolean
  readBody: (req: unknown) => Promise<string>
}

export async function handleHiveNote(
  req: { method?: string },
  deps: NoteDeps
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (req.method !== 'POST') {
    return { status: 405, body: { ok: false, error: 'POST only' } }
  }
  if (!deps.isServer(req)) {
    return { status: 403, body: { ok: false, error: 'server key required' } }
  }
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse((await deps.readBody(req)) || '{}')
  } catch {
    return { status: 400, body: { ok: false, error: 'bad json' } }
  }
  const kind = String(parsed.kind ?? '') as EventKind
  if (!NOTABLE_KINDS.has(kind)) {
    return {
      status: 400,
      body: {
        ok: false,
        error: `kind must be one of ${[...NOTABLE_KINDS].join(', ')}`,
      },
    }
  }
  const severity = SEVERITIES.has(parsed.severity as Severity)
    ? (parsed.severity as Severity)
    : 'normal'
  const what = String(parsed.what ?? '').slice(0, 300) || null
  const who = parsed.who == null ? null : String(parsed.who).slice(0, 64)
  const bot = parsed.bot == null ? null : String(parsed.bot).slice(0, 64)
  // An id, and only an id: the journal says which client an act was about,
  // never their name and never a word they wrote.
  const lead = parsed.lead == null ? null : String(parsed.lead).slice(0, 64)
  const amount =
    typeof parsed.amount === 'number' && Number.isFinite(parsed.amount)
      ? parsed.amount
      : null
  const pool = await deps.getPool()
  const wrote = await record(pool, {
    kind,
    who,
    bot,
    amount,
    what,
    lead,
    severity,
  })
  return { status: 200, body: { ok: true, recorded: wrote === 'recorded' } }
}
