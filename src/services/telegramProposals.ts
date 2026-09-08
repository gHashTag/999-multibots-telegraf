/**
 * THE HALF THAT MAKES "SEND A MESSAGE" REAL.
 *
 * `tg_send` on the render server never sends. It returns a proposal, which is
 * the right design -- a model must not write to another human being on its own
 * decision. What did not exist was anything able to ACCEPT one: measured
 * 2026-09-07, `grep -rn proposal` across the player and the bot found not a
 * single reader, so the tool could not reach anybody, ever.
 *
 * The queue now lives on the server (`src/agent/tg-proposals.ts`) with three
 * routes. This module is the bot's side of it: after an agent answer that
 * called an acting tool, fetch what is waiting, show it in full, and let a
 * button press -- and nothing else -- carry it out.
 *
 * ── WHY THE CONFIRMATION IS HERE AND NOT IN THE MINI APP ───────────────────
 *
 * This is where the person and the agent are already talking. Asking them to
 * open an app to approve a sentence they just discussed adds a door between
 * the decision and the act, and doors are where things get abandoned.
 *
 * ── WHY THE WHOLE TEXT, NOT A SUMMARY ─────────────────────────────────────
 *
 * A confirmation that says "send the message to Ivan?" asks somebody to
 * approve words they have not read. The recipient and the full text go into
 * the message; if it is long enough to be cut, the cut is stated rather than
 * hidden, because silent truncation is how a person approves a paragraph they
 * never saw.
 */
import { Markup } from 'telegraf'
import { logger } from '@/utils/logger'

const BASE = 'https://vibee-render-production.up.railway.app'

/** Callback prefixes. Kept short: Telegram allows 64 bytes of callback data. */
export const PROPOSAL_OK = 'tgp:ok:'
export const PROPOSAL_NO = 'tgp:no:'

/**
 * How much of the draft is shown.
 *
 * Telegram refuses a message over 4096 characters outright, and the draft
 * shares that message with a heading and a recipient. 3000 leaves room and is
 * far above any real message written in a chat.
 */
const SHOWN_CHARS = 3000

export interface Proposal {
  id: string
  action: string
  target: string
  what?: string
  /** The recipient in words, from the server; shown beside the id only. */
  display?: string
}

function apiKey(): string {
  return process.env.RENDER_API_KEY || ''
}

/**
 * Confirm: the server claims the draft and carries it out.
 *
 * Three outcomes, not two. `unknown` is the one that matters: the request left
 * and the connection died before an answer came back, so the message may well
 * have gone out. Reproduced against a server that sends and then drops the
 * socket -- the recipient got the message and the owner was shown a flat
 * "not sent".
 *
 * That is a lie about a state we do not know, and it is the expensive kind:
 * the person writes the message again, and it arrives twice.
 */
export async function confirmProposal(
  telegramId: string,
  id: string,
  secret: string
): Promise<{ ok: boolean; unknown?: boolean; error?: string }> {
  return post('/api/tg/proposal/confirm', telegramId, id, secret)
}

/** Cancel: the same claim, so a cancelled draft can no longer be sent. */
export async function cancelProposal(
  telegramId: string,
  id: string,
  secret: string
): Promise<{ ok: boolean; error?: string }> {
  return post('/api/tg/proposal/cancel', telegramId, id, secret)
}

