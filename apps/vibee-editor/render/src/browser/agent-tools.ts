import { createHash, randomUUID } from 'node:crypto'
import { addFrame, FILMED_TOOLS, TICK_MS, TICK_IDLE_MS } from './film'
import { cdpTypeIo, centerProbe } from './person-type'
import { askForInput, asKind, optionsFor, waitForAnswer } from './input-request'
/**
 * THE REASON AN AGENT DID NOT KNOW THE BROWSER EXISTED.
 *
 * Everything else built for the remote browser faces the person: the pod, the
 * viewer, the tab, the glow, the notification. An agent had no way to learn
 * there was a browser at all, let alone use it -- so the owner asked, quite
 * reasonably, why it did not know.
 *
 * These are that answer, and they are deliberately NOT a second MCP server.
 * They join `TOOLS`, the registry every agent already reaches through `/mcp`,
 * so an agent that was connected yesterday sees them today without being
 * told. A separate endpoint would have been one more thing nobody knew about.
 *
 * ── WHAT AN AGENT MAY AND MAY NOT DO HERE ─────────────────────────────────
 *
 * It drives the SAME browser the person watches. Not a copy, not a headless
 * twin: every click is visible to them, and they can take the wheel mid-task.
 * That is the safety property the whole architecture rests on, and it is why
 * there is no "invisible mode" here and never will be.
 *
 * The browser is the person's, and the tools only ever reach the session of
 * the caller's own `telegramId`. There is no argument for "whose browser":
 * an agent cannot name somebody else's, because it is never asked.
 *
 * WHAT IS MISSING, on purpose and stated: nothing here asks permission before
 * an irreversible action. A tool that sends, pays or deletes is one `click`
 * away, and the confirmation channel is not built yet
 * (docs/architecture/remote-browser-per-user.md §4.5). Until it is, an agent
 * with these tools is trusted exactly as far as the person trusts it.
 */

import type { AgentTool, ToolContext } from '../agent/tools'
import {
  ensureApprovals,
  askFor,
  readApproval,
  newApprovalToken,
  APPROVAL_TTL_MS,
} from './approvals'
import {
  readSession,
  markAllowed,
  personHasTheWheel,
  type Queryable,
} from './sessions'
import { agentMayOpen, mayAct } from './guard'
import { desktopShot } from './screen'
import { recordStep, stepOf } from './journal'
import { askVision, shrinkJpeg, visionConfig } from '../agent/media-vision'
import {
  frontPage,
  newPage,
  closePage,
  listTargets,
  evaluateOn,
  clickAt,
  typeText,
  screenshot,
} from './cdp'

/**
 * THE GUARD AN AGENT CANNOT DRIVE PAST.
 *
 * Reading is always allowed. ACTING -- clicking, typing, running code -- is
 * refused on a page where a wrong move costs money or reaches other people,
 * unless the person said yes in the last few minutes (guard.ts explains why
 * the rule is about place and not about the action).
 *
 * The refusal names the tool to call next, because an agent told only "no"
 * tries again, tries differently, and eventually tries something worse.
 */
async function mustBeAllowedToAct(
  ctx: ToolContext,
  cdp: string,
  targetId: string
): Promise<void> {
  const targets = await listTargets(cdp).catch(() => [])
  const page = targets.find(t => t.id === targetId)
  const session = await readSession(
    ctx.pool as unknown as Queryable,
    ctx.telegramId
  )
  const verdict = mayAct({
    /* No page found means we cannot see where we are, and guard.ts refuses. */
    url: page?.url ?? '',
    allowedAtMs: session?.allowedAtMs ?? null,
    nowMs: Date.now(),
  })
  if (verdict.allowed) return
  throw new Error(
    `acting on ${verdict.where} needs the person's permission first. ` +
      'Call browser_ask_permission with one sentence saying exactly what ' +
      'you are about to do, wait for "allowed", then try again. Reading ' +
      '(browser_read, browser_screenshot) works without it.'
  )
}

/** What every tool here needs, and the one refusal they all share. */
async function podOf(
  ctx: ToolContext
): Promise<{ cdp: string; targetId: string }> {
  const session = await readSession(
    ctx.pool as unknown as Queryable,
    ctx.telegramId
  )
  if (!session || session.state !== 'live' || !session.cdpEndpoint) {
    throw new Error(
      'no browser is running for this person. They open one in the mini app, ' +
        'on the Browser tab — it is theirs, signed in as them, and they watch ' +
        'you work in it.'
    )
  }
  const page = await frontPage(session.cdpEndpoint)
  return { cdp: session.cdpEndpoint, targetId: page.id }
}

