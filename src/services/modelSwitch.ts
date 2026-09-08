/**
 * The model and the seller, from the bot. Three thin calls to the render
 * service over the server key, on behalf of the owner who pressed.
 */
const BASE = 'https://vibee-render-production.up.railway.app'
const apiKey = () => process.env.RENDER_API_KEY || ''

export type ProviderId = 'zai' | 'zai-lite' | 'nemotron' | 'ollama'
export const PROVIDER_LABELS: Record<ProviderId, string> = {
  ollama: 'наша (queen-ollama)',
  zai: 'платная (z.ai GLM)',
  'zai-lite': 'платная лёгкая (GLM 4.5)',
  nemotron: 'NVIDIA Nemotron',
}

export interface ProviderStatus {
  current: {
    id: ProviderId
    model: string
    context: number
    compact: boolean
  } | null
  chosen: ProviderId | null
  env: string | null
  chain: Array<{ id: ProviderId; model: string; context: number }>
}

async function call(
  telegramId: string,
  method: 'GET' | 'POST',
  body?: unknown
): Promise<ProviderStatus> {
  if (!apiKey()) throw new Error('RENDER_API_KEY не задан в сервисе бота')
  const r = await fetch(
    `${BASE}/api/agent/provider?telegram_id=${encodeURIComponent(telegramId)}`,
    {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey() },
      body: body === undefined ? undefined : JSON.stringify(body),
    }
  )
  const data = (await r.json().catch(() => ({}))) as ProviderStatus & {
    error?: string
  }
  if (!r.ok) throw new Error(data.error || `рендер ответил ${r.status}`)
  return data
}

export const getProviderStatus = (telegramId: string) => call(telegramId, 'GET')
export const chooseProvider = (telegramId: string, id: ProviderId) =>
  call(telegramId, 'POST', { provider: id })

/** The status in words, for the /model message. */
export function describeProvider(s: ProviderStatus): string {
  if (!s.current) return 'Ни один провайдер модели не настроен.'
  const c = s.current
  const label = PROVIDER_LABELS[c.id] ?? c.id
  const kit = c.compact ? 'набор продавца' : 'все инструменты'
  const rest = s.chain
    .slice(1)
    .map(p => `${PROVIDER_LABELS[p.id] ?? p.id} · ${p.model}`)
  return (
    `Модель агента: ${label}\n${c.model} · окно ${c.context} · ${kit}\n` +
    (rest.length ? `Откат: ${rest.join(' → ')}` : 'Отката нет')
  )
}

