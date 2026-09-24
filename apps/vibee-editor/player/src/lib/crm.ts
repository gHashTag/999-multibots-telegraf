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
import { markEmbedSignInNeeded } from '@/lib/embedGuest'

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
      // In the game's TRI frame a refused credential means "sign in", and the
      // route gate swaps the CRM for the sign-in panel (lib/embedGuest.ts).
      if (r.status === 401) markEmbedSignInNeeded()
      return {
        reachable: false,
        data: null,
        error: `сервер ответил ${r.status}`,
      }
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

/* ───────────────────────────────────────────────────────────────────────────
 * ONE CLIENT, ON A SCREEN. Loaders for `/crm/:clientId`.
 *
 * Contract: research/crm-client-workspace-contract.md §3. Same rule as above:
 * every loader goes through `/mcp`, so the seller gate lives in the tools and
 * nowhere here. Keys are translated to camelCase ONCE, at this boundary.
 * ─────────────────────────────────────────────────────────────────────────── */

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null)
const rows = (v: unknown): Array<Record<string, unknown>> =>
  Array.isArray(v) ? (v as Array<Record<string, unknown>>) : []

/** A row of the clients list on `/crm` (tool `crm_clients`). */
export interface ClientRow {
  telegramId: string
  name: string | null
  username: string | null
  client: string | null
  hasProfile: boolean
  hasSoul: boolean
  skills: number
  stage: string
  /** Read from payments on the server; `false` when payments were unreadable. */
  paid: boolean
  lastSeen: string | null
  duets: number
  /** The picture the rail draws; null means initials (ChatThreads.tsx). */
  avatarUrl: string | null
}

/**
 * The list plus one fact about the list itself: whether the server could read
 * payments at all. `paidKnown: false` means every `paid` is `false` for lack
 * of data, not for lack of money, and the screen must say so rather than
 * show a client list with nobody paying.
 */
export interface ClientsList {
  clients: ClientRow[]
  paidKnown: boolean
}

function toClients(r: Record<string, unknown>): ClientsList {
  return {
    clients: rows(r['clients']).map(c => ({
      telegramId: String(c['telegram_id'] ?? ''),
      name: str(c['name']),
      username: str(c['username']),
      client: str(c['client']),
      hasProfile: bool(c['has_profile']) ?? false,
      hasSoul: bool(c['has_soul']) ?? false,
      skills: num(c['skills']) ?? 0,
      stage: String(c['stage'] ?? 'new'),
      paid: bool(c['paid']) ?? false,
      lastSeen: str(c['last_seen']),
      duets: num(c['duets']) ?? 0,
      avatarUrl: str(c['avatar_url']),
    })),
    // An older server that does not send the flag is treated as knowing:
    // the note is for a server that SAID it could not read payments.
    paidKnown: bool(r['paid_known']) ?? true,
  }
}

export const loadClients = async (limit?: number) =>
  map(
    await callTool<Record<string, unknown>>(
      'crm_clients',
      limit ? { limit } : {}
    ),
    toClients
  )

/**
 * Start a duet with a client (tool `crm_duet`). Owner-only ON THE SERVER: a
 * non-owner gets the tool's own refusal back as `error`, and the screen shows
 * that text instead of guessing the role and hiding the button.
 *
 * `dryRun: false` makes the agent send REAL Telegram messages to the client,
 * which is why the screen confirms first and defaults to a dry run. Errors
 * are returned, never thrown, like every other loader here.
 */
export interface DuetStart {
  started: boolean
  duetId: string | null
  buyer: string | null
  turns: number | null
  dryRun: boolean | null
  hint: string | null
  /** Why it did not start (a duet already running, usually). */
  reason: string | null
}

function toDuetStart(r: Record<string, unknown>): DuetStart {
  return {
    started: bool(r['started']) ?? false,
    duetId:
      r['duet_id'] === undefined || r['duet_id'] === null
        ? null
        : String(r['duet_id']),
    buyer: str(r['buyer']),
    turns: num(r['turns']),
    dryRun: bool(r['dry_run']),
    hint: str(r['hint']),
    reason: str(r['reason']),
  }
}

