/**
 * THE WIDGETS OF A CLIENT'S CHAT FOLLOW THE CHOSEN SPECIALIST (owner,
 * 2026-10-03: "the content dashboard must appear only when the Blogger agent
 * is chosen, and so on by analogy; and the widgets go in one place, on the
 * left, in a menu").
 *
 * A widget is either the CLIENT's -- shown under any specialist, the plain
 * Assistant included -- or ONE specialist's, shown only while that
 * specialist is chosen. The content widget (the portrait gift and the story
 * reel) is the Blogger's; every specialist with templates of its own brings
 * them as its templates widget. All of them sit in one menu on the left of
 * the chat, one open at a time; the Queen is not a widget.
 *
 * And the agent is told what the owner sees (owner, same day: "the agent
 * must know the widgets' context, or it does complete nonsense" -- it sent
 * an old render while the reel panel stood open on a new topic). The chat
 * reports the SHOWN widgets, the open one and its state with every line of
 * a client's thread; a hidden widget is never reported.
 *
 * Spec of record: specs/automation/crm-client-workspace.t27 v5 (gHashTag/t27).
 * Pure and import-free on purpose: the render's binding test imports this
 * file and holds every rule below against the spec's own tests.
 */

export type WidgetId =
  | 'moves'
  | 'group'
  | 'soul'
  | 'package'
  | 'plan'
  | 'history'
  | 'content'
  | 'templates'

/** The client's widgets, in menu order; shown under any specialist. */
export const CLIENT_WIDGET_IDS: readonly WidgetId[] = [
  'moves',
  'group',
  'soul',
  'package',
  'plan',
  'history',
]

/** The specialist's own widgets, in menu order after the client's. */
export const SPECIALIST_WIDGET_IDS: readonly WidgetId[] = [
  'content',
  'templates',
]

export const WIDGET_IDS: readonly WidgetId[] = [
  ...CLIENT_WIDGET_IDS,
  ...SPECIALIST_WIDGET_IDS,
]

/** Whose the content widget is: the Blogger's, and nobody else's. */
export const CONTENT_WIDGET_AGENT = 'blogger'

/** Where the menu falls back to when the open widget left with its owner. */
export const FIRST_CLIENT_WIDGET: WidgetId = 'moves'

export interface ClientWidget {
  id: WidgetId
  /** The specialist it belongs to; null -- the client's, always shown. */
  owner: string | null
}

/** Spec `widget_shown`: a client widget always, a specialist's only while chosen. */
export function widgetShown(
  owner: string | null,
  chosen: string | null
): boolean {
  return owner === null || owner === chosen
}

/**
 * The menu for the specialist chosen (null -- the plain Assistant). Every
 * candidate is listed and the rule above filters it: the templates widget is
 * one per specialist that has templates, so only the chosen one's survives.
 */
export function widgetsFor(
  chosen: string | null,
  templateAgents: readonly string[]
): ClientWidget[] {
  const all: ClientWidget[] = [
    ...CLIENT_WIDGET_IDS.map(id => ({ id, owner: null })),
    { id: 'content', owner: CONTENT_WIDGET_AGENT },
    ...templateAgents.map(a => ({ id: 'templates' as const, owner: a })),
  ]
  return all.filter(w => widgetShown(w.owner, chosen))
}

/**
 * Spec `open_after_switch`: choosing a specialist opens its first own
 * widget; otherwise the open one stays while it is still shown, and a widget
 * that left with its specialist falls back to the client's first.
 */
export function openAfterSwitch(
  open: WidgetId,
  chosen: string | null,
  templateAgents: readonly string[]
): WidgetId {
  const shown = widgetsFor(chosen, templateAgents)
  const own = shown.find(w => w.owner !== null)
  if (own) return own.id
  if (shown.some(w => w.id === open)) return open
  return FIRST_CLIENT_WIDGET
}

/** What the content widget (the story-reel panel) is set to right now. */
export interface ContentState {
  topic: string
  scenes: number
  style: string
  cta: string
  toDm: boolean
  /** The seller's own photo URL, `source photo` for her avatar, or null. */
  face: string | null
  ideas: string[]
  /** The script picked in the gallery and its lines as edited; absent -- none. */
  template?: { id: string; language: 'ru' | 'en'; lines: string[] }
}

/** What one line of a client's thread tells the agent about the screen. */
export interface WidgetContext {
  shown: WidgetId[]
  open: WidgetId | null
  content?: ContentState
  templates?: string[]
}

/**
 * Spec `widget_reported`, the player's half: only what is SHOWN is reported.
 * A widget's state from before a switch -- the reel panel's topic after the
 * Blogger was swapped out -- is dropped here, so it can never reach the
 * agent; the server drops it again (render/src/agent/client-widgets.ts).
 */
export function widgetContext(a: {
  chosen: string | null
  open: WidgetId | null
  content: ContentState | null
  templates: readonly string[]
  templateAgents: readonly string[]
}): WidgetContext {
  const shown = [
    ...new Set(widgetsFor(a.chosen, a.templateAgents).map(w => w.id)),
  ]
  const out: WidgetContext = {
    shown,
    open: a.open && shown.includes(a.open) ? a.open : null,
  }
  if (a.content && shown.includes('content')) out.content = { ...a.content }
  if (a.templates.length > 0 && shown.includes('templates'))
    out.templates = [...a.templates]
  return out
}
