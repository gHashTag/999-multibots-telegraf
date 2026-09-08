/**
 * THE CRM SCREEN TALKS THROUGH THE AGENT'S OWN TOOLS.
 *
 * Not a new set of `/api/crm/*` routes. The tools on `/mcp` already carry the
 * rule about who may see whom -- `visibilityOf` in `hive/roles.ts`, one place,
 * measured and tested -- and a second path to the same data is a second place
 * for that rule to be forgotten. The price of forgetting it here is a
 * stranger's clients on a stranger's screen.
 *
 * `/mcp` accepts a Mini App signature (`X-Telegram-Init-Data`), which is what
 * `authHeaders` already sends, so the browser is identified exactly as it is
 * everywhere else in this app.
 *
 * ── EVERY LOADER SAYS WHETHER IT REACHED ANYTHING ──────────────────────────
 *
 * `reachable` travels with each result. A panel that renders zeros when the
 * server is unreachable tells the owner their business is dead; the same shape
 * is used by the Hive page for the same reason.
 */
import { API_BASE } from '../config'
import { authHeaders } from '@/lib/apiFetch'

export interface Reached<T> {
  reachable: boolean
  data: T | null
  error?: string
}

/**
 * One tool call. Errors are returned, never thrown: a screen with four panels
 * must not lose three of them because one endpoint is having a bad minute.
 */
async function callTool<T>(
  name: string,
  args: Record<string, unknown> = {}
): Promise<Reached<T>> {
  try {
    const r = await fetch(`${API_BASE}/mcp`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    })
    if (!r.ok) {
      return { reachable: false, data: null, error: `сервер ответил ${r.status}` }
    }
    const body = await r.json()
    if (body?.error) {
      return {
        reachable: false,
        data: null,
        error: String(body.error.message ?? 'отказ'),
      }
    }
    /*
     * `structuredContent` first, the text block second. MCP servers may send
     * either; reading only the text would mean parsing JSON out of a string
     * that is allowed to be prose.
     */
    const structured = body?.result?.structuredContent
    if (structured) return { reachable: true, data: structured as T }
    const text = body?.result?.content?.[0]?.text
    if (typeof text === 'string') {
      return { reachable: true, data: JSON.parse(text) as T }
    }
    return { reachable: false, data: null, error: 'пустой ответ' }
  } catch (e) {
    return {
      reachable: false,
      data: null,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

/**
 * The server answers with Russian keys, because the agent's tools are read by
 * a model in Russian. The screen should not have to know that: keys are
 * translated ONCE here, at the boundary, so the component stays in one
 * language and a rename on the server breaks one file rather than several.
 */
export interface Overview {
  people: number | null
  paying: number | null
  payingShare: string | null
  came7: number | null
  came30: number | null
}

export interface Lead {
  telegramId: string
  name: string | null
  link: string | null
  bot: string | null
  quietDays: number | null
}

export interface HotLeads {
  found: number
  shown: number
  setAsideTouched: number
  leads: Lead[]
}

export interface WaitingRow {
  telegramId: string
  name: string | null
  link: string | null
  bot: string | null
  waiting: 'ours' | 'theirs' | 'due'
  days: number
  stage: string
  because: string
}

export interface WaitingList {
  total: number
  ours: number
  theirs: number
  due: number
  waiting: WaitingRow[]
}

/** The raw shapes the tools return. Named here and nowhere else. */
type RawOverview = Record<string, unknown>
type RawLeads = Record<string, unknown>

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

function toOverview(r: RawOverview): Overview {
  return {
    people: num(r['всего_людей']),
    paying: num(r['платящих']),
    payingShare:
      typeof r['доля_платящих'] === 'string' ? r['доля_платящих'] : null,
    came7: num(r['пришли_за_7_дней']),
    came30: num(r['пришли_за_30_дней']),
  }
}

function toLeads(r: RawLeads): HotLeads {
  const rows = Array.isArray(r['люди']) ? (r['люди'] as RawLeads[]) : []
  return {
    found: num(r['найдено']) ?? 0,
    shown: num(r['показано']) ?? 0,
    setAsideTouched: num(r['set_aside_touched']) ?? 0,
    leads: rows.map(p => ({
      telegramId: String(p['telegram_id'] ?? ''),
      name: typeof p['имя'] === 'string' ? p['имя'] : null,
      link: typeof p['ссылка'] === 'string' ? p['ссылка'] : null,
      bot: typeof p['бот'] === 'string' ? p['бот'] : null,
      quietDays: num(p['молчит_дней']),
    })),
  }
}

const map = <A, B>(r: Reached<A>, f: (a: A) => B): Reached<B> =>
  r.data === null
    ? { reachable: r.reachable, data: null, error: r.error }
    : { reachable: r.reachable, data: f(r.data), error: r.error }

export const loadOverview = async () =>
  map(await callTool<RawOverview>('crm_overview'), toOverview)
/*
 * `telegram_id` becomes `telegramId` HERE and not in the component.
 *
 * Caught by mutation and then by a real type-check: the component read
 * `telegramId` while this interface still said `telegram_id`, so every row key
 * and every touch id would have been `undefined` in production -- the waiting
 * buttons dead. The test had gone green because its fixture was written to
 * match the component instead of the server, which is the fake agreeing with
 * the code rather than with the world.
 */
function toWaiting(r: Record<string, unknown>): WaitingList {
  const rows = Array.isArray(r['waiting'])
    ? (r['waiting'] as Array<Record<string, unknown>>)
    : []
  return {
    total: num(r['total']) ?? 0,
    ours: num(r['ours']) ?? 0,
    theirs: num(r['theirs']) ?? 0,
    due: num(r['due']) ?? 0,
    waiting: rows.map(x => ({
      telegramId: String(x['telegram_id'] ?? ''),
      name: typeof x['name'] === 'string' ? x['name'] : null,
      link: typeof x['link'] === 'string' ? x['link'] : null,
      bot: typeof x['bot'] === 'string' ? x['bot'] : null,
      waiting: (x['waiting'] as WaitingRow['waiting']) ?? 'theirs',
      days: num(x['days']) ?? 0,
      stage: String(x['stage'] ?? 'new'),
      because: String(x['because'] ?? ''),
    })),
  }
}

export const loadWaiting = async () =>
  map(await callTool<Record<string, unknown>>('crm_waiting'), toWaiting)
export const loadHotLeads = async () =>
  map(await callTool<RawLeads>('crm_hot_leads'), toLeads)

/** Record a touch. Changes our memory only -- it sends nothing to anybody. */
export const recordTouch = (telegramId: string, kind: string, note?: string) =>
  callTool<{ saved: boolean; why?: string }>('crm_touch', {
    telegram_id: telegramId,
    kind,
    ...(note ? { note } : {}),
  })