export const startDuet = async (
  buyer: string,
  turns: number,
  dryRun: boolean
) =>
  map(
    await callTool<Record<string, unknown>>('crm_duet', {
      buyer,
      turns,
      dry_run: dryRun,
    }),
    toDuetStart
  )

/** Profile, SOUL and skills of one client (tool `crm_client_profile`). */
export interface ClientProfile {
  telegramId: string
  client: string | null
  hasProfile: boolean
  hasSoul: boolean
  skills: string[]
  profile: Record<string, unknown> | null
  updatedAt: string | null
  /**
   * The first 400 characters of their SOUL, when the caller may read it.
   * The card beside a conversation shows it: a reply written without the
   * person's own words about themselves is written to a stranger.
   */
  soulExcerpt: string | null
  soulIsDraft: boolean
  /** The server declined to show SOUL and skills: not yours to read. */
  privateWithheld: boolean
}

/**
 * The tool predates this screen and is read by a model, so the exact key set
 * is not promised. The mapper accepts both a `profile` object and the older
 * spelling, and treats a missing `skills` list as zero skills rather than as
 * an error -- the panel itself is still `reachable`.
 */
function toClientProfile(r: Record<string, unknown>): ClientProfile {
  const profile =
    r['profile'] && typeof r['profile'] === 'object'
      ? (r['profile'] as Record<string, unknown>)
      : null
  const skillsRaw = r['skills']
  const skills = Array.isArray(skillsRaw)
    ? skillsRaw.map(s =>
        typeof s === 'string'
          ? s
          : String((s as Record<string, unknown>)?.['name'] ?? '')
      )
    : []
  return {
    telegramId: String(r['telegram_id'] ?? ''),
    client: str(r['client']) ?? str(profile?.['client']),
    hasProfile: bool(r['has_profile']) ?? profile !== null,
    hasSoul: bool(r['has_soul']) ?? false,
    skills: skills.filter(Boolean),
    profile,
    updatedAt: str(r['updated_at']),
    soulExcerpt: str(r['soul_excerpt'])?.trim() || null,
    soulIsDraft: bool(r['soul_is_draft']) ?? false,
    privateWithheld: bool(r['private_withheld']) ?? false,
  }
}

export const loadClientProfile = async (telegramId: string) =>
  map(
    await callTool<Record<string, unknown>>('crm_client_profile', {
      telegram_id: telegramId,
    }),
    toClientProfile
  )

/** Content plan of one client (tool `crm_client_plan`). */
export interface PlanGoal {
  id: number
  title: string
  intent: string | null
  total: number
  done: number
  byStatus: Record<string, number>
}

export interface PlanItem {
  id: number
  goalId: number | null
  title: string
  status: string
  templateId: string | null
  updatedAt: string | null
}

export interface ClientPlan {
  total: number
  done: number
  goals: PlanGoal[]
  items: PlanItem[]
}

function toClientPlan(r: Record<string, unknown>): ClientPlan {
  return {
    total: num(r['total']) ?? 0,
    done: num(r['done']) ?? 0,
    goals: rows(r['goals']).map(g => {
      const items = (g['items'] ?? {}) as Record<string, unknown>
      const by = (items['by_status'] ?? {}) as Record<string, unknown>
      const byStatus: Record<string, number> = {}
      for (const [k, v] of Object.entries(by)) {
        const n = num(v)
        if (n !== null) byStatus[k] = n
      }
      return {
        id: num(g['id']) ?? 0,
        title: String(g['title'] ?? ''),
        intent: str(g['intent']),
        total: num(items['total']) ?? 0,
        done: num(items['done']) ?? 0,
        byStatus,
      }
    }),
    items: rows(r['items']).map(i => ({
      id: num(i['id']) ?? 0,
      goalId: num(i['goal_id']),
      title: String(i['title'] ?? ''),
      status: String(i['status'] ?? 'idea'),
      templateId: str(i['template_id']),
      updatedAt: str(i['updated_at']),
    })),
  }
}

