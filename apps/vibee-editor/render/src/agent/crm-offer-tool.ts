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
import { propose, client } from './telegram-tools'
import { mintTokenInvoice } from './token-invoice'
import { reachable } from './crm-touch-tools'

/** The middle pack: enough to feel real, small enough to say yes to. */
const DEFAULT_TOKENS = 50

const NUMERIC = /^-?\d{5,15}$/

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
  const raw = String(chat ?? '').trim()
  if (NUMERIC.test(raw)) return raw.replace(/^-/, '')
  if (!raw) throw new Error('не сказано, кому предлагать')
  const c = (await client(ctx)) as {
    getEntity?: (x: string) => Promise<{ id?: { toString(): string } }>
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
    try {
      const entity = await c.getEntity?.(raw)
      id = entity?.id?.toString()
    } catch {
      id = undefined
    }
    if (!id || !NUMERIC.test(id)) {
      throw new Error(
        `не нашёл ${raw} в вашем Telegram — назовите по числовому id из tg_dialogs`
      )
    }
    return id
  } finally {
    await c.disconnect?.().catch?.(() => undefined)
  }
}

/**
 * The words. Short, personal, with the price and the link in the open.
 *
 * Written as a draft the owner will read in full before pressing anything, so
 * it is honest rather than clever: what they get, what it costs, where to tap.
 */
export function composePitch(input: {
  name?: string | null
  tokens: number
  stars: number
  url: string
  note?: string
}): string {
  // Plain string pieces joined with +: the no-cyrillic gate cannot see inside
  // a template's interpolation, and a nested template here read as code.
  const hello = input.name ? input.name + ', привет!' : 'Привет!'
  const task = input.note ? 'Под задачу «' + input.note.trim() + '» ' : ''
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
      'chat — @username или числовой id; tokens — сколько токенов (по умолчанию 50); note — под какую задачу.',
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
        name: { type: 'string', description: 'как обратиться (имя)' },
      },
      required: ['chat'],
    },
    async handler(a: Record<string, any>, ctx) {
      const chat = String(a?.chat ?? '').trim()
      const tokens =
        Number(a?.tokens) > 0 ? Math.floor(Number(a.tokens)) : DEFAULT_TOKENS

      // Owner-only, and the same refusal wording as every Telegram tool: this
      // sends from the owner's account, whatever the model was told.
      const leadId = await resolveLeadId(ctx, chat)

      /*
       * The invoice is minted BEFORE the proposal, so the draft the owner reads
       * contains the real link and not a placeholder. A pitch approved with
       * "link goes here" is a pitch approved blind.
       */
      const minted = await mintTokenInvoice({
        forTelegramId: leadId,
        tokens,
        pool: ctx?.pool as never,
      })

      /*
       * Is this person in our base and ours to touch? Decides only whether a
       * touch can be RECORDED after the send. It does not decide whether the
       * owner may sell to them -- a personal seller exists precisely for people
       * who have not walked into a bot yet.
       */
      const may = await reachable(ctx, leadId).catch(() => ({
        ok: false as const,
        why: 'база недоступна',
      }))

      const text = composePitch({
        name: a?.name ? String(a.name) : null,
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
        may.ok ? may.botName : undefined
      )

      return {
        ...p,
        invoice: {
          tokens: minted.tokens,
          stars: minted.stars,
          url: minted.url,
          for_telegram_id: leadId,
        },
        touch: may.ok
          ? 'после отправки запишется касание «написали»'
          : `касание не запишется: ${may.why}; после оплаты человек появится в базе`,
      }
    },
  },
]