/** Who to write to next, from the seller's memory. */
/** One tool of the render agent, called as this person over the server key. */
async function callTool(
  telegramId: string,
  name: string,
  args: Record<string, unknown>
): Promise<Record<string, any>> {
  if (!apiKey()) throw new Error('RENDER_API_KEY не задан в сервисе бота')
  const r = await fetch(
    `${BASE}/mcp?telegram_id=${encodeURIComponent(telegramId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey() },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    }
  )
  const data = (await r.json().catch(() => ({}))) as {
    error?: { message?: string }
    result?: { structuredContent?: unknown; content?: Array<{ text?: string }> }
  }
  if (data.error) throw new Error(data.error.message || `${name} отказал`)
  let s: any = data.result?.structuredContent
  if (!s) {
    try {
      s = JSON.parse(data.result?.content?.[0]?.text ?? '{}')
    } catch {
      s = {}
    }
  }
  return s && typeof s === 'object' ? s : {}
}

/**
 * The render frames another person's words as foreign content so the model
 * treats them as data. The owner is not a model: they read the words.
 */
export function unframe(text: unknown): string {
  return String(text ?? '')
    .replace(/\[FOREIGN CONTENT[^\]]*\]\s*/g, '')
    .replace(/\s*\[END FOREIGN CONTENT\]/g, '')
    .trim()
}

const NEXT_RU: Record<string, string> = {
  reply: 'ответить',
  deliver: 'сделать и отправить',
  offer: 'предложить счёт',
  wait: 'не трогать',
}
const STAGE_RU: Record<string, string> = {
  client: 'клиент',
  refused: 'отказ',
  later: 'просил позже',
  talking: 'в разговоре',
  written: 'написали',
  winback: 'вернуть',
  new: 'новый',
}
const SIGNAL_RU: Record<string, string> = {
  price: 'цена',
  buy: 'покупка',
  service: 'услуга',
  urgency: 'срочно',
  objection: 'возражение',
}
const signalsRu = (v: unknown): string =>
  Array.isArray(v) && v.length
    ? v.map(x => SIGNAL_RU[String(x)] ?? String(x)).join(', ')
    : 'нет'
const ago = (d: unknown): string =>
  d === null || d === undefined
    ? 'давно'
    : Number(d) === 0
      ? 'сегодня'
      : `${d} дн. назад`
const day = (iso: unknown): string => (iso ? String(iso).slice(0, 10) : '—')

/**
 * The list the owner reads: who, what to do, why, their last words. Full
 * data -- a name and a username on every line, never a bare id when the
 * render knows better. The owner asked exactly that.
 */
export function formatLeads(rows: Array<Record<string, unknown>>): string {
  const lines = rows.map((c, i) => {
    const who = c.display ? String(c.display) : `id ${c.lead}`
    const head = `${i + 1}. ${who} · ${c.lead}`
    const step =
      `   ${String(c.next)} — ${NEXT_RU[String(c.next)] ?? ''} · [${c.score}]` +
      ` · ${STAGE_RU[String(c.stage)] ?? c.stage ?? '?'}${c.paid ? ' · платил' : ''}`
    const why = `   ${String(c.because ?? '').slice(0, 140)}`
    const words = unframe(c.last_words)
    const tail =
      `   ${words ? '«' + words.slice(0, 100) + '» · ' : ''}` +
      `${c.messages ?? 0} сообщ., последнее ${ago(c.days_since_their_last_word)}` +
      `${Array.isArray(c.signals) && c.signals.length ? ' · ' + signalsRu(c.signals) : ''}`
    return [head, step, why, tail].join('\n')
  })
  return (
    `Кому писать (по памяти переписки), ${rows.length}:\n\n${lines.join('\n\n')}\n\n` +
    'reply — ответить, deliver — сделать и отправить, offer — счёт, wait — не трогать.\n' +
    'Подробно про человека: /lead <id или @username>'
  )
}

export async function fetchLeads(
  telegramId: string,
  limit = 8
): Promise<{ text: string }> {
  const s = await callTool(telegramId, 'crm_leads', { limit })
  const rows: Array<Record<string, unknown>> = Array.isArray(s?.candidates)
    ? s.candidates
    : []
  if (!rows.length)
    return {
      text: 'Кандидатов нет. Сначала загрузи переписку: агенту «загрузи переписки» или /sweep.',
    }
  return { text: formatLeads(rows) }
}

/** One person in depth: the brief the owner reads before writing to them. */
export function formatLead(s: Record<string, any>): string {
  const touches = Array.isArray(s.touches)
    ? s.touches
        .map((t: any) => `${t.kind} ${day(t.at)}`)
        .slice(0, 6)
        .join(', ')
    : ''
  const dialog = Array.isArray(s.dialog)
    ? s.dialog
        .slice(-8)
        .map((m: any) => {
          const theirs = m.who === 'person'
          return `${theirs ? '›' : ' '} ${day(m.at)} ${theirs ? 'они' : 'я'}: ${unframe(m.text).slice(0, 160)}`
        })
        .join('\n')
    : ''
  const zep = unframe(s.zep_context)
  return [
    `${s.display ?? 'id ' + s.lead} · ${s.lead}`,
    `Ждёт ответа: ${s.waiting_for_reply ? 'ДА' : 'нет'} · от них ${day(s.last_inbound)} · от меня ${day(s.last_outbound)} · сообщений ${s.messages_kept ?? 0}`,
    `Сигналы: ${signalsRu(s.signals)} · интент ${s.intent_score ?? 0} · баланс ${s.balance_tokens ?? '?'} токенов`,
    `Касания: ${touches || 'не было'}`,
    zep ? `Память: ${zep.slice(0, 400)}` : '',
    dialog
      ? `Диалог:\n${dialog}`
      : 'Диалог пуст — сначала /sweep или агенту «загрузи переписки».',
    s.how_to_read ? `Что делать: ${s.how_to_read}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export async function fetchLead(
  telegramId: string,
  who: string
): Promise<{ text: string }> {
  const chat = String(who ?? '').trim()
  if (!chat)
    throw new Error('кого показать? /lead 435572800 или /lead @username')
  const s = await callTool(telegramId, 'crm_lead_context', { chat, limit: 8 })
  return { text: formatLead(s) }
}

/**
 * THE MEMORY STARTS WHEN THE BUSINESS CONNECTION IS MADE.
 *
 * The owner connected their account to the bot; from now on the bot answers
 * their clients as them. It must know the history first: every dialog, deep,
 * into Postgres and Zep. Runs as the owner over the server key; the walk
 * takes minutes, so the caller does not wait.
 */
export async function ingestChats(
  telegramId: string,
  o: { limit?: number; depth?: number } = {}
): Promise<Record<string, unknown>> {
  return callTool(telegramId, 'crm_ingest_chats', {
    limit: o.limit ?? 100,
    depth: o.depth ?? 200,
  })
}

export interface DmMirrorMessage {
  msg_id: number
  /** Unix seconds, as Telegram gives it. */
  at: number
  out: boolean
  text: string
}

/**
 * THE DM EXCHANGE GOES INTO THE MEMORY AT ONCE.
 *
 * The client's message and the answer sent as the owner, with Telegram's own
 * message ids, so the render keeps nothing twice when its ingest reads the
 * same dialog later -- and Zep has the exchange before the next question.
 */
export async function mirrorDm(
  owner: string,
  lead: string,
  name: string | null,
  messages: DmMirrorMessage[]
): Promise<{ ok: boolean; fresh?: number; zep?: number; error?: string }> {
  if (!apiKey()) return { ok: false, error: 'RENDER_API_KEY не задан' }
  const r = await fetch(
    `${BASE}/api/crm/mirror?telegram_id=${encodeURIComponent(owner)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey() },
      body: JSON.stringify({ lead, name, messages }),
    }
  )
  const data = (await r.json().catch(() => ({}))) as {
    ok?: boolean
    fresh?: number
    zep?: number
    error?: string
  }
  return r.ok && data.ok
    ? { ok: true, fresh: data.fresh, zep: data.zep }
    : { ok: false, error: data.error || `HTTP ${r.status}` }
}
