/**
 * THE CLUB INVOICE, HANDED OVER IN THE CHAT -- WHEN THE PERSON ASKED FOR IT.
 *
 * Measured 2026-09-22: 49 new people came to the bots in thirty days and 5 of
 * them ever opened the Mini App. The agent could mint a token invoice
 * (tokens_invoice, crm_offer), but for the club -- the one subscription --
 * it could only say "go to the profile of the Mini App": somewhere 44 of the
 * 49 had never been. A person who said "I want the club" in the chat was sent
 * away from the chat to buy it.
 *
 * ONE DECISION, THREE DOORS. The Mini App's paywall and the bot's club card
 * reach `/api/club/invoice`; this tool calls the function that route calls,
 * `clubInvoiceFor` (club-membership.ts): the same refusal of a paid member,
 * the same cashier, the same alarm when the cashier fails, the same journal
 * line. Nothing about the club's price, payload or period is decided here,
 * and the sentence the agent says comes from `clubOfferLine` -- the one
 * source the prompt and `pricing` already read.
 *
 * ONE CASHIER, AND NOT THE PERSON'S OWN BOT. Token invoices are minted by the
 * person's own farm bot (bot-farm.ts). The club cannot be: it is a Stars
 * SUBSCRIPTION, every renewal is charged into the ledger of the bot that
 * minted it, and the render books club months from exactly one ledger. So
 * the cashier is `clubCashierToken()`, the one the route and the hourly sweep
 * read; a club invoice from a farm bot would be a paid month nobody credits.
 * A test pins that a known farm bot does not change it.
 *
 * WHO GETS NO INVOICE, AND WHAT THEY HEAR INSTEAD.
 *  - A paid month is running: "you are in, until <date>".
 *  - A bot owner or a keeper: the club is theirs without paying and the
 *    month's tokens arrive by themselves, so the agent does not sell it to
 *    them. The prompt has said so since 2026-09-10; now the tool enforces it.
 *  - The client in the owner's DM (surface `business`): the club is not sold
 *    there at all (pricingSummary, the DM prompt).
 * A guest pass is an invitation, not a purchase: the route sells to a guest
 * who asks (2026-09-22), and so does this.
 *
 * WHEN. Only when the person asked about the club, the price or their twin
 * and wants in: conversation first, payment after. The description says it,
 * with the prompt's own rule (CLUB_OFFER_WHEN) appended rather than retyped.
 *
 * THE PAY BUTTON. The bot turns a `https://t.me/$...` link in the answer into
 * a pay button (payRow in the bot's actionButtons.ts) -- the same path every
 * token invoice takes. So the result tells the model to put the link on its
 * own line, as is.
 *
 * THE FUNNEL. The card's "Join" press writes `club_invoice_created`; an
 * invoice the agent hands over is the same fact and writes the same row
 * (user-events.ts), so the funnel and the abandoned-invoice sweep see it.
 */
import type { AgentTool, ToolContext } from './tools'
import {
  CLUB_OFFER_WHEN,
  clubCashierToken,
  clubGrantFor,
  clubInvoiceFor,
  clubOfferLine,
  type ClubGrantSource,
  type ClubStatus,
} from './club-membership'
import { botsOwnedBy } from './hive-tools'
import { botNameOf } from './bot-farm'
import { trackUserEvent } from './user-events'

export const CLUB_INVOICE_TOOL = 'club_invoice'

export interface ClubInvoiceToolDeps {
  /** The club's one cashier. */
  cashierToken: () => string
  /** Who is in the club without paying. */
  grant: ClubGrantSource
  /** Injected so a test can stand in for Telegram's createInvoiceLink. */
  fetchImpl?: typeof fetch
  now?: () => Date
  /** The farm bot the person belongs to, for the funnel row. */
  botNameOf: (telegramId: string) => Promise<string | null>
  track: typeof trackUserEvent
}

