import type { AgentTool, ToolContext } from './tools'
import { propose, requireSeller, requireOwner } from './telegram-tools'
import { resolveLead, oneLine } from './crm-offer-tool'
import { personOf } from './chat-memory'
import { reachable } from './crm-touch-tools'
import {
  TOKEN_PRICES,
  balanceOf,
  FIRST_ROW_GRANT,
  владелец, // cyrillic-ok: public API field
} from './billing-shared'
import {
  LEAD_MAGNET_MODEL,
  kieTaskState,
  type KieTaskState,
} from '../kie-image'
import { noteImagesFailed, noteImagesWorked } from './image-health'
import {
  noteOwed,
  settleOwed,
  debtOf,
  attachTask,
  markReady,
  clearTask,
} from './crm-owed'
import {
  watchLate,
  lookOnce,
  isWatching,
  type LateDeps,
  type LateOutcome,
} from './late-picture'
import {
  clientFace,
  askForPhotoLine,
  NO_PERSON_PREFIX,
  type FaceDeps,
  type SentPhoto,
} from './client-face'
import { record } from '../hive/journal'

/**
 * THE SERVICE, DELIVERED IN THE DM -- AND, BY DEFAULT, THE LEAD MAGNET.
 *
 * "Сделай фото" in a private chat is the sale; this is the delivery. The
 * owner (in the bot, surface `bot`) asks for a picture for a person from
 * the correspondence; the picture is made on the OWNER's turn -- their
 * generation cap, their gallery row -- and put on a card with a preview.
 * Nothing is sent until the owner presses the button.
 *
 * THE FACE IS MANDATORY (owner, 2026-09-21). A picture of a person made for a
 * client is drawn from THAT client's face -- a photo they sent, or their
 * Telegram avatar (client-face.ts) -- img2img with GPT Image 2.5 on Kie, 9:16.
 * There is no "draw the person from a description" path any more: with no
 * face to draw from, the tool prepares one short line asking for a photo.
 * `no_person` is the only text-to-image door, and it forbids people outright.
 *
 * TWO WALLETS, one tool:
 *
 *  gift (default)  The lead magnet, offered FREE: the owner pays the
 *                  generation on their own wallet, the recipient is charged
 *                  nothing, and the caption says who made it (spec: t27
 *                  specs/automation/crm-lead-magnet.t27).
 *
 *  paid            The recipient is charged at the press inside `execute`,
 *                  at the price of the work actually done, and refunded
 *                  exactly if the send fails. Refused before generation when
 *                  the person cannot afford it.
 *
 * A PORTRAIT ALREADY PAID FOR COMES FIRST (late-picture.ts). Before anything
 * is drawn, the person's open debt is read: a finished late portrait is handed
 * over as it is, and a task still drawing is asked about -- never paid for a
 * second time.
 *
 * Order of refusals, cheapest first: not the owner; not a surface with a
 * button; the person cannot be resolved; (paid) the person cannot afford it.
 * Only then the provider is asked, because that is where money leaves.
 */
const CAPTION_CHARS = 900

/**
 * HOW LONG A TURN WAITS FOR THE PORTRAIT ITSELF.
 *
 * The sweep that carries this turn has a 90 s step budget
 * (src/inngest_app/functions/crm/crmProactiveSweep.ts SWEEP_STEP_BUDGET_MS),
 * and the model turn around it a 180 s ceiling. GPT Image 2.5 has answered in
 * 75 s and in 380 s. Waiting 180 s inside a 180 s turn meant the answer could
 * never arrive in time -- the portrait was paid for and thrown away.
 *
 * So the turn waits a minute -- inside the budget with room for the model's
 * own steps -- and a slower portrait is not a failure: its task id goes onto
 * the debt, a background watch keeps asking, and the next card carries it.
 */
export const PORTRAIT_WAIT_MS = 60_000

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

