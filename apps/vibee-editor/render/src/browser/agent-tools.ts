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
import { readSession, type Queryable } from './sessions'
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

export const BROWSER_TOOLS: AgentTool[] = [
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
      'Снимок экрана браузера человека, JPEG в base64. Бери, когда текста ' + // cyrillic-ok
      'недостаточно: разметка, картинки, где что расположено.', // cyrillic-ok
    parameters: noArgs,
    async handler(_args, ctx) {
      const { cdp, targetId } = await podOf(ctx)
      return { format: 'jpeg', base64: await screenshot(cdp, targetId) }
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
