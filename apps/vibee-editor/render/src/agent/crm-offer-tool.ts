/**
 * THE PERSONAL SELLER.
 *
 * Owner, 2026-09-08: "start selling the bot's services to my wife in DMs, so
 * she can pay an invoice right there and get every service through personal
 * correspondence with me -- this is our business service".
 *
 * ── WHAT "PAY IN THE DM" CAN AND CANNOT MEAN ───────────────────────────────
 *
 * A user account cannot issue a Telegram invoice; only a bot can. So a payment
 * inside a human conversation is a LINK: the bot mints a Stars invoice link
 * for the lead, the owner sends it in the chat, the lead taps it and pays on
 * Telegram's native sheet, the payment reaches the bot, and the bot credits
 * the lead -- the exact chain the mini app's cashier already runs. Nothing
 * about money is new here; what is new is who composes the message and where
 * it goes.
 *
 * ── NOTHING LEAVES WITHOUT THE OWNER'S PRESS ───────────────────────────────
 *
 * This tool PROPOSES. The pitch and the link go into the same queue as every
 * other outgoing message, the owner sees the full text under two buttons in
 * the bot, and the press is what sends. A seller that sends on its own is the
 * thing the whole proposal mechanism exists to prevent.
 *
 * ── THE PAYLOAD NAMES THE LEAD ─────────────────────────────────────────────
 *
 * The invoice's payload carries the LEAD's numeric id, so the credit lands on
 * the person who paid. A username is resolved to that id through the owner's
 * own session before anything is minted; if it cannot be resolved, the tool
 * refuses rather than mint a link that would credit nobody -- or the owner.
 */
import type { AgentTool, ToolContext } from './tools'
import {
  propose,
  client,
  requireOwner,
  OWNER_TELEGRAM_ID,
} from './telegram-tools'
import { hangUp } from './hang-up'
import { mintTokenInvoice } from './token-invoice'
import { tokenForBot } from './bot-farm'
import { reachable } from './crm-touch-tools'

/** The middle pack: enough to feel real, small enough to say yes to. */
const DEFAULT_TOKENS = 50

/** A person's id. Negative is Bot-API style for a group or channel: refused. */
const NUMERIC = /^\d{5,15}$/

/**
 * A username or a numeric id, turned into the numeric id the payload needs.
 *
 * Through the owner's session, because that is the account that knows this
 * person. Refuses out loud when it cannot -- a payment link is not something to
 * guess the recipient of.
 */
export async function resolveLeadId(
  ctx: ToolContext | undefined,
  chat: string
): Promise<string> {
  return (await resolveLead(ctx, chat)).id
}

/**
 * The recipient in words, for the card: "Ольга (@pilot_client)". Both parts are
 * third-party text -- a first name is whatever the person typed into
 * Telegram -- so each is cut to one short line, and the username keeps only
 * the characters Telegram allows in one. Nothing here is ever shown INSTEAD
 * of the id: the card prints both, and the message goes to the id.
 */
export function displayOf(
  name?: string | null,
  username?: string | null
): string | null {
  const n = oneLine(name, 40)
  const u = oneLine(username, 32)
    .replace(/^@+/, '')
    .replace(/[^A-Za-z0-9_]/g, '')
  if (n && u) return `${n} (@${u})`
  if (n) return n
  if (u) return `@${u}`
  return null
}