/** What the seller is told while the portrait is still being drawn. */
export const PORTRAIT_DRAWING =
  'Портрет ещё рисуется у провайдера — он уже оплачен один раз и придёт ' + // cyrillic-ok: message to the agent
  'карточкой владельцу, как только будет готов (следующий обход отдаст его). ' + // cyrillic-ok: message to the agent
  'Не рисуй этому человеку другой картинки и не пиши, что не получилось.' // cyrillic-ok: message to the agent

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
  /** Photos this person sent the owner, newest first (client-face.ts). */
  sentPhotos?: (
    ctx: ToolContext | undefined,
    lead: string
  ) => Promise<SentPhoto[]>
  /** One recordInfo. Default: kie-image.ts kieTaskState. */
  checkTask?: (taskId: string) => Promise<KieTaskState>
  /**
   * Copy a provider's temporary file to our storage and the owner's gallery,
   * exactly as image_edit stores its own result. Returns our URL, '' on failure.
   */
  keepImage?: (
    ctx: ToolContext,
    providerUrl: string,
    note: string
  ) => Promise<string>
}

/**
 * A REFUSED GIFT LEAVES A LINE, BECAUSE NOTHING ELSE DOES.
 *
 * MEASURED 2026-09-16: gpt_image_edit -- the lead magnet's op -- appears ZERO
 * times in the journal, over 62 prepared cards, while four of the top five
 * candidates every tick ask for exactly that step. Everything it needs is in
 * place: the tool wired with the lead's avatar, 7571 tokens against a price
 * of 12, 4947 credits at the drawing provider, the tool in the compact kit.
 *
 * And I could not find out why, because a refusal here goes back to the model
 * as a field it is free to ignore -- and it does, writing text instead. Three
 * cycles of reading the code produced three wrong causes: the FAL balance (a
 * different provider), the wiring (present), a crowded queue (not crowded).
 *
 * So the refusal is written down. One line per refusal, with the reason and
 * nothing about the person: after the next deploy the question is answered by
 * a query instead of by another guess.
 */
async function noteGift(
  ctx: unknown,
  why: unknown,
  stage: string,
  kind: 'gift-refused' | 'gift-late' | 'gift-recovered' = 'gift-refused'
): Promise<void> {
  try {
    const c = ctx as { pool?: never; telegramId?: string }
    if (!c?.pool) return
    await record(c.pool, {
      kind,
      who: String(c.telegramId ?? '') || null,
      // Stage first so a hundred of these read as a tally: the reason text is
      // ours, never the client's words.
      what: `${stage}: ${String(why ?? '').slice(0, 150)}`,
      severity: 'normal',
    })
  } catch {
    /*
     * Bookkeeping: a journal that is down must not change what the seller
     * does. The real protection is inside `record`, which swallows its own
     * failures -- proven by mutation, this catch can be removed without any
     * test noticing. It stays as a second belt for the ctx access above, and
     * is documented as redundant rather than left to look load-bearing.
     */
  }
}

/** The background-watch dependencies, bound to the owner who paid. */
function lateDepsFor(ctx: ToolContext, deps: CrmDeliverDeps): LateDeps {
  return {
    check: deps.checkTask ?? kieTaskState,
    keep: (url, taskId) =>
      deps.keepImage
        ? deps.keepImage(ctx, url, `portrait, late task ${taskId}`)
        : Promise.resolve(''),
  }
}

/**
 * When the watch of a late portrait ends, write down what it came to.
 *
 * `ready` puts the finished picture on the debt, so the next delivery hands it
 * over; `failed` forgets the task (the debt stays: the person is still owed a
 * picture); `running` at the bound leaves the task id where it is, for the
 * next attempt to ask about.
 */
function followLate(
  ctx: ToolContext,
  owner: string,
  lead: string,
  taskId: string,
  deps: CrmDeliverDeps
): Promise<LateOutcome> {
  const pool = ctx.pool as never
  const watch = watchLate(taskId, lateDepsFor(ctx, deps))
  return watch.then(async out => {
    if (out.state === 'ready') {
      await markReady(pool, { owner, lead, url: out.url, taskId })
      await noteGift(ctx, `task ${taskId}`, 'late', 'gift-recovered')
    } else if (out.state === 'failed') {
      await clearTask(pool, { owner, lead, taskId, why: out.reason })
    }
    return out
  })
}