export const loadClientPlan = async (telegramId: string) =>
  map(
    await callTool<Record<string, unknown>>('crm_client_plan', {
      telegram_id: telegramId,
    }),
    toClientPlan
  )

/** One persisted duet run (tool `crm_duet_runs`). */
export interface DuetCoverage {
  tool: string
  calls: number
  ok: number
  fail: number
}

export interface DuetRun {
  id: string
  buyer: string
  state: 'done' | 'running' | 'failed' | 'lost' | string
  dryRun: boolean
  turns: number
  startedAt: string | null
  finishedAt: string | null
  paidCalls: number
  mediaSent: number
  profileUsed: boolean | null
  coverage: DuetCoverage[]
  violations: string[]
  voiceFlags: string[]
  lines: number
  /** Why a `failed` run stopped (the turn and its error); null otherwise. */
  error: string | null
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(x => String(x)) : []

function toDuetRuns(r: Record<string, unknown>): DuetRun[] {
  return rows(r['runs']).map(x => {
    const cov = (x['coverage'] ?? {}) as Record<string, unknown>
    return {
      id: String(x['id'] ?? ''),
      buyer: String(x['buyer'] ?? ''),
      state: String(x['state'] ?? 'lost'),
      dryRun: bool(x['dry_run']) ?? false,
      turns: num(x['turns']) ?? 0,
      startedAt: str(x['started_at']),
      finishedAt: str(x['finished_at']),
      paidCalls: num(x['paid_calls']) ?? 0,
      mediaSent: num(x['media_sent']) ?? 0,
      profileUsed: bool(x['profile_used']),
      coverage: Object.entries(cov).map(([tool, c]) => {
        const cc = (c ?? {}) as Record<string, unknown>
        return {
          tool,
          calls: num(cc['calls']) ?? 0,
          ok: num(cc['ok']) ?? 0,
          fail: num(cc['fail']) ?? 0,
        }
      }),
      violations: strings(x['violations']),
      voiceFlags: strings(x['voice_flags']),
      lines: num(x['lines']) ?? 0,
      error: str(x['error']),
    }
  })
}

export const loadDuetRuns = async (buyer: string, limit = 10) =>
  map(
    await callTool<Record<string, unknown>>('crm_duet_runs', { buyer, limit }),
    toDuetRuns
  )

/** Touches and derived stage of one lead (tool `crm_history {chat}`). */
export interface Touch {
  kind: string
  at: string | null
  note: string | null
  bot: string | null
}

export interface ClientHistory {
  stage: string | null
  waiting: string | null
  touches: Touch[]
}

/*
 * `crm_history` was written for the model, so its keys may be Russian like
 * the overview's. Both spellings are read; the English one wins when present.
 */
function toClientHistory(r: Record<string, unknown>): ClientHistory {
  // Server shape (crm_history {telegram_id}): {total, stage, because,
  // waiting: 'ours'|'theirs'|'due'|null, touches[] {kind, at, note, bot_name}}.
  const list = rows(r['touches'])
  return {
    stage: str(r['stage']),
    waiting: str(r['waiting']),
    touches: list.map(x => ({
      kind: String(x['kind'] ?? ''),
      at: str(x['at']),
      note: str(x['note']),
      bot: str(x['bot_name']) ?? str(x['bot']),
    })),
  }
}

export const loadClientHistory = async (chat: string) =>
  map(
    await callTool<Record<string, unknown>>('crm_history', {
      telegram_id: chat,
    }),
    toClientHistory
  )

/** Last DM turns with a lead (tool `crm_lead_context {chat}`). */
export interface LeadMessage {
  at: string | null
  out: boolean
  text: string
}

export interface LeadContext {
  name: string | null
  username: string | null
  waitingOnUs: boolean | null
  messages: LeadMessage[]
  /**
   * The three facts the card beside a conversation is for. The tool has
   * always returned them; the mapper used to drop them, so the screen asked
   * the server for a person's whole context and showed a name.
   */
  stage: string | null
  balanceTokens: number | null
  /** Their last inbound line, ready to read: the first thing a reply needs. */
  lastWords: string | null
  /** When they last wrote, and when we did (ISO), for "silent N days". */
  lastInbound: string | null
  lastOutbound: string | null
  /** Buying words found in their messages: price, buy, service, urgency, objection. */
  signals: string[]
  intentScore: number | null
  /** The free portrait: given, being drawn, or ready to send. */
  portrait: { given: boolean; drawing: boolean; ready: boolean } | null
  /** They asked the assistant to stop writing; only the owner writes then. */
  assistantOff: boolean
  /** What long-term memory (Zep) knows about them, stripped of markers. */
  memory: string | null
}

/**
 * The server wraps inbound lead text in a prompt-injection guard
 * (`[FOREIGN CONTENT — …]` … `[END FOREIGN CONTENT]`) meant for the model,
 * not for a human reading the dashboard. Strip it for display only.
 */
export function stripForeignMarkers(text: string): string {
  return text
    .replace(/^\s*\[FOREIGN CONTENT[^\]]*\]\s*/u, '')
    .replace(/\s*\[END FOREIGN CONTENT\]\s*$/u, '')
    .trim()
}