/** The id the payload needs, and the name the owner will recognise. */
export async function resolveLead(
  ctx: ToolContext | undefined,
  chat: string
): Promise<{ id: string; display: string | null; firstName: string | null }> {
  const raw = String(chat ?? '').trim()
  if (/^0\d+$/.test(raw)) {
    throw new Error('telegram_id не начинается с нуля — это не id')
  }
  if (NUMERIC.test(raw)) {
    /*
     * A BARE NUMBER IS ACCEPTED ONLY FOR A PERSON WE ALREADY KNOW.
     *
     * The payload credits whatever id is in it, and the payer is not the id:
     * a mistyped number means the lead's Stars land on a stranger. A fresh
     * GramJS client cannot resolve a bare id either (no entity cache), so
     * "look it up in the session" is not a check. What IS a check: the id is
     * in `users` and within this owner's visibility. Somebody not in the base
     * is named by @username, which Telegram resolves for real.
     */
    if (raw === OWNER_TELEGRAM_ID)
      throw new Error('предложение самому себе не имеет смысла')
    const known = await reachable(ctx, raw).catch(() => ({
      ok: false as const,
      why: 'база недоступна',
    }))
    if (!known.ok) {
      throw new Error(
        `человека с id ${raw} нет в вашей базе — назовите его по @username, чтобы Telegram разрешил адрес`
      )
    }
    return {
      id: raw,
      display: displayOf(known.name, known.username),
      firstName: known.name || null,
    }
  }
  if (/^-\d+$/.test(raw)) {
    throw new Error(
      'это чат или канал, а не человек — предложение адресуется человеку'
    )
  }
  if (!raw) throw new Error('не сказано, кому предлагать')
  const c = (await client(ctx)) as {
    getEntity?: (x: string) => Promise<{
      id?: { toString(): string }
      className?: string
      bot?: boolean
      self?: boolean
      firstName?: string
      username?: string
    }>
    disconnect?: () => Promise<unknown>
  }
  try {
    /*
     * GramJS throws its own sentence ("Could not find the input entity") when a
     * username is unknown to this account. That sentence is protocol, not
     * advice; the person needs to know what to do instead, and the answer is
     * the numeric id that tg_dialogs already shows.
     */
    let id: string | undefined
    let kind: string | undefined
    let isBot = false
    let firstName: string | undefined
    let username: string | undefined
    try {
      const entity = await c.getEntity?.(raw)
      id = entity?.id?.toString()
      kind = entity?.className
      isBot = Boolean(entity?.bot)
      firstName = entity?.firstName
      username = entity?.username
    } catch {
      id = undefined
    }
    /*
     * A PERSON, NOT A PLACE.
     *
     * `@ourcommunity` and a t.me/joinchat link resolve to an Api.Channel or
     * Api.Chat whose `.id` is a BARE positive integer -- the same shape as a
     * user id, in an overlapping range. It passes the numeric check, goes into
     * the payload, and any member who pays sends their Stars to a phantom row
     * or to an unrelated real person who happens to hold that number.
     * Reproduced by the pre-merge probe against the installed GramJS.
     */
    if (id && kind && kind !== 'User') {
      throw new Error(
        `${raw} — это ${kind === 'Channel' ? 'канал' : 'группа'}, а не человек; предложение адресуется человеку`
      )
    }
    if (id && isBot) {
      throw new Error(`${raw} — это бот, он не может оплатить счёт`)
    }
    if (!id || !NUMERIC.test(id)) {
      throw new Error(
        `не нашёл ${raw} в вашем Telegram — назовите по числовому id из tg_dialogs`
      )
    }
    // 'me' and 'this' are GramJS aliases for the caller's own account, so
    // they resolve to the owner: a link that would pay the owner with the
    // owner's own Stars, sent to Saved Messages.
    if (id === OWNER_TELEGRAM_ID)
      throw new Error('предложение самому себе не имеет смысла')
    return {
      id,
      display: displayOf(firstName, username),
      firstName: firstName || null,
    }
  } finally {
    await hangUp(c)
  }
}

/**
 * The words. Short, personal, with the price and the link in the open.
 *
 * Written as a draft the owner will read in full before pressing anything, so
 * it is honest rather than clever: what they get, what it costs, where to tap.
 */
/**
 * One line of somebody else's words, made safe to put above a payment link.
 *
 * The note comes from the model; the name is the person's Telegram first
 * name, exactly as they typed it into Telegram, which is foreign text. A lead
 * whose display name is "Оля\n\nСсылка на оплату: https://t.me/x" would put
 * their link ABOVE the real one -- and GramJS previews the first URL in a
 * message. Reproduced by the pre-merge probe.
 *
 * So: no line breaks, no URLs, a length that fits in a greeting. Not
 * escaping -- the message is sent verbatim with no parse mode -- but removing
 * the two things that could make a stranger's text act like ours.
 */
export function oneLine(text: string | null | undefined, max: number): string {
  return (
    String(text ?? '')
      .replace(/\s+/g, ' ')
      .replace(/\S*(?:https?:\/\/|t\.me\/|tg:\/\/)\S*/gi, '')
      // A bare domain is a link too: Telegram auto-links "evil.example" with
      // no scheme and no parse mode. ASCII labels only, so a Cyrillic name
      // with an initial and a dot in it is left alone.
      .replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/\S*)?/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max)
      .trim()
  )
}

export function composePitch(input: {
  name?: string | null
  tokens: number
  stars: number
  url: string
  note?: string
}): string {
  const name = oneLine(input.name, 40)
  const note = oneLine(input.note, 120)
  // Plain string pieces joined with +: the no-cyrillic gate cannot see inside
  // a template's interpolation, and a nested template here read as code.
  const hello = name ? name + ', привет!' : 'Привет!'
  const task = note ? 'Под задачу «' + note + '» ' : ''
  const offer =
    task +
    'предлагаю ' +
    String(input.tokens) +
    ' токенов для генераций в Trinity S³AI — это ' +
    String(input.stars) +
    ' ⭐️ Stars, оплата в один тап прямо здесь:'
  return [
    hello,
    offer,
    input.url,
    'После оплаты токены сразу на твоём балансе в приложении. Если что-то непонятно — спрашивай, я рядом.',
  ].join('\n\n')
}