/**
 * A PORTRAIT ALREADY PAID FOR, IF THERE IS ONE -- asked BEFORE anything new.
 *
 *  ready     the debt holds a finished picture, or the stored task turns out
 *            to be finished now: hand it over, draw nothing.
 *  drawing   the stored task is still running (or a watch in this process is
 *            already asking): wait for it, draw nothing, pay nothing.
 *  null      nothing owed, nothing stored, or the stored task failed (then
 *            it is forgotten, and a new portrait may be drawn).
 */
async function portraitAlreadyPaid(
  ctx: ToolContext,
  owner: string,
  lead: string,
  deps: CrmDeliverDeps
): Promise<
  | { kind: 'ready'; url: string; taskId: string | null }
  | { kind: 'drawing'; taskId: string }
  | null
> {
  const pool = ctx.pool as never
  const debt = await debtOf(pool, owner, lead)
  if (!debt) return null
  if (debt.readyUrl)
    return { kind: 'ready', url: debt.readyUrl, taskId: debt.taskId ?? null }
  const taskId = debt.taskId
  if (!taskId) return null
  if (isWatching(taskId)) return { kind: 'drawing', taskId }
  const out = await lookOnce(taskId, lateDepsFor(ctx, deps))
  if (out.state === 'ready') {
    await markReady(pool, { owner, lead, url: out.url, taskId })
    await noteGift(ctx, `task ${taskId}`, 'stored-id', 'gift-recovered')
    return { kind: 'ready', url: out.url, taskId }
  }
  if (out.state === 'running') {
    // Nobody is watching it in this process (a redeploy): start again.
    void followLate(ctx, owner, lead, taskId, deps).catch(() => undefined)
    return { kind: 'drawing', taskId }
  }
  await clearTask(pool, { owner, lead, taskId, why: out.reason })
  return null
}

/**
 * HAS THIS PERSON HAD THEIR PORTRAIT? The one fact that decides the first gift.
 *
 * A package (crm_client_profile) used to decide it instead: the seller read a
 * reel template in the profile and made reels, and the portrait never came.
 * Now the profile carries this answer, and the brief asks it first.
 *
 * `given` is a sent gift in the touches (a card the owner pressed), not a
 * prepared one: a card that was never pressed gave the person nothing.
 */
export async function portraitOf(
  pool: unknown,
  owner: string,
  lead: string
): Promise<{
  given: boolean
  drawing: boolean
  ready: boolean
  first: string
}> {
  let given = false
  try {
    const { SELLER_NOTE_PREFIXES } = await import('./crm-notes')
    const r = await (pool as { query: Function }).query(
      `SELECT 1 FROM crm_touches
        WHERE owner_id = $1 AND lead_id = $2 AND note LIKE $3
        LIMIT 1`,
      [String(owner), String(lead), SELLER_NOTE_PREFIXES.gift + '%']
    )
    given = ((r as { rows?: unknown[] })?.rows ?? []).length > 0
  } catch {
    // No touches table yet is "no gift sent yet", which is also the truth.
  }
  const debt = await debtOf(pool as never, owner, lead)
  const ready = !!debt?.readyUrl
  const drawing = !ready && !!debt?.taskId
  return {
    given,
    drawing,
    ready,
    first: given
      ? 'портрет уже подарен — дальше пакет, рилс и остальное' // cyrillic-ok: message to the agent
      : ready
        ? 'портрет готов — отдай его: crm_deliver_photo, заново не рисуется' // cyrillic-ok: message to the agent
        : drawing
          ? 'портрет рисуется — придёт карточкой, второй не делай' // cyrillic-ok: message to the agent
          : 'сначала портрет из его лица: crm_deliver_photo, сцена и стиль — из пакета', // cyrillic-ok: message to the agent
  }
}

