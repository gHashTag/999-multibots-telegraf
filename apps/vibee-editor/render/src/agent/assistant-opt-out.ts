/**
 * THE RENDER'S HALF OF "WHEN A CLIENT ASKS THE ASSISTANT TO STOP, IT STOPS".
 *
 * The request is heard by the bot (src/services/clientStop.ts, before any
 * model) and written into `assistant_opt_outs` in THIS service's Postgres,
 * keyed by (owner, client). Here it is read by every tool that prepares a
 * message from the owner's side to a person: tg_send and its media siblings,
 * tg_forward, crm_offer, crm_deliver_photo, crm_duet, the press that finally
 * sends a card, and the sweep's candidate list. One function decides for all
 * of them -- `assistantMayReach` -- so there is no second rule to drift.
 *
 * THE ONE EXCEPTION IS THE OWNER'S OWN WORDS. A person who switched the
 * assistant off asked for the machine to stop, not for the owner to stop.
 * So a plain text draft whose words the owner typed himself, in this very
 * turn, may still be prepared -- and it still leaves only on his press. Every
 * other draft is refused: a pitch, a gift, a picture, a forward, anything the
 * model or a template composed, and anything in an unattended sweep. The
 * press checks again, because a card drawn before the client said "stop"
 * must not leave after it.
 *
 * A table that cannot be read refuses only where nobody is watching (the
 * sweep, the duet); see the catch in `assistantMayReach`.
 *
 * The table and the list query are the bot's strings, byte for byte; the
 * bot's parity test compares the two files so they cannot drift.
 */
import type { ToolContext } from './tools'

export const OPT_OUT_TABLE = `CREATE TABLE IF NOT EXISTS assistant_opt_outs (
  owner_id text NOT NULL,
  client_id text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  since timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'client',
  owner_told_at timestamptz,
  client_told_at timestamptz,
  resumed_at timestamptz,
  PRIMARY KEY (owner_id, client_id)
)`

export const OPT_OUT_LIST = `SELECT client_id, since FROM assistant_opt_outs
  WHERE owner_id = $1 AND active`

type Pool = {
  query(sql: string, params?: unknown[]): Promise<{ rows?: any[] }>
}

/** Created once per pool; a test's fresh double gets its own CREATE. */
const ready = new WeakSet<object>()

/**
 * The owner's opted-out clients (client id -> since, ISO). THROWS when the
 * database cannot say: "unknown" is not "nobody", and the caller decides.
 */
export async function optedOutOf(
  pool: Pool,
  owner: string
): Promise<Map<string, string | null>> {
  if (!ready.has(pool as object)) {
    await pool.query(OPT_OUT_TABLE)
    ready.add(pool as object)
  }
  const r = await pool.query(OPT_OUT_LIST, [String(owner)])
  const out = new Map<string, string | null>()
  for (const row of r?.rows ?? []) {
    out.set(
      String(row.client_id),
      row.since ? new Date(row.since as string | Date).toISOString() : null
    )
  }
  return out
}

/** A numeric Telegram id is a person; anything else is not known here. */
const PERSON = /^\d{5,15}$/

/**
 * Did the owner type these words himself in this turn? Whitespace and case
 * do not count; quotes around the draft do not count; anything else does --
 * a draft the model rephrased is the model's draft.
 */
export function ownerWrote(
  said: string | undefined,
  text: string | undefined
): boolean {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()
  const draft = norm(String(text ?? ''))
    .replace(/^["'«“„]+|["'»”]+$/g, '')
    .trim()
  const owner = norm(String(said ?? ''))
  return draft.length >= 2 && owner.includes(draft)
}

/**
 * The caller's words for this turn, when they can be the owner's own: the bot
 * chat, a person typing, not an unattended sweep (whose "message" is our
 * brief, not anybody's words).
 */
export function ownerWordsOf(
  history: ReadonlyArray<{ role?: string; content?: unknown }>,
  surface: string,
  ephemeral: boolean
): string | undefined {
  if (ephemeral || surface !== 'bot') return undefined
  const last = history[history.length - 1]
  return last?.role === 'user' && typeof last.content === 'string'
    ? last.content
    : undefined
}

export type Reach =
  | { ok: true; ownerWords?: boolean }
  | { ok: false; why: string }

/* The words the model relays to the owner. Russian: the owner reads them. */
const why = {
  unread: (lead: string) =>
    `не смог проверить, просил ли ${lead} выключить автоответы (база не ответила) — ` +
    'ничего ему не готовлю, повтори позже.',
  sweep: (lead: string) =>
    `${lead} попросил(а) выключить автоответы — пропусти этого человека и ничего ему не готовь.`,
  pressed: (lead: string) =>
    `${lead} попросил(а) выключить автоответы уже после того, как карточка была готова. ` +
    'Не отправил: напиши ему сам.',
  draft: (lead: string) =>
    `${lead} попросил(а) выключить автоответы. Ассистент ему не пишет и от твоего имени ` +
    'ничего не готовит — ни ответов, ни предложений, ни подарков. Напиши ему сам в Telegram ' +
    'или пришли свой текст дословно в кавычках, и я подготовлю карточку с твоими словами. ' +
    'Включить ассистента обратно может только владелец — кнопкой в уведомлении или в карточке клиента.',
}

/**
 * MAY THE ASSISTANT PREPARE (OR, AT THE PRESS, SEND) SOMETHING TO THIS LEAD?
 *
 * `plainText`: the draft is words only -- no media, no invoice, no charge, no
 * gift -- so it CAN be the owner's own. `pressed`: this is the owner's press
 * on a card; `ownerWords` is what the card recorded when it was prepared.
 */
export async function assistantMayReach(
  ctx:
    | Pick<ToolContext, 'telegramId' | 'pool' | 'sellerSweep' | 'ownerSaid'>
    | undefined,
  lead: string | undefined,
  how: {
    text?: string
    plainText?: boolean
    pressed?: boolean
    ownerWords?: boolean
  } = {}
): Promise<Reach> {
  const person = String(lead ?? '').trim()
  const owner = String(ctx?.telegramId ?? '')
  const pool = ctx?.pool as Pool | undefined
  if (!PERSON.test(person) || !owner || !pool) return { ok: true }
  let off: Map<string, string | null>
  try {
    off = await optedOutOf(pool, owner)
  } catch {
    /*
     * UNKNOWN IS NOT "NOBODY" -- AND NOT "EVERYBODY" EITHER.
     *
     * An unattended sweep (and a duet) writes to nobody it cannot check: it
     * loses nothing by waiting for the next tick. A person at the keyboard
     * gets the card, because a database blip must not cost the owner his own
     * turn -- and the card still leaves only on his press.
     */
    return ctx?.sellerSweep
      ? { ok: false, why: why.unread(person) }
      : { ok: true }
  }
  if (!off.has(person)) return { ok: true }
  if (how.pressed)
    return how.ownerWords
      ? { ok: true, ownerWords: true }
      : { ok: false, why: why.pressed(person) }
  if (ctx?.sellerSweep) return { ok: false, why: why.sweep(person) }
  if (how.plainText && ownerWrote(ctx?.ownerSaid, how.text))
    return { ok: true, ownerWords: true }
  return { ok: false, why: why.draft(person) }
}

/** The same decision as a throw, for the tools whose refusals are errors. */
export async function refuseIfClientStopped(
  ctx: Parameters<typeof assistantMayReach>[0],
  lead: string | undefined
): Promise<void> {
  const r = await assistantMayReach(ctx, lead)
  if (!r.ok) throw new Error(r.why)
}
