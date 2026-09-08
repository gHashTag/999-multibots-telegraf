import type { AgentTool, ToolContext } from './tools'
import { propose, requireOwner } from './telegram-tools'
import { resolveLead, oneLine } from './crm-offer-tool'
import { reachable } from './crm-touch-tools'
import {
  TOKEN_PRICES,
  balanceOf,
  FIRST_ROW_GRANT,
  владелец, // cyrillic-ok: public API field
} from './billing-shared'

/**
 * THE SERVICE, DELIVERED IN THE DM.
 *
 * "Сделай фото" in a private chat is the sale; this is the delivery. The
 * owner (in the bot, surface `bot`) asks for a picture for a person from
 * the correspondence; the picture is made on the OWNER's turn -- their
 * generation cap, their gallery row, their exemption -- and put on a card
 * with a preview. Nothing is charged here. The recipient is charged at the
 * press, inside `execute`, and refunded exactly if the send fails.
 *
 * Order of refusals, cheapest first: not the owner; not a surface with a
 * button; the person cannot be resolved; the person cannot afford it. Only
 * then the provider is asked, because that is where money leaves.
 */
const OP = 'image_generate'
const CAPTION_CHARS = 900

export function makeCrmDeliverTools(
  lookup: (name: string) => AgentTool | undefined
): AgentTool[] {
  return [
    {
      name: 'crm_deliver_photo',
      description:
        'Сделать картинку для человека из переписки и подготовить отправку ему в личку. ' +
        'Ничего не отправляет и ничего не списывает сам: возвращает предложение с превью, ' +
        'владелец нажимает «Отправить» в боте — тогда фото уходит получателю, а токены ' +
        'списываются с ПОЛУЧАТЕЛЯ по цене image_generate. Если у получателя не хватает ' +
        'токенов — откажет до генерации и подскажет crm_offer.',
      parameters: {
        type: 'object',
        properties: {
          chat: {
            type: 'string',
            description: '@username или числовой id получателя',
          },
          prompt: { type: 'string', description: 'что нарисовать' },
          caption: {
            type: 'string',
            description:
              'подпись к фото для получателя, одной строкой (необязательно)',
          },
        },
        required: ['chat', 'prompt'],
        additionalProperties: false,
      },
      async handler(a: Record<string, any>, ctx?: ToolContext) {
        requireOwner(ctx)
        const chat = String(a?.chat ?? '').trim()
        const prompt = String(a?.prompt ?? '').trim()
        if (!prompt) throw new Error('не сказано, что нарисовать')
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
        const price = TOKEN_PRICES[OP]
        const pool = ctx?.pool as never
        const free = владелец(lead.id) // cyrillic-ok: public API field
        const have = free
          ? Number.POSITIVE_INFINITY
          : ((await balanceOf(pool, lead.id)) ?? FIRST_ROW_GRANT)
        if (have < price) {
          return {
            delivered: false,
            // cyrillic-ok: public API field
            причина:
              `у получателя ${have} токенов, услуга стоит ${price} — ` +
              'сначала предложи пополнить счёт (crm_offer), потом повтори',
            price,
            lead_balance: have,
          }
        }
        const gen = lookup('image_generate')
        if (!gen)
          throw new Error('генерация картинок недоступна на этом сервере')
        const made = (await gen.handler({ prompt }, ctx as ToolContext)) as {
          url?: string
          причина?: string // cyrillic-ok: public API field
        }
        if (!made?.url) {
          return {
            delivered: false,
            причина: made?.причина ?? 'картинка не получилась', // cyrillic-ok: public API field
            price,
          }
        }
        const caption = oneLine(
          a?.caption ? String(a.caption) : '',
          CAPTION_CHARS
        )
        const may = await reachable(ctx, lead.id).catch(() => ({
          ok: false as const,
          why: 'база недоступна',
        }))
        const p = propose(
          'send',
          chat,
          caption || undefined,
          'Фото готово и ждёт подтверждения владельца. Покажи ссылку на превью. ' +
            'Токены спишутся с получателя при нажатии «Отправить», не сейчас.',
          ctx,
          may.ok ? lead.id : undefined,
          may.ok ? may.botName : undefined,
          {
            display: lead.display ?? undefined,
            media: { kind: 'photo', url: made.url },
            charge: { telegramId: lead.id, op: OP, tokens: price },
          }
        )
        return {
          ...p,
          preview: made.url,
          price,
          lead_balance: free ? 'владелец — бесплатно' : have,
          note: 'списание с получателя произойдёт при нажатии «Отправить», не сейчас',
        }
      },
    },
  ]
}