export function makeCrmDeliverTools(
  lookup: (name: string) => AgentTool | undefined,
  deps: CrmDeliverDeps = {}
): AgentTool[] {
  const faceDeps: FaceDeps = {
    avatar: deps.leadPhoto,
    sentPhotos: deps.sentPhotos,
  }
  return [
    {
      name: 'crm_deliver_photo',
      description:
        'ЛИД-МАГНИТ человеку из переписки: портрет 9:16 из ЕГО лица (img2img, GPT Image 2.5) — ' +
        'из присланного им фото или аватарки; чужое лицо не рисует, без фото сам готовит просьбу ' +
        'прислать фото. Подарок (по умолчанию) оплачивает владелец; уже оплаченный портрет ' +
        '(рисуется или готов) отдаёт без повторной оплаты. Возвращает карточку с превью — ' +
        'отправляет владелец кнопкой. gift=false — платно, с получателя при нажатии.',
      parameters: {
        type: 'object',
        properties: {
          chat: {
            type: 'string',
            description: '@username или числовой id получателя',
          },
          prompt: {
            type: 'string',
            description: 'сцена и стиль портрета (из пакета клиента)',
          },
          caption: {
            type: 'string',
            description: 'подпись одной строкой (необязательно)',
          },
          gift: {
            type: 'boolean',
            description: 'false — платно, с получателя',
          },
          photo_url: {
            type: 'string',
            description: 'фото, которое он сам прислал (из его файлов)',
          },
          no_person: {
            type: 'boolean',
            description: 'true — картинка без людей',
          },
          aspect_ratio: {
            type: 'string',
            description: '9:16 по умолчанию; 1:1, 3:4',
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
          await noteGift(ctx, 'surface is not the bot chat', 'surface')
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
        const noPerson = a?.no_person === true
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
        /*
         * A SELLER CHARGES ONLY THEIR OWN CLIENTS.
         *
         * Found by the adversarial security sweep of 2026-09-20 and confirmed
         * by three refuters. `isSeller` is true for anybody who connected
         * their OWN Telegram in the mini app -- a self-serve step, which is
         * fine as a role. But the paid path then resolved the target by
         * @username through GramJS on the caller's session, and Telegram
         * resolves ANY username. So a self-made "seller" could name a
         * stranger, have the picture drawn at chargeLater (spent: 0), and on
         * confirm debit the STRANGER's wallet for something they never asked
         * for.
         *
         * The role was being treated as proof of ownership of somebody else's
         * telegram_id. It is not. The boundary this codebase already uses
         * everywhere else is the owner: a lead belongs to a seller when the
         * seller has actually corresponded with them. So the PAID path now
         * requires the lead to be in the caller's own correspondence.
         *
         * The GIFT path is untouched and that is deliberate: the house pays
         * for a gift and no wallet but the owner's moves, so reaching a new
         * person by a verified @username is the feature, not the hole.
         */
        if (!gift && ctx?.pool) {
          const mine = await personOf(
            ctx.pool as never,
            String(ctx.telegramId ?? ''),
            lead.id
          ).catch(() => null)
          if (!mine) {
            await noteGift(
              ctx,
              "paid delivery to a person outside the caller's correspondence",
              'not-own-client'
            )
            return {
              delivered: false,
              // cyrillic-ok: public API field
              причина:
                'платная доставка возможна только вашим клиентам — тем, с кем ' + // cyrillic-ok: message to the agent
                'вы уже переписывались. Для нового человека есть подарок (gift).', // cyrillic-ok: message to the agent
            }
          }
        }

        const aspectRatio = a?.aspect_ratio
          ? String(a.aspect_ratio)
          : LEAD_MAGNET.aspectRatio
        const pool = ctx?.pool as never
        const owner = String(ctx?.telegramId ?? '')
        const free = владелец(lead.id) // cyrillic-ok: public API field
        // The recipient pays for the work actually done: a face is a GPT
        // Image 2.5 edit, a picture with nobody in it is a plain generation.
        const paidOp = noPerson ? 'image_generate' : LEAD_MAGNET.op
        const price = gift ? 0 : TOKEN_PRICES[paidOp]
        // Read below, once there is something to charge for.
        let have = Number.POSITIVE_INFINITY

        /**
         * The card, once there is a picture to put on it. `charged` is false
         * for a gift -- and for a portrait that was already paid for, which
         * nobody pays for a second time, whatever mode this call asked for.
         */
        const card = async (
          url: string,
          extra: Record<string, unknown>,
          charged: boolean = !gift
        ): Promise<Record<string, unknown>> => {
          noteImagesWorked()
          // The picture exists, for this person: whatever we owed them is paid.
          if (ctx?.pool) await settleOwed(pool, owner, lead.id)
          const caption = oneLine(
            a?.caption
              ? String(a.caption)
              : charged
                ? ''
                : giftCaption(lead.firstName),
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
            (charged
              ? 'Фото готово и ждёт подтверждения владельца. Покажи ссылку на превью. ' +
                'Токены спишутся с получателя при нажатии «Отправить», не сейчас. '
              : 'Подарок готов и ждёт подтверждения владельца. Покажи ссылку на превью. ' +
                'Получатель не платит ничего; генерация уже оплачена владельцем. ') +
              'Пока карточка не нажата, не готовь этому владельцу других предложений: новое вытеснит фото.',
            ctx,
            may.ok ? lead.id : undefined,
            may.ok ? may.botName : undefined,
            {
              display: lead.display ?? undefined,
              media: { kind: 'photo', url },
              // A gift and an owner-side recipient are never charged, so the
              // card must not promise a charge either.
              charge:
                !charged || free
                  ? undefined
                  : { telegramId: lead.id, op: paidOp, tokens: price },
              gift: !charged || undefined,
            }
          )
          return {
            ...p,
            preview: url,
            gift: !charged,
            aspect_ratio: aspectRatio,
            price: charged ? price : 0,
            lead_balance: !charged
              ? 'подарок — получатель не платит'
              : free
                ? 'владелец — бесплатно'
                : have,
            note: !charged
              ? 'генерация оплачена владельцем; с получателя ничего не спишется'
              : 'списание с получателя произойдёт при нажатии «Отправить», не сейчас',
            ...extra,
          }
        }

        /*
         * 1. THE PORTRAIT THAT IS ALREADY PAID FOR. Asked before any money is
         * even looked at: a finished late portrait goes out as it is, a task
         * still drawing is waited for. Neither creates a task nor charges
         * anybody -- not the owner again, and not the recipient either.
         */
        if (!noPerson && ctx?.pool) {
          const paid = await portraitAlreadyPaid(
            ctx,
            owner,
            lead.id,
            deps
          ).catch(() => null)
          if (paid?.kind === 'ready') {
            return card(
              paid.url,
              {
                source:
                  'готовый портрет — оплачен раньше, повторно не рисовался', // cyrillic-ok: message to the agent
                model: LEAD_MAGNET.model,
                recovered: true,
                ...(paid.taskId ? { task_id: paid.taskId } : {}),
              },
              false
            )
          }
          if (paid?.kind === 'drawing') {
            return {
              delivered: false,
              pending: true,
              task_id: paid.taskId,
              // cyrillic-ok: public API field
              причина: PORTRAIT_DRAWING,
              price: 0,
            }
          }
        }

        have = free
          ? Number.POSITIVE_INFINITY
          : ((await balanceOf(pool, lead.id)) ?? FIRST_ROW_GRANT)
        if (!gift && have < price) {
          await noteGift(ctx, `balance ${have} < price ${price}`, 'balance')
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
         * 2. A PICTURE WITH NOBODY IN IT: the one text-to-image door.
         */
        if (noPerson) {
          const gen = lookup('image_generate')
          if (!gen)
            throw new Error('генерация картинок недоступна на этом сервере')
          // Paid: the owner's turn makes the picture, the recipient pays at
          // the press (chargeLater). Gift: the owner pays now.
          const made = (await gen.handler(
            {
              prompt:
                NO_PERSON_PREFIX +
                prompt +
                ' Vertical frame, no text, no logo.',
              ...sizeFor(aspectRatio),
            },
            gift
              ? (ctx as ToolContext)
              : { ...(ctx as ToolContext), chargeLater: true }
          )) as { url?: string; причина?: string; reason?: string } // cyrillic-ok: public API field
          if (!made?.url) {
            noteImagesFailed(made?.причина ?? made?.reason) // cyrillic-ok: field name
            await noteGift(ctx, made?.причина ?? made?.reason, 'generate') // cyrillic-ok: public API field
            return {
              delivered: false,
              // cyrillic-ok: public API field
              причина:
                made?.причина ?? made?.reason ?? 'картинка не получилась', // cyrillic-ok: public API field
              price,
              source: 'без людей, по описанию',
            }
          }
          return card(made.url, {
            source: 'без людей, по описанию',
            model: 'image_generate',
          })
        }

        /*
         * 3. THE FACE. Theirs, or nobody's (client-face.ts).
         */
        const face = await clientFace(
          ctx,
          { id: lead.id, username: chat.startsWith('@') ? chat : null },
          faceDeps,
          { photoUrl: a?.photo_url ? String(a.photo_url) : null }
        )
        if (!face || 'refused' in face) {
          /*
           * NO FACE, NO PORTRAIT -- AND NO STRANGER EITHER. The person is asked
           * for a photo in one short line, on a card like any other: that IS
           * the action of this turn, and nothing is drawn or paid.
           */
          await noteGift(ctx, 'no face to draw from', 'no-face')
          const may = await reachable(ctx, lead.id).catch(() => ({
            ok: false as const,
            why: 'база недоступна',
          }))
          const ask = askForPhotoLine(lead.firstName)
          const p = propose(
            'send',
            chat,
            ask,
            'У человека нет ни аватарки, ни присланного фото с лицом, а портрет ' +
              'рисуется только из его лица. Подготовлена одна строка с просьбой ' +
              'прислать фото; пришлёт — сделай портрет из него (photo_url).',
            ctx,
            may.ok ? lead.id : undefined,
            may.ok ? may.botName : undefined,
            { display: lead.display ?? undefined }
          )
          return { ...p, delivered: false, need_photo: true, price: 0 }
        }

        const edit = lookup('image_edit')
        if (!edit)
          throw new Error('перерисовка фото недоступна на этом сервере')
        /*
         * The OWNER's turn draws it. Gift: the owner pays now. Paid: nobody
         * pays now, the recipient pays at the press (chargeLater). The face is
         * already chosen here, so the edit is not asked to choose another one.
         */
        const drawCtx: ToolContext = {
          ...(ctx as ToolContext),
          imageWaitMs: PORTRAIT_WAIT_MS,
          faceOf: undefined,
          ...(gift ? {} : { chargeLater: true }),
        }
        const made = (await edit.handler(
          {
            prompt:
              LEAD_MAGNET.identityPrefix + prompt + LEAD_MAGNET.framingSuffix,
            image_url: face.url,
            aspect_ratio: aspectRatio,
            model: LEAD_MAGNET.model,
          },
          drawCtx
        )) as {
          url?: string
          причина?: string // cyrillic-ok: public API field
          reason?: string
          pending?: boolean
          taskId?: string
        }
        const source =
          face.from === 'sent' ? 'присланное им фото' : 'его аватарка'

        if (!made?.url && made?.pending && made?.taskId && ctx?.pool) {
          /*
           * NOT A FAILURE: paid for and still drawing. The task id goes onto
           * the debt (it outlives this process), a watch keeps asking, and the
           * finished portrait is handed over by the next delivery -- without
           * a second task and without a second charge.
           */
          await attachTask(pool, {
            owner,
            lead: lead.id,
            taskId: made.taskId,
            why: made.reason ?? made.причина, // cyrillic-ok: public API field
          })
          void followLate(
            ctx as ToolContext,
            owner,
            lead.id,
            made.taskId,
            deps
          ).catch(() => undefined)
          await noteGift(ctx, `task ${made.taskId}`, 'edit', 'gift-late')
          return {
            delivered: false,
            pending: true,
            task_id: made.taskId,
            // cyrillic-ok: public API field
            причина: PORTRAIT_DRAWING,
            price,
            source,
          }
        }
        if (!made?.url) {
          /*
           * BOTH, AND THEY ANSWER DIFFERENT QUESTIONS. `noteImagesFailed` is
           * the in-memory health the playbook reads instead of paying for a
           * generation to find out; `noteGift` is the line in the journal,
           * which is where a refusal becomes visible to a person days later.
           * Keeping only one would have quietly dropped the half that the
           * other branch was written for.
           */
          noteImagesFailed(made?.причина ?? made?.reason) // cyrillic-ok: field name
          await noteGift(ctx, made?.причина ?? made?.reason, 'edit') // cyrillic-ok: public API field
          /*
           * AND THE THIRD ANSWER: to whom. The two calls above know that the
           * provider is down and that a gift was refused; neither can name the
           * person left waiting, so nobody goes back to them when it works
           * again (crm-owed.ts).
           */
          if (ctx?.pool) {
            await noteOwed(pool, {
              owner,
              lead: lead.id,
              what: 'picture',
              why: made?.причина ?? made?.reason, // cyrillic-ok: public API field
            })
          }
          return {
            delivered: false,
            // cyrillic-ok: public API field
            причина: made?.причина ?? made?.reason ?? 'картинка не получилась', // cyrillic-ok: public API field
            price,
            source,
          }
        }
        return card(made.url, {
          source,
          ...(face.ignored ? { photo_url_ignored: face.ignored } : {}),
          model: LEAD_MAGNET.model,
        })
      },
    },
    {
      /*
       * THE LOST ONE, BY HAND.
       *
       * Portraits refused before this file learned to wait (the 06:33Z task of
       * 2026-09-21 among them) exist at the provider and nowhere else. Given
       * the task id and the person, this runs the same recovery the next
       * delivery would: ask Kie, copy the file to our storage, put it on the
       * person's debt so the next card carries it. It never creates a task and
       * never charges anybody. Owner-only: it writes to another seller's
       * debt when told to.
       */
      name: 'crm_portrait_rescue',
      description:
        'Только владелец. Спасти уже оплаченный портрет по id задачи Kie: забрать готовую ' +
        'картинку, сохранить у нас и положить человеку в долг — следующая карточка отдаст её ' +
        'без повторной генерации и оплаты. Новой задачи не создаёт.',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'id задачи Kie (32 hex)' },
          lead: { type: 'string', description: 'числовой id человека' },
          seller: {
            type: 'string',
            description: 'чей это клиент (по умолчанию — вызывающий)',
          },
        },
        required: ['task_id', 'lead'],
        additionalProperties: false,
      },
      async handler(a: Record<string, any>, ctx?: ToolContext) {
        requireOwner(ctx)
        const taskId = String(a?.task_id ?? '')
          .trim()
          .toLowerCase()
        const lead = String(a?.lead ?? '').trim()
        const seller = String(a?.seller ?? ctx?.telegramId ?? '').trim()
        if (!/^[0-9a-f]{32}$/.test(taskId))
          return {
            rescued: false,
            reason: 'task_id: 32 шестнадцатеричных знака',
          }
        if (!/^\d{5,15}$/.test(lead) || !/^\d{5,15}$/.test(seller))
          return { rescued: false, reason: 'lead и seller — числовые id' }
        if (!ctx?.pool)
          return { rescued: false, reason: 'нет базы — некуда записать' }
        const asSeller = { ...ctx, telegramId: seller } as ToolContext
        const pool = ctx.pool as never
        const out = await lookOnce(taskId, lateDepsFor(asSeller, deps))
        if (out.state === 'ready') {
          const onDebt = await markReady(pool, {
            owner: seller,
            lead,
            url: out.url,
            taskId,
            reopen: true,
          })
          await noteGift(asSeller, `task ${taskId}`, 'rescue', 'gift-recovered')
          return {
            rescued: true,
            url: out.url,
            on_debt: onDebt,
            next:
              `следующий crm_deliver_photo для ${lead} отдаст этот портрет карточкой ` +
              '(или обход, где он первым в очереди) — без новой задачи и без оплаты',
          }
        }
        if (out.state === 'running') {
          await attachTask(pool, {
            owner: seller,
            lead,
            taskId,
            why: 'rescue: still drawing',
          })
          void followLate(asSeller, seller, lead, taskId, deps).catch(
            () => undefined
          )
          return {
            rescued: false,
            still_drawing: true,
            reason: out.reason ?? 'Kie ещё рисует; id записан в долг, дождёмся',
          }
        }
        return { rescued: false, reason: out.reason }
      },
    },
  ]
}