function toLeadContext(r: Record<string, unknown>): LeadContext {
  // Server shape (crm_lead_context): dialog[] {at, who: 'owner'|'person', text},
  // waiting_for_reply = count of unanswered inbound messages.
  const list = rows(r['dialog'] ?? r['messages'])
  const waiting = num(r['waiting_for_reply'])
  const messages = list.map(x => ({
    at: str(x['at']),
    out: x['who'] === 'owner' || (bool(x['out']) ?? false),
    text: stripForeignMarkers(String(x['text'] ?? '')),
  }))
  // Their last words, not ours: a card that quoted our own message back at us
  // would answer the wrong question.
  const theirs = [...messages].reverse().find(m => !m.out && m.text)
  return {
    name: str(r['name']),
    username: str(r['username']),
    waitingOnUs: waiting === null ? bool(r['waiting_on_us']) : waiting > 0,
    messages,
    stage: str(r['stage']),
    balanceTokens: num(r['balance_tokens']),
    lastWords: str(r['last_words']) ?? theirs?.text ?? null,
    lastInbound: str(r['last_inbound']),
    lastOutbound: str(r['last_outbound']),
    signals: strings(r['signals']),
    intentScore: num(r['intent_score']),
    portrait: toPortrait(r['portrait']),
    assistantOff: !!r['assistant_off'],
    memory: str(r['zep_context'])
      ? stripForeignMarkers(String(r['zep_context'])) || null
      : null,
  }
}

function toPortrait(v: unknown): LeadContext['portrait'] {
  if (!v || typeof v !== 'object') return null
  const p = v as Record<string, unknown>
  return {
    given: bool(p['given']) ?? false,
    drawing: bool(p['drawing']) ?? false,
    ready: bool(p['ready']) ?? false,
  }
}

export const loadLeadContext = async (chat: string) =>
  map(
    await callTool<Record<string, unknown>>('crm_lead_context', { chat }),
    toLeadContext
  )

/** Files exchanged with a lead (tool `crm_lead_media {lead}`). */
export interface LeadMedia {
  id: string
  kind: string
  name: string | null
  at: string | null
  out: boolean
  url: string | null
}

function toLeadMedia(r: Record<string, unknown>): LeadMedia[] {
  // Server shape (crm_lead_media): items[] {at, who, kind, name, url, ...}.
  return rows(r['items'] ?? r['media']).map(x => ({
    id: String(x['id'] ?? x['url'] ?? ''),
    kind: String(x['kind'] ?? 'file'),
    name: str(x['name']),
    at: str(x['at']),
    out: x['who'] === 'owner' || (bool(x['out']) ?? false),
    url: str(x['url']),
  }))
}

