import type { AgentTool, ToolContext } from './tools'
import { propose, requireSeller } from './telegram-tools'
import { resolveLead, oneLine } from './crm-offer-tool'
import { personOf } from './chat-memory'
import { reachable } from './crm-touch-tools'
import {
  TOKEN_PRICES,
  balanceOf,
  FIRST_ROW_GRANT,
  владелец, // cyrillic-ok: public API field
} from './billing-shared'
import { LEAD_MAGNET_MODEL } from '../kie-image'
import { noteImagesFailed, noteImagesWorked } from './image-health'

/**
 * THE SERVICE, DELIVERED IN THE DM -- AND, BY DEFAULT, THE LEAD MAGNET.
 *
 * "Сделай фото" in a private chat is the sale; this is the delivery. The
 * owner (in the bot, surface `bot`) asks for a picture for a person from
 * the correspondence; the picture is made on the OWNER's turn -- their
 * generation cap, their gallery row -- and put on a card with a preview.
 * Nothing is sent until the owner presses the button.
 *
 * TWO MODES, one tool:
 *
 *  gift (default)  The lead magnet. The person's OWN Telegram photo is
 *                  redrawn (img2img, GPT Image 2.5 on Kie) as a vertical
 *                  9:16 story portrait and offered FREE: the owner pays the
 *                  generation on their own wallet, the recipient is charged
 *                  nothing, and the caption says who made it. A personal
 *                  artefact made from the person's own picture is the kind
 *                  of lead magnet that gets opened -- generic "content"
 *                  is not (spec: t27 specs/automation/crm-lead-magnet.t27).
 *                  No photo readable -> falls back to text-to-image, still
 *                  9:16, and says so in `source`.
 *
 *  paid            The old path: text-to-image, the recipient charged at the
 *                  press inside `execute`, refunded exactly if the send fails.
 *                  Refused before generation when the person cannot afford it.
 *
 * Order of refusals, cheapest first: not the owner; not a surface with a
 * button; the person cannot be resolved; (paid) the person cannot afford it.
 * Only then the provider is asked, because that is where money leaves.
 */
const PAID_OP = 'image_generate'
const CAPTION_CHARS = 900

export const LEAD_MAGNET = {
  model: LEAD_MAGNET_MODEL,
  /** The op the OWNER pays when the gift is drawn from the person's photo. */
  op: 'gpt_image_edit',
  aspectRatio: '9:16',
  /**
   * Identity FIRST, scene second. Face-consistency guides for img2img models
   * agree on the order: the model weighs the opening of the prompt most, so
   * the "same person" constraint goes before the scene text, phrased as
   * positive instructions (what to keep) rather than a list of don'ts.
   */
  identityPrefix:
    'Keep the exact same person as in the reference photo: same face, eye shape, ' +
    'nose, jawline, lips, skin tone and hairstyle; change only the scene, outfit, ' +
    'light and mood. ',
  /**
   * The 1080x1920 story frame is covered by app UI at the top (~14%) and the
   * bottom (~35%), so the face lives in the central band and nothing is
   * written into the picture: the caption carries the words.
   */
  framingSuffix:
    ' Vertical 9:16 story portrait, the face in the central third of the frame, ' +
    'nothing important in the top or bottom band, no text, no watermark, no logo.',
} as const

/** The gift caption: one line, a name, who made it, one soft question. No price, no link. */
export function giftCaption(firstName: string | null | undefined): string {
  const name = String(firstName ?? '').trim()
  return (
    (name ? `${name}, ` : '') +
    'это вы — мой ИИ-ассистент сделал портрет по вашей аватарке за минуту, ' +
    'в формате сторис 9:16. Это подарок, без оплаты. ' +
    'Хотите ещё один — в другом образе?'
  )
}

/**
 * image_generate speaks width/height, not aspect_ratio. 1080x1920 is the
 * story frame; the other two are the ratios the tool advertises.
 */
export function sizeFor(aspectRatio: string): {
  width: number
  height: number
} {
  switch (aspectRatio) {
    case '1:1':
      return { width: 1024, height: 1024 }
    case '3:4':
      return { width: 1080, height: 1440 }
    default:
      return { width: 1080, height: 1920 }
  }
}