/** 2026-10-22T... -> "22 октября 2026", or null when there is no date. */
export function untilWords(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return null
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** What the model tells somebody who is already in. */
export function memberSentence(s: ClubStatus): string {
  const until = untilWords(s.until)
  if (s.paid) {
    return (
      `Человек уже в клубе: оплачено до ${until ?? 'конца периода'} ` + // cyrillic-ok: tool result copy
      `(осталось дней: ${s.days_left}). Новый счёт не нужен: продление Telegram ` + // cyrillic-ok: tool result copy
      'спишет сам, отмена — в настройках Telegram.' // cyrillic-ok: tool result copy
    )
  }
  const who = s.granted === 'keeper' ? 'хранителю' : 'владельцу бота' // cyrillic-ok: tool result copy
  return (
    `Клуб открыт человеку без оплаты — как ${who}; токены за месяц приходят сами` + // cyrillic-ok: tool result copy
    (until ? `, текущий период до ${until}` : '') + // cyrillic-ok: tool result copy
    '. Счёт за клуб ему не нужен.' // cyrillic-ok: tool result copy
  )
}

const PERSON = /^\d{5,15}$/

export function makeClubInvoiceTool(deps: ClubInvoiceToolDeps): AgentTool {
  return {
    name: CLUB_INVOICE_TOOL,
    description:
      'Счёт на вступление в клуб (подписка Telegram Stars) для человека, с которым ты говоришь. ' +
      'Зови ТОЛЬКО когда человек сам спросил про клуб, про цену или про своего цифрового ' +
      'двойника и сказал, что хочет вступить: сначала разговор, потом оплата. ' +
      'Возвращает ссылку и строку предложения (offer): цену называй только из неё, ссылку ' +
      'дай отдельной строкой как есть — в боте под ответом появится кнопка оплаты. ' +
      'Кто уже в клубе (оплачен месяц, владелец бота, хранитель), счёта не получит — ' +
      'инструмент скажет, до какого числа клуб открыт. Бесплатно: деньги спишет Telegram ' +
      'только после подтверждения человеком. ' +
      CLUB_OFFER_WHEN,
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async handler(_args, ctx: ToolContext) {
      if (ctx.surface === 'business') {
        return {
          ok: false,
          refused: 'not_sold_here',
          say: 'Клиенту в личке клуб не продаётся — только токены (tokens_invoice).', // cyrillic-ok: tool result copy
        }
      }
      // The person is the one the call was proven for; never an argument.
      const who = String(ctx.telegramId ?? '').trim()
      if (!PERSON.test(who)) {
        return {
          ok: false,
          refused: 'not_a_person',
          say: 'Клуб оформляется человеку, а не чату или каналу.', // cyrillic-ok: tool result copy
        }
      }
      const granted = await clubGrantFor(who, deps.grant)
      const out = await clubInvoiceFor(ctx.pool, {
        who,
        granted,
        botToken: deps.cashierToken(),
        fetchImpl: deps.fetchImpl,
        now: deps.now?.(),
        fundedPassIsMembership: true,
      })
      if (out.kind === 'member') {
        return {
          ok: false,
          already_member: true,
          paid: out.status.paid,
          granted: out.status.granted,
          until: out.status.until,
          days_left: out.status.days_left,
          say: memberSentence(out.status),
        }
      }
      if (out.kind === 'unavailable') {
        return {
          ok: false,
          error: out.error,
          say: 'Касса клуба сейчас не ответила — предложи попробовать через минуту или позвать человека.', // cyrillic-ok: tool result copy
        }
      }
      const minted = out.minted
      // Fire and forget, like every funnel write: nobody waits on it.
      void (async () => {
        const botName = await deps.botNameOf(who).catch(() => null)
        await deps.track(ctx.pool, {
          telegramId: who,
          botName,
          event: 'club_invoice_created',
          detail: {
            stars: minted.stars,
            via: 'agent',
            surface: ctx.surface ?? null,
          },
        })
      })().catch(() => {})
      return {
        ok: true,
        link: minted.url,
        offer: clubOfferLine(),
        stars: minted.stars,
        period_days: Math.round(minted.period_s / 86_400),
        tokens_back: minted.tokens,
        ...(out.status.granted === 'guest'
          ? {
              guest_pass:
                'У человека гостевой пропуск: двойника он настроить уже может, оплата добавит токены каждые 30 дней.', // cyrillic-ok: tool result copy
            }
          : {}),
        say:
          'Скажи предложение (offer) одной строкой, а ссылку — следующей строкой как есть: ' + // cyrillic-ok: tool result copy
          'в боте под ответом появится кнопка оплаты. Отмена подписки — в настройках Telegram.', // cyrillic-ok: tool result copy
      }
    },
  }
}

export const CLUB_INVOICE_TOOLS: AgentTool[] = [
  makeClubInvoiceTool({
    cashierToken: () => clubCashierToken(),
    // Bot owners by `avatars` and the keepers (the default). No name lookup:
    // a guest is sold to like anybody else, so only the funded passes matter.
    grant: { botsOwnedBy },
    botNameOf,
    track: trackUserEvent,
  }),
]