export const loadLeadMedia = async (lead: string) =>
  map(
    await callTool<Record<string, unknown>>('crm_lead_media', { lead }),
    toLeadMedia
  )

/* ────────────────────────── AUTOPILOT ───────────────────────────────────── */

/**
 * THE SWITCH THAT ANSWERS "WILL IT SEND WITHOUT ME".
 *
 * One row per seller, the same one the bot's buttons flip (`crm_autopilot`).
 * The screen shows the two numbers a person actually needs -- when the window
 * closes and how many automatic sends are left today -- because a switch that
 * only says "on" invites exactly those two questions.
 */
export type AutopilotScope = 'all' | 'chosen'

export interface Autopilot {
  on: boolean
  /** Everybody the sweep drew a card for, or only the people he picked. */
  scope: AutopilotScope
  /** How many are picked; 0 with `chosen` means nothing sends by itself. */
  chosen: number
  until: string | null
  minutesLeft: number
  sentToday: number
  leftToday: number
  cap: number
  hours: number
}

const toAutopilot = (r: Record<string, unknown>): Autopilot => ({
  on: bool(r['on']) ?? false,
  scope: r['scope'] === 'chosen' ? 'chosen' : 'all',
  chosen: num(r['chosen']) ?? 0,
  until: str(r['until']),
  minutesLeft: num(r['minutes_left']) ?? 0,
  sentToday: num(r['sent_today']) ?? 0,
  leftToday: num(r['left_today']) ?? 0,
  cap: num(r['cap']) ?? 0,
  hours: num(r['hours']) ?? 0,
})

export const loadAutopilot = async () =>
  map(await callTool<Record<string, unknown>>('autopilot_status'), toAutopilot)

/** on=false stops it at once; `hours` is clamped on the server (1..24). */
export const setAutopilot = async (
  on: boolean,
  hours?: number,
  scope?: AutopilotScope
) =>
  map(
    await callTool<Record<string, unknown>>('autopilot_set', {
      on,
      ...(on && hours ? { hours } : {}),
      ...(on && scope ? { scope } : {}),
    }),
    toAutopilot
  )

/** Pick one person for AUTO, or unpick them (tool `autopilot_lead`). */
export const pickForAutopilot = async (telegramId: string, on: boolean) =>
  map(
    await callTool<Record<string, unknown>>('autopilot_lead', {
      lead: telegramId,
      on,
    }),
    toAutopilot
  )

/** Whom he picked (tool `autopilot_leads`). */
export const loadAutopilotLeads = async () =>
  map(
    await callTool<Record<string, unknown>>('autopilot_leads', {}),
    (r: Record<string, unknown>) =>
      (Array.isArray(r['leads']) ? (r['leads'] as unknown[]) : []).map(String)
  )

/* ──────────────────────── REMOVE FROM THE CRM ───────────────────────────── */

export interface DropResult {
  lead: string
  dropped?: boolean
  restored?: boolean
  removedMessages: number
  note?: string | null
}

const toDrop = (r: Record<string, unknown>): DropResult => {
  const removed = (r['removed'] ?? {}) as Record<string, unknown>
  return {
    lead: String(r['lead'] ?? ''),
    dropped: bool(r['dropped']) ?? undefined,
    restored: bool(r['restored']) ?? undefined,
    removedMessages: num(removed['crm_messages']) ?? 0,
    note: str(r['note']),
  }
}

/**
 * Remove a person from the CRM, or put them back.
 *
 * The cached correspondence is deleted and a mark is written so the next
 * ingest does not bring them back; nothing leaves Telegram and no money table
 * is touched. The screen asks a second time before calling this -- it is the
 * one action here that destroys something.
 */