const noArgs = { type: 'object', properties: {}, additionalProperties: false }

/*
 * THE WORDS THAT TRAVEL WITH A PICTURE.
 *
 * A screenshot is shown to the person and kept in the tool log; the model
 * that asked for it does not see it (agent/tool-content.ts says why and what
 * it gets instead). So the shot carries its facts in text: every tab, by
 * title and address, and which one is in front. Measured 2026-09-22: asked
 * "take the whole screen and say what is open", the agent was handed 80 KB
 * of base64 and described "the Queen's board with task cards" -- the screen
 * showed a Google sign-in page and five tabs.
 */
/*
 * EYES FOR THE PICTURE.
 *
 * The chat model does not see images (agent/tool-content.ts), so a shot is
 * described by our own vision endpoint (media-vision.ts: Qwen3-VL on the
 * private network) and the description travels as text, `seen`. A person is
 * waiting, so the wait is bounded; no endpoint, a refusal or a timeout gives
 * `seen: null`, and the model is told plainly it cannot see.
 */
/*
 * A PERSON IS WAITING; THE CPU IS NOT IN A HURRY.
 *
 * Measured 2026-09-22 on the one-slot CPU vision service: a screen it had
 * just seen was described in 1-2 s (its prompt cache), a new one was still
 * unfinished at 45 s -- the slot is shared with the media sweep, whose clips
 * send four frames at a time. Raising the deadline would only make the turn
 * slower and still miss.
 *
 * So the turn waits at most SCREEN_VISION_WAIT_MS. Past that the tool says
 * `seenPending` and the description carries on in the background for up to
 * SCREEN_VISION_BG_MS; it lands in a small cache keyed by the image itself,
 * and the next shot of the same screen gets it at once, without asking the
 * service twice.
 */
export const SCREEN_VISION_WAIT_MS = 25_000
export const SCREEN_VISION_BG_MS = 180_000
export const SCREEN_PROMPT =
  'This is a screenshot of a web browser. In 2-3 short sentences say which site and page is shown and any dialog, error or form on screen; quote a few visible words verbatim. If text is too small to read, say so instead of guessing. Write in Russian.'
/** Measured decode on the CPU service can be ~1.5 tok/s: keep it short. */
export const SCREEN_MAX_TOKENS = 120
const SEEN_CACHE_MAX = 64

type SeenEntry =
  | { done: true; text: string | null }
  | { done: false; work: Promise<string | null> }
const seenCache = new Map<string, SeenEntry>()

export function resetSeenCacheForTests(): void {
  seenCache.clear()
}

function remember(key: string, entry: SeenEntry): void {
  seenCache.delete(key)
  seenCache.set(key, entry)
  while (seenCache.size > SEEN_CACHE_MAX) {
    const oldest = seenCache.keys().next().value
    if (oldest === undefined) break
    seenCache.delete(oldest)
  }
}

export interface Seen {
  seen: string | null
  /** The description is still being made; the same screen will have it. */
  seenPending?: true
}

