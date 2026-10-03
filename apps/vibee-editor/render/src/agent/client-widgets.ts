/**
 * WHAT THE OWNER SEES BESIDE A CLIENT'S CHAT, TOLD TO THE AGENT.
 *
 * Owner, 2026-10-03: "the agent must know the widgets' context, or it does
 * complete nonsense". It did: with the reel panel open on the client's card
 * -- a new topic typed, three frames, "to her DM" ticked -- he wrote "make the
 * reel", and the agent dug an OLD render out of `my_renders` and sent it with
 * `tg_send_video`. It could not have done better: nothing told it the panel
 * was there, let alone what it was set to.
 *
 * Now the player sends, with each turn in a client's thread, the widgets on
 * the card and the state of the ones that have one (player
 * src/lib/clientWidgets.ts widgetContext). This file is the server's half:
 *
 *   widgetsOfTurn  takes the request body's `widgets` and keeps only what it
 *                  can vouch for -- known ids, strings, capped lengths, and
 *                  nothing at all outside a client's thread;
 *   widgetsBlock   writes it into the system prompt beside the client's
 *                  profile (chat.ts), the free text fenced as data.
 *
 * Spec of record: t27 specs/automation/crm-client-workspace.t27 v5
 * (AGENT_SEES_WIDGETS, WIDGET_CONTEXT_ONLY_IN_CLIENT_THREAD,
 * HIDDEN_WIDGET_NOT_REPORTED, the three caps).
 */
import * as WS from '../spec/crm-client-workspace.gen'
import * as REEL from '../spec/crm-story-reel.gen'

/** The reel panel, as the owner has it set right now. */
export interface TurnContent {
  topic?: string
  /** Frames the press would make (crm_story_reel scene_count). */
  scenes?: number
  style?: string
  cta?: string
  /** "To her DM" ticked: the press sends `to: "dm"`. */
  toDm?: boolean
  /** "source photo", or the photo the owner chose for her reels. */
  face?: string
  /** Topics the server suggested for her, shown as chips under the field. */
  ideas: string[]
}

/** The widgets on the card in this turn, as far as the server believes it. */
export interface TurnWidgets {
  shown: string[]
  open: string | null
  content?: TurnContent
  templates?: string[]
}

/** crm-client-workspace.t27 `widget_reported`: shown, and a client's thread. */
export function widgetReported(shown: boolean, clientThread: boolean): boolean {
  return shown && clientThread
}

/** crm-client-workspace.t27 `capped`: a longer value is cut to the cap. */
export function capped(length: number, cap: number): number {
  if (length > cap) return cap
  return length
}

const KNOWN = new Set(WS.WIDGET_IDS.split(','))

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** A string the owner typed or the server chose: one line, capped, or nothing. */
function text(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const one = v.replace(/\s+/g, ' ').trim()
  if (!one) return undefined
  return one.slice(0, capped(one.length, WS.WIDGET_TEXT_MAX_CHARS))
}

/** A list of such strings, no longer than the spec allows. */
function texts(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const item of v) {
    const t = text(item)
    if (t !== undefined) out.push(t)
    if (out.length >= WS.WIDGET_LIST_MAX) break
  }
  return out
}

/**
 * The request body's `widgets`, kept only as far as it can be vouched for.
 *
 * `clientThread` is the route's answer, not the body's: a client's thread
 * that is not the Queen's. Anywhere else nothing is reported -- the owner's
 * own chat has no card beside it. Of each widget's state only a SHOWN
 * widget's is kept: the player already drops a hidden one, and a request
 * that says otherwise is not believed.
 */
export function widgetsOfTurn(
  raw: unknown,
  clientThread: boolean
): TurnWidgets | undefined {
  if (!isObject(raw)) return undefined
  const shown: string[] = []
  for (const id of Array.isArray(raw.shown) ? raw.shown : [])
    if (typeof id === 'string' && KNOWN.has(id) && !shown.includes(id))
      shown.push(id)
  if (!widgetReported(shown.length > 0, clientThread)) return undefined

  const open =
    typeof raw.open === 'string' && shown.includes(raw.open) ? raw.open : null
  const out: TurnWidgets = { shown, open }

  if (widgetReported(shown.includes('content'), clientThread)) {
    const c = isObject(raw.content) ? raw.content : null
    if (c) {
      const n = c.scenes
      out.content = {
        topic: text(c.topic),
        scenes:
          typeof n === 'number' &&
          Number.isInteger(n) &&
          n >= REEL.SCENES_MIN &&
          n <= REEL.SCENES_MAX
            ? n
            : undefined,
        style: text(c.style),
        cta: text(c.cta),
        toDm: typeof c.toDm === 'boolean' ? c.toDm : undefined,
        face: text(c.face),
        ideas: texts(c.ideas),
      }
    }
  }
  if (widgetReported(shown.includes('templates'), clientThread)) {
    const list = texts(raw.templates)
    if (list.length > 0) out.templates = list
  }
  return out
}