export const dropClient = async (telegramId: string) =>
  map(
    await callTool<Record<string, unknown>>('crm_drop', { lead: telegramId }),
    toDrop
  )

export const restoreClient = async (telegramId: string) =>
  map(
    await callTool<Record<string, unknown>>('crm_drop', {
      lead: telegramId,
      restore: true,
    }),
    toDrop
  )

/* ─────────────────────── LEADS BY SEGMENT ───────────────────────────────── */

/** The segments the server sorts people into; `all` asks for no segment. */
export const SEGMENTS = [
  'all',
  'hot',
  'objection',
  'waiting',
  'talk',
  'due',
  'ours',
  'warm',
  'winback',
] as const
export type Segment = (typeof SEGMENTS)[number]

export interface SegmentLead {
  telegramId: string
  name: string | null
  username: string | null
  segment: string
  next: string | null
  because: string | null
  unanswered: number
  lastInbound: string | null
  paid: boolean
}

const toSegmentLeads = (r: Record<string, unknown>): SegmentLead[] =>
  rows(r['leads'] ?? r['люди'] ?? r['list']).map(l => ({
    telegramId: String(l['lead'] ?? l['telegram_id'] ?? ''),
    name: str(l['name']),
    username: str(l['username']),
    segment: String(l['segment'] ?? ''),
    next: str(l['next']),
    because: str(l['because']),
    unanswered: num(l['unanswered']) ?? 0,
    lastInbound: str(l['last_inbound']),
    paid: bool(l['paid']) ?? false,
  }))

export const loadSegment = async (segment: Segment, limit = 30) =>
  map(
    await callTool<Record<string, unknown>>('crm_leads', {
      limit,
      ...(segment === 'all' ? {} : { segment }),
    }),
    toSegmentLeads
  )

/* ─────────────────── HOW MUCH WENT OUT WITHOUT YOU ─────────────────────── */

/**
 * The one measured figure this product can honestly publish about itself.
 * Counted on the server from journal rows that already exist, so it is true
 * about the past too -- see render/src/agent/outcomes-tool.ts for what it
 * deliberately does NOT claim.
 */
export interface Outcomes {
  days: number
  /** Answers the agent gave clients in his chats, with no press at all. */
  dmAnswered: number
  autoSent: number
  pressedSent: number
  cancelled: number
  cardsDrawn: number
  quiet: number
  failed: number
  /** 0..100, or null when nothing left at all -- never a made-up zero. */
  withoutYouPercent: number | null
  note: string | null
  /** The same window before this one; null means there is nothing to compare. */
  before: {
    autoSent: number
    pressedSent: number
    dmAnswered: number
    left: number
    withoutYouPercent: number | null
  } | null
}

const toOutcomes = (r: Record<string, unknown>): Outcomes => ({
  days: num(r['days']) ?? 7,
  dmAnswered: num(r['dm_answered']) ?? 0,
  autoSent: num(r['auto_sent']) ?? 0,
  pressedSent: num(r['pressed_sent']) ?? 0,
  cancelled: num(r['cancelled']) ?? 0,
  cardsDrawn: num(r['cards_drawn']) ?? 0,
  quiet: num(r['quiet']) ?? 0,
  failed: num(r['failed']) ?? 0,
  withoutYouPercent: num(r['without_you_percent']),
  note: str(r['note']),
  before: (() => {
    const b = r['before']
    if (!b || typeof b !== 'object') return null
    const o = b as Record<string, unknown>
    return {
      autoSent: num(o['auto_sent']) ?? 0,
      dmAnswered: num(o['dm_answered']) ?? 0,
      pressedSent: num(o['pressed_sent']) ?? 0,
      left: num(o['left']) ?? 0,
      withoutYouPercent: num(o['without_you_percent']),
    }
  })(),
})

export const loadOutcomes = async (days = 7) =>
  map(
    await callTool<Record<string, unknown>>('crm_outcomes', { days }),
    toOutcomes
  )
