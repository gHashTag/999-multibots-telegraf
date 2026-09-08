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
export async function fetchLeads(
  telegramId: string,
  limit = 8
): Promise<{ text: string }> {
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
        params: { name: 'crm_leads', arguments: { limit } },
      }),
    }
  )
  const data = (await r.json().catch(() => ({}))) as {
    error?: { message?: string }
    result?: { structuredContent?: unknown; content?: Array<{ text?: string }> }
  }
  if (data.error) throw new Error(data.error.message || 'crm_leads отказал')
  let s: any = data.result?.structuredContent
  if (!s) {
    try {
      s = JSON.parse(data.result?.content?.[0]?.text ?? '{}')
    } catch {
      s = {}
    }
  }
  const rows: Array<Record<string, unknown>> = Array.isArray(s?.candidates)
    ? s.candidates
    : []
  if (!rows.length)
    return {
      text: 'Кандидатов нет. Сначала загрузи переписку: агенту «загрузи переписки» или /sweep.',
    }
  const lines = rows.map(
    c =>
      `${String(c.next).padEnd(7)} ${c.lead}  [${c.score}]  ${String(c.because ?? '').slice(0, 60)}`
  )
  return {
    text: `Кому писать (по памяти переписки):\n\n${lines.join('\n')}\n\nreply — ответить, deliver — сделать и отправить, offer — счёт, wait — не трогать.`,
  }
}