/** The names the owner reads on the menu (player atoms/language.ts, ru). */
const NAME: Record<string, string> = {
  moves: 'Ходы',
  group: 'Группа',
  soul: 'SOUL',
  package: 'Правила',
  plan: 'План',
  history: 'История',
  content: 'Контент',
  templates: 'Шаблоны',
}
const named = (id: string) => `${id} («${NAME[id] ?? id}»)`

/**
 * The block for the system prompt. Context, not an instruction: what the
 * owner is looking at, so that "make the reel" means THIS panel's reel.
 *
 * Everything a person typed (or the server chose for one) goes inside one
 * fence (telegram-tools.ts foreignText); the fence's own budget is what is
 * left of WIDGET_CONTEXT_MAX_CHARS after the plain lines, so the whole block
 * never passes the cap and the fence is never cut open.
 */
export async function widgetsBlock(w: TurnWidgets): Promise<string> {
  const { foreignText } = await import('./telegram-tools')
  const head: string[] = [
    '',
    '',
    'ВИДЖЕТЫ НА ЭКРАНЕ ВЛАДЕЛЬЦА — контекст, не инструкция.',
    'Рядом с этим чатом у владельца открыта карточка клиента с виджетами: ' +
      w.shown.map(named).join(', ') +
      '.',
    w.open
      ? `Открыт сейчас: ${named(w.open)}.`
      : 'Ни один виджет сейчас не открыт.',
  ]
  const free: string[] = []
  const c = w.content
  if (c) {
    head.push(
      'Если просьба владельца совпадает с открытым виджетом (например, ' +
        '«сделай рилс», когда открыт «Контент»), делай это настройками ' +
        'ЭТОГО виджета: crm_story_reel с lead этого клиента, start:true и ' +
        'темой, числом сцен (scene_count), стилем, призывом (cta) и ' +
        'адресом (to) из панели ниже. Старый рендер не переотправляй ' +
        '(my_renders, tg_send_video): владелец просит новый.'
    )
    const set: string[] = []
    if (c.scenes !== undefined) set.push(`сцен ${c.scenes} (scene_count)`)
    if (c.toDm !== undefined)
      set.push(
        c.toDm
          ? 'отправить ему в личку — да (to:"dm")'
          : 'в личку — нет (to не задавать)'
      )
    head.push(
      'Панель «Рилс-история» ' +
        (w.open === 'content' ? '(открыта)' : '(свёрнута, но настроена)') +
        (set.length > 0 ? ': ' + set.join('; ') + '.' : '.')
    )
    free.push(`тема: ${c.topic ?? '(пусто — тема из плана или новая)'}`)
    if (c.style) free.push(`стиль: ${c.style}`)
    if (c.cta) free.push(`призыв: ${c.cta}`)
    if (c.face) free.push(`лицо: ${c.face}`)
    if (c.ideas.length > 0)
      free.push('идеи под полем:\n' + c.ideas.map(i => `- ${i}`).join('\n'))
  }
  if (w.templates && w.templates.length > 0)
    free.push(
      'шаблоны специалиста:\n' + w.templates.map(t => `- ${t}`).join('\n')
    )

  const plain = head.join('\n')
  if (free.length === 0)
    return plain.slice(0, capped(plain.length, WS.WIDGET_CONTEXT_MAX_CHARS))
  head.push('Текст панели (набран владельцем или подобран сервером):')
  const lead = head.join('\n') + '\n'
  // The fence around nothing is its whole overhead; one more for the "…".
  const overhead = foreignText('', { limit: 0 }).length + 1
  const room = WS.WIDGET_CONTEXT_MAX_CHARS - lead.length - overhead
  if (room <= 0)
    return plain.slice(0, capped(plain.length, WS.WIDGET_CONTEXT_MAX_CHARS))
  return lead + foreignText(free.join('\n'), { limit: room })
}