export async function describeShot(
  base64: string,
  waitMs: number = SCREEN_VISION_WAIT_MS
): Promise<Seen> {
  const v = visionConfig()
  if (!v) return { seen: null }
  let small: string
  try {
    small = (await shrinkJpeg(Buffer.from(base64, 'base64'))).toString('base64')
  } catch {
    return { seen: null }
  }
  const key = createHash('sha1').update(small).digest('hex')
  let entry = seenCache.get(key)
  if (entry?.done) return { seen: entry.text }
  if (!entry) {
    const work = askVision(
      v,
      SCREEN_PROMPT,
      [`data:image/jpeg;base64,${small}`],
      SCREEN_VISION_BG_MS,
      SCREEN_MAX_TOKENS,
      'live'
    )
      .catch(() => null)
      .then(text => {
        // A failure is not remembered: the next shot may try again.
        if (text) remember(key, { done: true, text })
        else seenCache.delete(key)
        return text
      })
    entry = { done: false, work }
    remember(key, entry)
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<'late'>(resolve => {
    timer = setTimeout(() => resolve('late'), waitMs)
  })
  const got = await Promise.race([entry.work, late])
  clearTimeout(timer)
  if (got === 'late') return { seen: null, seenPending: true }
  return { seen: got }
}

async function tabsOf(
  cdp: string,
  frontId?: string
): Promise<Array<{ title: string; url: string; front?: true }>> {
  const targets = await listTargets(cdp).catch(() => [])
  return targets
    .filter(t => t.type === 'page')
    .map(t => ({
      title: t.title,
      url: t.url,
      ...(t.id === frontId ? { front: true as const } : {}),
    }))
}

/**
 * Where the person's two buttons point. Its own server, so a decision never
 * has to cross into the bot to be recorded.
 */
const approvalBase = () =>
  process.env.SELF_PUBLIC_URL ||
  process.env.SELF_URL ||
  'https://vibee-render-production.up.railway.app'

/**
 * How long a single call waits for an answer.
 *
 * Not the ten minutes the approval itself lives: a tool call that hangs for
 * ten minutes is an agent that looks broken. It waits a while, and if nobody
 * has answered it says so and the agent can ask again or do something else --
 * while the SAME question stays open on the person's phone.
 */
const WAIT_CAP_MS = 120_000
const POLL_MS = 2_000

const TOOLS_UNJOURNALED: AgentTool[] = [
  {
    name: 'browser_ask_permission',
    description:
      'СПРОСИ РАЗРЕШЕНИЯ, прежде чем сделать в браузере то, что нельзя отменить: ' + // cyrillic-ok
      'отправить письмо или сообщение, заплатить, удалить, изменить настройки ' + // cyrillic-ok
      'аккаунта, выдать кому-то доступ. Человек получит две кнопки в Telegram. ' + // cyrillic-ok
      'Опиши ОДНИМ предложением, что именно произойдёт, и словами человека, а не ' + // cyrillic-ok
      'своими: «отправить письмо Ивану со счётом на 12 000». Пока ответа нет — ' + // cyrillic-ok
      'не делай этого действия.', // cyrillic-ok
    parameters: {
      type: 'object',
      properties: {
        what: {
          type: 'string',
          description: 'что именно произойдёт, одним предложением', // cyrillic-ok
        },
        waitSeconds: {
          type: 'number',
          description:
            'ждать ответа, до 120 с; по умолчанию 0 — pending, ответ следующим вызовом', // cyrillic-ok
        },
      },
      required: ['what'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      const pool = ctx.pool as unknown as Queryable
      await ensureApprovals(pool)
      const what = String(args.what || '').trim()
      if (!what) throw new Error('say what exactly will happen')

      const { id, allowToken, denyToken } = await askFor(pool, {
        telegramId: ctx.telegramId,
        what,
        newId: newApprovalToken,
        newToken: newApprovalToken, // secret-guard-ok: a generator, not a value
      })

      const link = (token: string) =>
        `${approvalBase().replace(/\/+$/, '')}/api/browser/approve` +
        `?id=${encodeURIComponent(id)}&t=${encodeURIComponent(token)}`

      await askThePerson(
        ctx.telegramId,
        what,
        link(allowToken),
        link(denyToken)
      )

      /*
       * ASKING IS INSTANT; WAITING IS A CHOICE.
       *
       * The first version waited a minute by default, and a tool that blocks
       * for a minute is hostile -- it hung a test that merely enumerates the
       * registry, and it would hang an agent that only meant to ask. Default
       * to not waiting: the question is on the person's phone either way.
       */
      const waitMs = Math.min(
        Math.max(Number(args.waitSeconds) || 0, 0) * 1000,
        WAIT_CAP_MS
      )
      const until = Date.now() + waitMs
      while (Date.now() < until) {
        await new Promise(r => setTimeout(r, POLL_MS))
        const answer = await readApproval(pool, id)
        if (answer && answer.state !== 'pending') {
          /* A yes opens the guarded door for a few minutes; see guard.ts. */
          if (answer.state === 'allowed')
            await markAllowed(pool, ctx.telegramId)
          return { decision: answer.state, what }
        }
      }
      return {
        decision: 'pending',
        what,
        /* The question is still on their phone; do not act on silence. */
        note:
          'nobody has answered yet. Do NOT do it. Ask again later, or tell ' +
          'the person you are waiting.',
        expiresInSeconds: Math.round(APPROVAL_TTL_MS / 1000),
      }
    },
  },
  {
    /*
     * THE AGENT POINTS AT THE FIELD; THE PERSON TYPES (input-request.ts).
     * Owner, 2026-09-22. The agent never learns the text -- only that it
     * was typed, how long it was, and into what kind of field -- and goes on
     * in the same turn.
     */
    name: 'browser_ask_input',
    description:
      'Нужен человек: секрет вводит САМ (не увидишь), x,y — поле; choice — options; ' + // cyrillic-ok: tool description
      'action — сделать ему (капча). Ждёт 120 с.', // cyrillic-ok
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['password', 'email', 'code', 'text', 'choice', 'action'],
        },
        why: { type: 'string' },
        options: { type: 'array', items: { type: 'string' } },
        x: { type: 'number' },
        y: { type: 'number' },
      },
      required: ['kind', 'why'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      const a = args as {
        kind?: unknown
        why?: unknown
        options?: unknown
        x?: unknown
        y?: unknown
      }
      const why = String(a.why ?? '')
        .trim()
        .slice(0, 200)
      if (!why) throw new Error('say in one sentence what it is for')
      const kind = asKind(a.kind)
      const options = optionsFor(kind, a.options)
      /* password, email, code, text are typed; choice and action are pressed. */
      const typing = kind !== 'choice' && kind !== 'action'
      const { cdp, targetId } = await podOf(ctx)
      const session = await readSession(
        ctx.pool as unknown as Queryable,
        ctx.telegramId
      )
      /*
       * The cursor goes into the field when the agent may click there: not
       * while the person drives, not on a guarded page without a yes. If it
       * may not, the person taps the field themselves -- the sheet says so.
       */
      let pointed = false
      if (
        typing &&
        typeof a.x === 'number' &&
        typeof a.y === 'number' &&
        !personHasTheWheel(session, Date.now())
      ) {
        try {
          await mustBeAllowedToAct(ctx, cdp, targetId)
          await clickAt(cdp, targetId, a.x, a.y)
          pointed = true
        } catch {
          /* asked anyway; the person points */
        }
      }
      /* What is asked about goes to the middle of the screen (person-type.ts). */
      await evaluateOn(
        cdp,
        targetId,
        centerProbe(
          typeof a.x === 'number' ? a.x : undefined,
          typeof a.y === 'number' ? a.y : undefined
        )
      ).catch(() => false)
      const focus = await cdpTypeIo
        .focus(cdp)
        .catch(() => ({ host: '', field: 'none', label: '' }))
      const request = askForInput(ctx.telegramId, {
        id: randomUUID(),
        kind,
        why,
        host: focus.host,
        label: typing ? focus.label : '',
        options,
      })
      await askForInputInTelegram(ctx.telegramId, kind, why, focus.host).catch(
        () => {}
      )
      const answer = await waitForAnswer(
        ctx.telegramId,
        request.id,
        ctx.probe === true ? 0 : WAIT_CAP_MS
      )
      if (answer?.chosen) {
        const option = answer.chosen.option
        return {
          answered: true,
          chosen: option,
          note:
            kind !== 'action'
              ? 'the person chose this. Do exactly that, then continue.'
              : option === 'done'
                ? 'the person says it is done. Look (browser_screenshot) and continue.'
                : 'the person cannot do it now. Stop this step and tell them what else could work.',
        }
      }
      const typed = answer?.typed
      if (typed) {
        return {
          typed: true,
          chars: typed.chars,
          field: typed.field,
          enter: typed.enter,
          note:
            'the person typed it into their browser. You did not see it and must not ask for it. ' +
            'Continue: browser_screenshot to see the next step.',
        }
      }
      return {
        typed: false,
        answered: false,
        pointed,
        field: focus.field,
        note: typing
          ? 'not typed yet; the field is waiting on their screen. Tell them in one line what to enter ' +
            'and where, then check later with browser_screenshot. Never ask for it in the chat.'
          : 'no answer yet; the buttons are on their screen and in Telegram. Tell them in one line ' +
            'what you are waiting for, then ask again later.',
      }
    },
  },
  {
    name: 'browser_status',
    description:
      'Есть ли у человека запущенный браузер, которым ты можешь работать. ' + // cyrillic-ok: tool description
      'Зови ПЕРВЫМ, прежде чем обещать «сейчас зайду на сайт»: без запущенного ' + // cyrillic-ok
      'браузера остальные browser_* инструменты откажут, и человеку придётся ' + // cyrillic-ok
      'открыть его самому во вкладке «Браузер» в мини-аппе.', // cyrillic-ok
    parameters: noArgs,
    async handler(_args, ctx) {
      const session = await readSession(
        ctx.pool as unknown as Queryable,
        ctx.telegramId
      )
      if (!session || session.state !== 'live') {
        return {
          running: false,
          hint: 'the person opens one on the Browser tab',
        }
      }
      const targets = await listTargets(session.cdpEndpoint!).catch(() => [])
      return {
        running: true,
        /* No endpoints, no tokens: an agent needs neither to use the tools. */
        pages: targets
          .filter(t => t.type === 'page')
          .map(t => ({ title: t.title, url: t.url })),
        watchedByThePerson: true,
      }
    },
  },
  {
    name: 'browser_open',
    description:
      'Открыть адрес в браузере человека, в новой вкладке. Человек видит это ' + // cyrillic-ok
      'на экране. Возвращает заголовок и адрес открытой страницы.', // cyrillic-ok
    parameters: {
      type: 'object',
      properties: { url: { type: 'string', description: 'полный адрес' } }, // cyrillic-ok
      required: ['url'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      const session = await readSession(
        ctx.pool as unknown as Queryable,
        ctx.telegramId
      )
      if (!session?.cdpEndpoint || session.state !== 'live') {
        throw new Error('no browser is running for this person')
      }
      /* The web only: never the browser's settings, extensions or vault. */
      if (!agentMayOpen(String(args.url))) {
        throw new Error(
          'only http(s) addresses and about:blank can be opened. The ' +
            "browser's own pages -- settings, extensions, the password " +
            "manager -- are the person's to open, not an agent's."
        )
      }
      const page = await newPage(session.cdpEndpoint, String(args.url))
      return { opened: page.url || String(args.url), id: page.id }
    },
  },
  {
    name: 'browser_read',
    description:
      'Прочитать видимый текст страницы, на которой сейчас браузер. ' + // cyrillic-ok
      'Это то же, что видит человек.', // cyrillic-ok
    parameters: {
      type: 'object',
      properties: {
        maxChars: { type: 'number', description: 'сколько символов вернуть' }, // cyrillic-ok
      },
      additionalProperties: false,
    },
    async handler(args, ctx) {
      const { cdp, targetId } = await podOf(ctx)
      const limit = Math.min(Number(args.maxChars) || 8000, 40_000)
      const text = await evaluateOn(
        cdp,
        targetId,
        `(() => {
           const main = document.querySelector('main, article') || document.body
           return { title: document.title, url: location.href,
                    text: (main.innerText || '').slice(0, ${limit}) }
         })()`
      )
      return text
    },
  },
  {
    name: 'browser_screenshot',
    description:
      'Снимок страницы, JPEG base64: когда текста мало. desktop — весь экран ' + // cyrillic-ok
      'человека, не для клика.', // cyrillic-ok
    parameters: {
      type: 'object',
      properties: {
        desktop: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    async handler(args, ctx) {
      /*
       * The whole screen comes from the pod itself (screen.ts desktopShot):
       * what the person's video carries, browser chrome and dialogs
       * included. Its coordinates are the screen's, not the page's, which
       * is why the description says not to click by them.
       */
      if ((args as { desktop?: unknown }).desktop === true) {
        const session = await readSession(
          ctx.pool as unknown as Queryable,
          ctx.telegramId
        )
        if (!session || session.state !== 'live' || !session.endpoint) {
          await podOf(ctx) /* throws the same sentence as every other tool */
        }
        const base64 = await desktopShot(
          session!.endpoint!,
          session!.adminToken
        )
        return {
          format: 'jpeg',
          base64,
          tabs: session!.cdpEndpoint ? await tabsOf(session!.cdpEndpoint) : [],
          ...(await describeShot(base64)),
        }
      }
      const { cdp, targetId } = await podOf(ctx)
      const base64 = await screenshot(cdp, targetId)
      return {
        format: 'jpeg',
        base64,
        tabs: await tabsOf(cdp, targetId),
        ...(await describeShot(base64)),
      }
    },
  },
  {
    name: 'browser_click',
    description:
      'Нажать в точке экрана браузера. Координаты бери из browser_screenshot. ' + // cyrillic-ok
      'Это НАСТОЯЩЕЕ нажатие мышью, его видно человеку.', // cyrillic-ok
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
      },
      required: ['x', 'y'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      const { cdp, targetId } = await podOf(ctx)
      await mustBeAllowedToAct(ctx, cdp, targetId)
      await clickAt(cdp, targetId, Number(args.x), Number(args.y))
      return { clicked: { x: Number(args.x), y: Number(args.y) } }
    },
  },
  {
    name: 'browser_type',
    description:
      'Набрать текст там, где сейчас курсор. НИКОГДА не набирай пароли: ' + // cyrillic-ok
      'человек вводит их сам, глядя в экран, и они не проходят ни через тебя, ' + // cyrillic-ok
      'ни через нас.', // cyrillic-ok
    parameters: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      const { cdp, targetId } = await podOf(ctx)
      await mustBeAllowedToAct(ctx, cdp, targetId)
      await typeText(cdp, targetId, String(args.text))
      return { typed: String(args.text).length }
    },
  },
  {
    name: 'browser_evaluate',
    description:
      'Выполнить JavaScript на странице и получить значение. Для того, что ' + // cyrillic-ok
      'неудобно читать текстом: собрать список ссылок, достать поле формы.', // cyrillic-ok
    parameters: {
      type: 'object',
      properties: { code: { type: 'string', description: 'выражение' } }, // cyrillic-ok
      required: ['code'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      const { cdp, targetId } = await podOf(ctx)
      /* Code on a page can do anything a click can, so it is gated too. */
      await mustBeAllowedToAct(ctx, cdp, targetId)
      return { value: await evaluateOn(cdp, targetId, String(args.code)) }
    },
  },
  {
    name: 'browser_close_tab',
    description:
      'Закрыть вкладку в браузере человека. Сам браузер остаётся открытым.', // cyrillic-ok
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      const session = await readSession(
        ctx.pool as unknown as Queryable,
        ctx.telegramId
      )
      if (!session?.cdpEndpoint) throw new Error('no browser is running')
      await closePage(session.cdpEndpoint, String(args.id))
      return { closed: String(args.id) }
    },
  },
]

/*
 * Every call is written to the person's journal (journal.ts): which tool,
 * where, what came back, how long. In the background and never fatal -- a
 * journal that cannot be written must not turn a working click into an
 * error. Typed text and evaluated code are kept by length only.
 */
/*
 * ONE FRAME PER STEP, FOR THE FILM SENT AFTER THE TURN (film.ts).
 *
 * A look already carries its picture; any other step gets the whole screen
 * from the pod a moment later, once the page has reacted. Stamped with the
 * step's start so frames stay in step order. Never throws, never waited on:
 * a missing frame costs one picture, not the step.
 */
export const FRAME_SETTLE_MS = 700

/* The word drawn on a step's frame, in the person's language. */
const FRAME_LABEL: Record<string, string> = {
  browser_open: 'открыл', // cyrillic-ok: drawn on the film
  browser_click: 'нажал', // cyrillic-ok
  browser_type: 'напечатал', // cyrillic-ok
  browser_evaluate: 'выполнил код', // cyrillic-ok
  browser_close_tab: 'закрыл вкладку', // cyrillic-ok
  browser_screenshot: 'посмотрел', // cyrillic-ok
}

async function filmStep(
  ctx: ToolContext,
  tool: string,
  at: number,
  result: unknown,
  args: unknown
): Promise<void> {
  const label = FRAME_LABEL[tool]
  try {
    const own = (result ?? {}) as { base64?: unknown }
    if (typeof own.base64 === 'string' && own.base64) {
      addFrame(ctx.telegramId, { at, tool, jpeg: own.base64, label })
      return
    }
    await new Promise(r => setTimeout(r, FRAME_SETTLE_MS))
    const session = await readSession(
      ctx.pool as unknown as Queryable,
      ctx.telegramId
    )
    if (!session || session.state !== 'live') return
    /*
     * A click is filmed as the PAGE (CDP), not the desktop: the page's
     * pixels are the click's coordinates, so the ring marks the very spot.
     */
    const a = (args ?? {}) as { x?: unknown; y?: unknown }
    if (
      tool === 'browser_click' &&
      session.cdpEndpoint &&
      typeof a.x === 'number' &&
      typeof a.y === 'number'
    ) {
      const page = await frontPage(session.cdpEndpoint)
      const jpeg = await screenshot(session.cdpEndpoint, page.id)
      addFrame(ctx.telegramId, {
        at,
        tool,
        jpeg,
        label,
        mark: { x: a.x, y: a.y },
      })
      return
    }
    if (!session.endpoint) return
    const jpeg = await desktopShot(session.endpoint, session.adminToken)
    addFrame(ctx.telegramId, { at, tool, jpeg, label })
  } catch {
    /* a frame is a picture, not a duty */
  }
}

/*
 * BETWEEN STEPS, THE SCREEN KEEPS BEING FILMED (film.ts TICK_MS).
 *
 * A frame per step shows where the agent went, not how the page moved in
 * between -- a spinner, a page loading, a dialog that came and went. While
 * the agent works, a whole-screen frame is taken every two seconds; it stops
 * by itself once no step has come for TICK_IDLE_MS. One ticker per person.
 */
const tickers = new Map<
  string,
  { last: number; timer: ReturnType<typeof setInterval> }
>()

function keepTicking(ctx: ToolContext): void {
  const id = ctx.telegramId
  const now = Date.now()
  const running = tickers.get(id)
  if (running) {
    running.last = now
    return
  }
  const state = {
    last: now,
    timer: undefined as unknown as ReturnType<typeof setInterval>,
  }
  let busy = false
  state.timer = setInterval(() => {
    if (Date.now() - state.last > TICK_IDLE_MS) {
      clearInterval(state.timer)
      tickers.delete(id)
      return
    }
    if (busy) return
    busy = true
    void (async () => {
      try {
        const session = await readSession(ctx.pool as unknown as Queryable, id)
        if (!session || session.state !== 'live' || !session.endpoint) return
        const jpeg = await desktopShot(session.endpoint, session.adminToken)
        addFrame(id, { at: Date.now(), tool: 'tick', jpeg })
      } catch {
        /* a missed tick is a missed picture */
      } finally {
        busy = false
      }
    })()
  }, TICK_MS)
  /* Never what keeps the process alive. */
  ;(state.timer as { unref?: () => void }).unref?.()
  tickers.set(id, state)
}

export function stopTickersForTests(): void {
  for (const t of tickers.values()) clearInterval(t.timer)
  tickers.clear()
}

/*
 * AN AGENT OVER /mcp HAS NO "END OF TURN" (owner, 2026-09-22: "and for
 * outside agents too"). Its steps count as one piece of work until it has
 * been quiet for EXTERNAL_QUIET_MS; then the same report and film a chat turn
 * gets are sent. Steps keep the window open; each new one pushes it back.
 */
export const EXTERNAL_QUIET_MS = 120_000
const external = new Map<
  string,
  { since: number; timer: ReturnType<typeof setTimeout> }
>()

export function noteExternalStep(ctx: ToolContext): void {
  const id = ctx.telegramId
  const open = external.get(id)
  if (open) clearTimeout(open.timer)
  const since = open?.since ?? Date.now() - 1000
  const timer = setTimeout(() => {
    external.delete(id)
    void import('./after-turn')
      .then(m =>
        m.reportAfterTurn(ctx.pool as unknown as Queryable, id, {
          since,
          task: 'Работа агента через подключение (MCP) — без вашего запроса в чате', // cyrillic-ok: user-facing
          answer: '',
          settle: false,
        })
      )
      .catch(() => {})
  }, EXTERNAL_QUIET_MS)
  ;(timer as { unref?: () => void }).unref?.()
  external.set(id, { since, timer })
}

export function stopExternalReportsForTests(): void {
  for (const e of external.values()) clearTimeout(e.timer)
  external.clear()
}

function journaled(tool: AgentTool): AgentTool {
  return {
    ...tool,
    async handler(args, ctx) {
      const t0 = Date.now()
      const write = (outcome: { result?: unknown; error?: unknown }) =>
        void recordStep(
          ctx.pool as unknown as Queryable,
          ctx.telegramId,
          stepOf(
            tool.name,
            (args ?? {}) as Record<string, unknown>,
            outcome,
            Date.now() - t0
          ),
          { probe: ctx.probe === true }
        )
      try {
        const result = await tool.handler(args, ctx)
        write({ result })
        if (ctx.probe !== true && FILMED_TOOLS.has(tool.name))
          void filmStep(ctx, tool.name, t0, result, args)
        if (ctx.probe !== true) {
          keepTicking(ctx)
          /* No chat turn = an agent over /mcp: report once it goes quiet. */
          if (!ctx.turn) noteExternalStep(ctx)
        }
        return result
      } catch (error) {
        write({ error })
        throw error
      }
    },
  }
}

/*
 * THE PERSON HOLDS THE WHEEL: tools that act on the page stand still.
 * Reading (status, read, screenshot) and asking permission go on -- the agent
 * may watch and ask, not click or type under the person's hands
 * (sessions.ts personHasTheWheel). The refusal is journaled like any other.
 */
export const ACTING_TOOLS: ReadonlySet<string> = new Set([
  'browser_open',
  'browser_click',
  'browser_type',
  'browser_evaluate',
  'browser_close_tab',
])

export const WHEEL_TAKEN =
  'the person has taken the wheel and is driving the browser themselves. Do not act in it now: ' +
  'tell them what you were about to do and wait until they hand the wheel back ("Hand back" in the app).'

function respectsTheWheel(tool: AgentTool): AgentTool {
  if (!ACTING_TOOLS.has(tool.name)) return tool
  return {
    ...tool,
    async handler(args, ctx) {
      const session = await readSession(
        ctx.pool as unknown as Queryable,
        ctx.telegramId
      )
      if (personHasTheWheel(session, Date.now())) throw new Error(WHEEL_TAKEN)
      return tool.handler(args, ctx)
    },
  }
}

export const BROWSER_TOOLS: AgentTool[] =
  TOOLS_UNJOURNALED.map(respectsTheWheel).map(journaled)

/**
 * The message with the two buttons.
 *
 * Imported lazily so this module stays testable without a bot token: the
 * tests exercise the decision, not Telegram, and a top-level import would
 * drag the sender into every one of them.
 */
/* The person's Telegram: a button that opens the typing sheet in the app. */
/** The Telegram words for each kind of ask. Pure. */
export function askText(kind: string, why: string, host: string): string {
  const where = host ? ` (${host})` : ''
  if (kind === 'choice') {
    return (
      `🤔 Агенту нужно ваше решение${where}:\n\n«${why}»\n\n` + // cyrillic-ok: user-facing
      'Выберите в приложении — агент продолжит сам.' // cyrillic-ok: user-facing
    )
  }
  if (kind === 'action') {
    return (
      `🙋 Агенту нужно, чтобы вы сделали это сами${where}:\n\n«${why}»\n\n` + // cyrillic-ok: user-facing
      'Сделайте и нажмите «Готово» в приложении.' // cyrillic-ok: user-facing
    )
  }
  const what =
    kind === 'password'
      ? 'пароль' // cyrillic-ok: user-facing
      : kind === 'code'
        ? 'код' // cyrillic-ok: user-facing
        : kind === 'email'
          ? 'почту' // cyrillic-ok: user-facing
          : 'текст' // cyrillic-ok: user-facing
  return (
    `🔑 Агенту нужен ваш ${what}${host ? ` для ${host}` : ''}.\n\n` + // cyrillic-ok: user-facing
    `«${why}»\n\n` +
    'Введите его сами — агент его не увидит и продолжит, как только вы введёте.' // cyrillic-ok: user-facing
  )
}

async function askForInputInTelegram(
  telegramId: string,
  kind: string,
  why: string,
  host: string
): Promise<void> {
  const { sendToTelegram } = await import('../auth/telegram-sender')
  const { openBrowserButton, BROWSER_TAB_URL } = await import('./announce')
  const pressed = kind === 'choice' || kind === 'action'
  await sendToTelegram(telegramId, askText(kind, why, host), {
    inline_keyboard: [
      [
        pressed
          ? openBrowserButton('👆 Ответить', BROWSER_TAB_URL) // cyrillic-ok: button label
          : openBrowserButton('⌨ Ввести', `${BROWSER_TAB_URL}?type=1`), // cyrillic-ok: button label
      ],
    ],
  })
}

async function askThePerson(
  telegramId: string,
  what: string,
  allowUrl: string,
  denyUrl: string
): Promise<void> {
  const { sendToTelegram } = await import('../auth/telegram-sender')
  await sendToTelegram(
    telegramId,
    'Агент просит разрешения в вашем браузере:\n\n' + // cyrillic-ok: user-facing
      `«${what}»\n\n` +
      'Это действие нельзя отменить. Решать вам.', // cyrillic-ok: user-facing
    {
      inline_keyboard: [
        [
          { text: '✅ Разрешить', url: allowUrl }, // cyrillic-ok: button label
          { text: '✋ Отклонить', url: denyUrl }, // cyrillic-ok: button label
        ],
      ],
    }
  )
}