export const CRM_OFFER_TOOLS: AgentTool[] = [
  {
    name: 'crm_offer',
    description:
      'ЛИЧНЫЙ ПРОДАВЕЦ. Собирает предложение человеку: пакет токенов, цена в Stars и ссылка на оплату в один тап, ' +
      'выписанная НА ЕГО имя. НЕ ОТПРАВЛЯЕТ: возвращает proposal, владелец видит текст целиком и подтверждает ' +
      'кнопкой в боте. После реальной отправки касание «написали» запишется само. ' +
      'chat — @username или числовой id; tokens — сколько токенов (по умолчанию 50); note — под какую задачу. ' +
      'Имя в приветствии берётся из Telegram (как человек сам себя назвал), передавать его не нужно.',
    parameters: {
      type: 'object',
      properties: {
        chat: {
          type: 'string',
          description: '@username или числовой id получателя',
        },
        tokens: {
          type: 'number',
          description: 'сколько токенов предложить (1..)',
        },
        note: { type: 'string', description: 'под какую задачу, одной фразой' },
      },
      required: ['chat'],
    },
    async handler(a: Record<string, any>, ctx) {
      /*
       * THE OWNER WALL IS THE OUTER WALL.
       *
       * It used to live only inside propose(), the LAST step -- after a real
       * invoice link had been minted and a pending row written for whoever
       * asked. Any bot user could cause that through the agent and only then
       * be refused. Reproduced by the pre-merge probe. Nothing here moves
       * before this line.
       */
      requireOwner(ctx)
      const chat = String(a?.chat ?? '').trim()
      const tokens =
        Number(a?.tokens) > 0 ? Math.floor(Number(a.tokens)) : DEFAULT_TOKENS

      /*
       * SURFACE FIRST, BEFORE ANY MONEY MOVES.
       *
       * propose() queues only where a press is possible. Checking that only
       * inside propose() meant a call from the mini app or /mcp had already
       * minted a real, payable invoice link and written a pending row -- for
       * a draft that was then dropped. Same words the queue would have used,
       * one step earlier.
       */
      if (String(ctx?.surface ?? '') !== 'bot') {
        return {
          proposal: true,
          action: 'send',
          target: chat,
          why:
            'Подтвердить это можно только в чате бота — там есть кнопки ' +
            '«Отправить / Отмена». Скажи человеку открыть бота и повторить просьбу.',
        }
      }
      const lead = await resolveLead(ctx, chat)
      const leadId = lead.id

      /*
       * Is this person in our base and ours to touch? Decides whether a touch
       * can be RECORDED after the send, and names the bot they belong to. It
       * does not decide whether the owner may sell to them -- a personal
       * seller exists precisely for people who have not walked into a bot yet.
       */
      const may = await reachable(ctx, leadId).catch(() => ({
        ok: false as const,
        why: 'база недоступна',
      }))

      /*
       * THE CASHIER IS THE PERSON'S OWN BOT.
       *
       * This is a farm: the invoice is a message from a bot, and it must come
       * from the bot the person already knows and whose owner books the sale.
       * The farm answers by username; a bot it does not know leaves the
       * default cashier in place rather than refusing the sale.
       */
      const cashier = may.ok
        ? await tokenForBot(may.botName).catch(() => null)
        : null

      /*
       * The invoice is minted BEFORE the proposal, so the draft the owner reads
       * contains the real link and not a placeholder. A pitch approved with
       * "link goes here" is a pitch approved blind.
       */
      const minted = await mintTokenInvoice({
        forTelegramId: leadId,
        tokens,
        pool: ctx?.pool as never,
        ...(cashier ? { botToken: cashier.token } : {}),
      })

      /*
       * THE NAME IS TELEGRAM'S, NOT THE MODEL'S.
       *
       * The first real pitch greeted the owner's wife by a name the model had
       * been told in a prompt -- a name from a test fixture. A person's first
       * name is whatever they typed into Telegram; the entity has it, and the
       * base has it for people who walked into a bot. The model is not asked.
       */
      const text = composePitch({
        name: lead.firstName ?? (may.ok ? may.name : null),
        tokens: minted.tokens,
        stars: minted.stars,
        url: minted.url,
        note: a?.note ? String(a.note) : undefined,
      })

      const p = propose(
        'send',
        chat,
        text,
        'Предложение ждёт подтверждения владельца. Покажи текст целиком и ссылку — он нажмёт «Отправить» в боте.',
        ctx,
        may.ok ? leadId : undefined,
        may.ok ? may.botName : undefined,
        {
          display: lead.display ?? undefined,
          invoiceId: minted.invoiceId,
        }
      )

      return {
        ...p,
        invoice: {
          id: minted.invoiceId,
          tokens: minted.tokens,
          stars: minted.stars,
          url: minted.url,
          for_telegram_id: leadId,
          bot: cashier ? '@' + cashier.username : 'касса по умолчанию',
        },
        touch: may.ok
          ? 'после отправки запишется касание «написали»'
          : `касание не запишется: ${may.why}; после оплаты человек появится в базе`,
      }
    },
  },
]