async function post(
  path: string,
  telegramId: string,
  id: string,
  secret: string
): Promise<{ ok: boolean; unknown?: boolean; error?: string }> {
  if (!apiKey()) return { ok: false, error: 'сервис не настроен' }
  try {
    const r = await fetch(
      `${BASE}${path}?telegram_id=${encodeURIComponent(telegramId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey() },
        body: JSON.stringify({ id, secret }),
      }
    )
    const d = (await r.json().catch(() => ({}))) as {
      ok?: boolean
      error?: string
    }
    if (!r.ok || d.ok === false) {
      // The server ANSWERED. This one really did not send.
      return { ok: false, error: d.error || `сервер ответил ${r.status}` }
    }
    return { ok: true }
  } catch (e) {
    /*
     * NOT AN ANSWER -- AN ABSENCE OF ONE.
     *
     * The route deletes the draft and only then sends, and its own contract
     * forbids putting a failed draft back. So by the time the connection
     * broke, the message may already be in somebody's chat. Saying "not sent"
     * here would be asserting a fact about a state nobody knows, and the
     * person would rewrite the message and send it twice.
     *
     * Logged, because there is otherwise no breadcrumb to reconcile against.
     */
    const error = (e as Error)?.message || 'связь потеряна'
    logger.warn('proposal confirm outcome unknown', {
      telegram_id: telegramId,
      proposal: id,
      path,
      error,
    })
    return { ok: false, unknown: true, error }
  }
}

/**
 * The card a person confirms.
 *
 * The recipient and the text are quoted verbatim. `escape` is deliberately not
 * applied and no parse mode is used: a draft containing `*` or `_` would
 * otherwise either break the message or be silently reformatted, and the words
 * shown must be exactly the words sent.
 */
export function proposalCard(
  p: Proposal & { secret: string },
  isRu: boolean
): { text: string; markup: ReturnType<typeof Markup.inlineKeyboard> } {
  const body = p.what ?? ''
  const cut = body.length > SHOWN_CHARS
  const shown = cut ? body.slice(0, SHOWN_CHARS) : body

  /*
   * A BARE ID IS NOT AN ADDRESS A PERSON CAN CHECK.
   *
   * `tg_dialogs` hands the model `id` and no username, so the common case --
   * "reply to this dialog" -- reaches here as digits. "Кому: 6579515876" asks
   * somebody to approve a recipient they cannot recognise, and the send path
   * was deliberately made to work for exactly that shape.
   *
   * Naming it as unverified does not make it verifiable; it stops the card
   * from implying that it is. Resolving the id to a name belongs in the
   * proposal itself and is filed separately.
   */
  const opaque = /^-?\d+$/.test(p.target)
  /*
   * A name the owner recognises, NEXT TO the id the message goes to. Never
   * instead of it: the name is third-party text (whatever the person typed
   * into Telegram), so it is cut to one line here again, and the id stays
   * in view for the owner to check.
   */
  const name = String(p.display ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64)
  const to = name
    ? `${name}, id ${p.target}`
    : opaque
      ? isRu
        ? `${p.target} (числовой id — не могу показать имя)`
        : `${p.target} (numeric id — no name to show)`
      : p.target
  const head = isRu
    ? `Отправить сообщение в Telegram?\n\nКому: ${to}`
    : `Send this Telegram message?\n\nTo: ${to}`
  const tail = cut
    ? isRu
      ? `\n\n(показано ${SHOWN_CHARS} из ${body.length} символов — отправится целиком)`
      : `\n\n(showing ${SHOWN_CHARS} of ${body.length} characters — all of it will be sent)`
    : ''

  return {
    text: `${head}\n\n${shown}${tail}`,
    markup: Markup.inlineKeyboard([
      [
        /*
         * The secret rides in the button, not in our memory.
         *
         * Telegram stores callback data and hands it back on the press, so the
         * bot holds no state between showing the card and the tap -- a restart
         * between the two does not strand a draft. Budget is 64 bytes:
         * "tgp:ok:" (7) + a 12-char id + ":" + a 32-char secret = 52.
         */
        Markup.button.callback(
          isRu ? '✅ Отправить' : '✅ Send',
          `${PROPOSAL_OK}${p.id}:${p.secret}`
        ),
        Markup.button.callback(
          isRu ? '✖️ Отмена' : '✖️ Cancel',
          `${PROPOSAL_NO}${p.id}:${p.secret}`
        ),
      ],
    ]),
  }
}