export interface CrmDeliverDeps {
  /** The lead's profile photo as a URL on our S3; '' when there is none. */
  leadPhoto?: (
    ctx: ToolContext | undefined,
    lead: { id: string; username?: string | null }
  ) => Promise<string>
}

export function makeCrmDeliverTools(
  lookup: (name: string) => AgentTool | undefined,
  deps: CrmDeliverDeps = {}
): AgentTool[] {
  return [
    {
      name: 'crm_deliver_photo',
      description:
        'Сделать человеку из переписки ЛИД-МАГНИТ: его же аватарка из Telegram, перерисованная ' +
        `в вертикальный портрет 9:16 (img2img, ${LEAD_MAGNET_MODEL}), в подарок — получатель ` +
        'не платит, генерацию оплачивает владелец со своего кошелька. Ничего не отправляет сам: ' +
        'возвращает предложение с превью, владелец нажимает «Отправить» в боте. ' +
        'Если фото человека не читается — рисует по описанию (тоже 9:16) и говорит об этом. ' +
        'gift=false — платный режим: картинка по описанию, токены списываются с ПОЛУЧАТЕЛЯ ' +
        'при нажатии по цене image_generate; при нехватке откажет до генерации и подскажет crm_offer.',
      parameters: {
        type: 'object',
        properties: {
          chat: {
            type: 'string',
            description: '@username или числовой id получателя',
          },
          prompt: {
            type: 'string',
            description:
              'сцена/образ: во что перерисовать человека (в подарке) или что нарисовать (в платном режиме)',
          },
          caption: {
            type: 'string',
            description:
              'подпись к фото для получателя, одной строкой (необязательно; ' +
              'в подарке по умолчанию — имя, кто сделал, один мягкий вопрос)',
          },
          gift: {
            type: 'boolean',
            description:
              'true (по умолчанию) — подарок из его фото, получатель не платит; false — платно по описанию',
          },
          from_photo: {
            type: 'boolean',
            description:
              'true (по умолчанию) — исходник = аватарка человека; false — рисовать по описанию',
          },
          aspect_ratio: {
            type: 'string',
            description: '9:16 по умолчанию (сторис); 1:1, 3:4',
          },
        },
        required: ['chat', 'prompt'],
        additionalProperties: false,
      },
      async handler(a: Record<string, any>, ctx?: ToolContext) {
        await requireSeller(ctx)
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
        const gift = a?.gift !== false
        /*
         * A GIFT MAY REACH SOMEBODY WITH NO WALLET. THAT IS THE POINT OF IT.
         *
         * resolveLead accepts a bare number only for a person already in
         * `users`, and the reason it gives is exact: an invoice credits
         * whatever id is in it, so a mistyped number sends the lead's Stars to
         * a stranger. The same comment names the way out -- "somebody not in
         * the base is named by @username, which Telegram resolves for real".
         *
         * The sweep cannot take that way out. crm_leads hands the model a
         * NUMERIC lead, so the gift is refused for exactly the people it
         * exists for. Production, 2026-09-15, the seller's own words in the
         * hive journal: "deliver is not possible for him -- crm_deliver_photo
         * refused (not in the base, name him by @username)".
         *
         * None of the money reasoning applies to a gift: price is 0, no
         * invoice is minted, no charge rides on the card (`charge` is
         * undefined when `gift`), and the house pays the drawing. So for the
         * GIFT path only, a person our own CRM knows by @username is resolved
         * the way the comment says -- through Telegram, which verifies the
         * name for real. The paid path keeps the gate untouched.
         */
        let lead: Awaited<ReturnType<typeof resolveLead>>
        try {
          lead = await resolveLead(ctx, chat)
        } catch (e) {
          const numeric = /^\d{5,15}$/.test(chat)
          const known =
            gift && numeric && ctx?.pool
              ? await personOf(
                  ctx.pool as never,
                  String(ctx?.telegramId ?? ''),
                  chat
                ).catch(() => null)
              : null
          const handle = String(known?.username ?? '').replace(/^@/, '')
          if (!handle) throw e
          // Telegram resolves the name, so a wrong one fails here rather than
          // reaching a stranger.
          lead = await resolveLead(ctx, '@' + handle)
        }
        const fromPhoto = a?.from_photo !== false
        const aspectRatio = a?.aspect_ratio
          ? String(a.aspect_ratio)
          : LEAD_MAGNET.aspectRatio
        const pool = ctx?.pool as never
        const free = владелец(lead.id) // cyrillic-ok: public API field
        const price = gift ? 0 : TOKEN_PRICES[PAID_OP]
        const have = free
          ? Number.POSITIVE_INFINITY
          : ((await balanceOf(pool, lead.id)) ?? FIRST_ROW_GRANT)
        if (!gift && have < price) {
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

        /*
         * THE SOURCE. The person's own photo, or nothing. A gift portrait of
         * a stranger is worse than an honest text-to-image picture, so a
         * missing photo is reported in `source`, not papered over.
         */
        let source = ''
        if (gift && fromPhoto && deps.leadPhoto) {
          source = await deps
            .leadPhoto(ctx, {
              id: lead.id,
              username: chat.startsWith('@') ? chat : null,
            })
            .catch(() => '')
        }

        let made: { url?: string; причина?: string; reason?: string } // cyrillic-ok: public API field
        let model: string
        if (source) {
          const edit = lookup('image_edit')
          if (!edit)
            throw new Error('перерисовка фото недоступна на этом сервере')
          // The OWNER pays the gift: no chargeLater, their wallet, their cap.
          made = (await edit.handler(
            {
              prompt:
                LEAD_MAGNET.identityPrefix + prompt + LEAD_MAGNET.framingSuffix,
              image_url: source,
              aspect_ratio: aspectRatio,
              model: LEAD_MAGNET.model,
            },
            ctx as ToolContext
          )) as typeof made
          model = LEAD_MAGNET.model
        } else {
          const gen = lookup('image_generate')
          if (!gen)
            throw new Error('генерация картинок недоступна на этом сервере')
          // Paid: the owner's turn makes the picture, the recipient pays at
          // the press (chargeLater). Gift without a photo: the owner pays now.
          made = (await gen.handler(
            {
              prompt: prompt + LEAD_MAGNET.framingSuffix,
              ...sizeFor(aspectRatio),
            },
            gift
              ? (ctx as ToolContext)
              : { ...(ctx as ToolContext), chargeLater: true }
          )) as typeof made
          model = 'image_generate'
        }
        if (!made?.url) {
          // The one place that knows whether pictures actually work: a real
          // attempt just came back. The playbook reads this instead of asking
          // the provider, which would cost a generation to find out.
          noteImagesFailed(made?.причина ?? made?.reason) // cyrillic-ok: field name
          return {
            delivered: false,
            // cyrillic-ok: public API field
            причина: made?.причина ?? made?.reason ?? 'картинка не получилась',
            price,
            source: source ? 'фото человека' : 'по описанию',
          }
        }
        noteImagesWorked()
        const caption = oneLine(
          a?.caption
            ? String(a.caption)
            : gift
              ? giftCaption(lead.firstName)
              : '',
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
          (gift
            ? 'Подарок готов и ждёт подтверждения владельца. Покажи ссылку на превью. ' +
              'Получатель не платит ничего; генерация уже оплачена владельцем. '
            : 'Фото готово и ждёт подтверждения владельца. Покажи ссылку на превью. ' +
              'Токены спишутся с получателя при нажатии «Отправить», не сейчас. ') +
            'Пока карточка не нажата, не готовь этому владельцу других предложений: новое вытеснит фото.',
          ctx,
          may.ok ? lead.id : undefined,
          may.ok ? may.botName : undefined,
          {
            display: lead.display ?? undefined,
            media: { kind: 'photo', url: made.url },
            // A gift and an owner-side recipient are never charged, so the
            // card must not promise a charge either.
            charge:
              gift || free
                ? undefined
                : { telegramId: lead.id, op: PAID_OP, tokens: price },
            gift: gift || undefined,
          }
        )
        return {
          ...p,
          preview: made.url,
          gift,
          source: source ? 'фото человека' : 'по описанию',
          aspect_ratio: aspectRatio,
          model,
          price,
          lead_balance: gift
            ? 'подарок — получатель не платит'
            : free
              ? 'владелец — бесплатно'
              : have,
          note: gift
            ? 'генерация оплачена владельцем; с получателя ничего не спишется'
            : 'списание с получателя произойдёт при нажатии «Отправить», не сейчас',
        }
      },
    },
  ]
}
