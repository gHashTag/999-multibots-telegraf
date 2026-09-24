/**
 * THE OWNER'S MAILBOX, READ THROUGH ZOHO -- a port of gHashTag/agent-mail-mcp.
 *
 * Owner, 2026-09-24: the mail agent from agent-mail-mcp goes into our own
 * agent, next to the job desk. That repository is the reference: its zmail.py
 * carries measurements this file keeps rather than re-learns (search fields
 * that silently match nothing, the dead `contains:` operator, the two clocks,
 * the send scope that answers 401). Each is cited where it is used.
 *
 * Why a port and not a subprocess: the render container has Node and no
 * Python, and the agent's tools live in one registry (tools.ts) that is also
 * our own MCP surface. A shelled-out CLI would be a second front door with
 * its own failure modes, which is the exact drift agent-mail-mcp was built
 * to avoid.
 *
 * Credentials come from the environment only (ZOHO_CLIENT_ID,
 * ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN; optional ZOHO_REGION,
 * ZOHO_ACCOUNT_ID) -- agent-mail-mcp's "Servers, containers and CI" route.
 * They never appear in a tool result: whoami reports state, never value.
 *
 * Everything here that can be pure is pure and tested (mail-zoho.test.ts).
 */

/** From agent-mail-mcp spec/agent_mail.t27 (generated agent_mail_spec.py). */
export const LIMIT_DEFAULT = 25
export const LIMIT_MAX = 200
export const MESSAGE_LOOKUP_WINDOW = 200
export const SEARCH_FIELDS = ['entire', 'content'] as const
export const SEARCH_OPERATORS = ['contains'] as const
export const SEND_SCOPE = 'ZohoMail.messages.CREATE'
export const SEND_REFUSED_STATUS = 401
export const SEND_REFUSED_CODE = 'INVALID_OAUTHSCOPE'
/** A long thread was measured at 148,316 characters; truncate and SAY so. */
export const READ_MAX_CHARS = 20_000

export class MailError extends Error {}

export function boundedLimit(raw: unknown): number {
  const n = Math.trunc(Number(raw))
  if (!Number.isFinite(n) || n < 1) return LIMIT_DEFAULT
  return Math.min(n, LIMIT_MAX)
}

/**
 * A searchKey Zoho actually honours.
 *
 * Measured by agent-mail-mcp against a real mailbox: a field Zoho does not
 * know is IGNORED, and the newest mail comes back unfiltered with HTTP 200
 * (`from:contains:arxiv` returned mail from hh.ru). So an unknown field is
 * refused rather than passed through. `contains:` returns 0 for every term,
 * so it is stripped. A bare word is wrapped as `entire:<word>`.
 */
export function normaliseSearch(query: string): string {
  const q = String(query ?? '').trim()
  if (!q) throw new MailError('empty search query')
  if (!q.includes(':')) return `entire:${q}`
  const at = q.indexOf(':')
  const field = q.slice(0, at).trim()
  let rest = q.slice(at + 1)
  if (!(SEARCH_FIELDS as readonly string[]).includes(field.toLowerCase())) {
    const term = q.split(':').pop() ?? ''
    throw new MailError(
      `unsupported search field "${field}". Zoho ignores an unknown field and ` +
        `returns the newest mail unfiltered, so results would look like matches ` +
        `and would not be. Use ${SEARCH_FIELDS.join(' or ')}, e.g. entire:${term}. ` +
        `To match a sender, search the address as text: entire:hh.ru`
    )
  }
  const op = rest.indexOf(':')
  if (
    op > 0 &&
    (SEARCH_OPERATORS as readonly string[]).includes(
      rest.slice(0, op).trim().toLowerCase()
    )
  ) {
    rest = rest.slice(op + 1)
  }
  return `${field}:${rest}`
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

export function stripHtml(html: string): string {
  let s = String(html ?? '')
  s = s.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
  s = s.replace(/<br\s*\/?>|<\/p>/gi, '\n')
  s = s.replace(/<[^>]+>/g, ' ')
  s = s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code =
        e[1] === 'x' || e[1] === 'X'
          ? parseInt(e.slice(2), 16)
          : parseInt(e.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
  s = s.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ')
  return s.trim()
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * The two Zoho clocks are not the same clock (agent-mail-mcp, 2026-08-28):
 * receivedTime is a true epoch; sentDateInGMT is a wall clock stored as if
 * it were UTC. Rendered here as UTC, and labelled so.
 */
export function summary(m: Record<string, any>): Record<string, unknown> {
  const ts = m?.receivedTime ?? m?.sentDateInGMT
  let received: string | null = null
  const secs = Number(ts) / 1000
  if (ts && Number.isFinite(secs)) {
    const d = new Date(secs * 1000)
    received =
      `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
      `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
  }
  return {
    messageId: m?.messageId ?? null,
    folderId: m?.folderId ?? null,
    from: m?.fromAddress ?? null,
    to: m?.toAddress ?? null,
    subject: m?.subject ?? null,
    received,
    unread:
      m?.status2 === '0' || m?.isUnread === true || m?.isUnread === 'true',
    hasAttachment: [1, '1', true].includes(m?.hasAttachment),
  }
}

export interface ZohoEnv {
  clientId?: string
  clientSecret?: string
  refreshToken?: string
  region: string
  accountId?: string
}

export function zohoEnv(env: NodeJS.ProcessEnv = process.env): ZohoEnv {
  const clean = (v?: string) => (v ?? '').trim() || undefined
  return {
    clientId: clean(env.ZOHO_CLIENT_ID),
    clientSecret: clean(env.ZOHO_CLIENT_SECRET),
    refreshToken: clean(env.ZOHO_REFRESH_TOKEN),
    region: clean(env.ZOHO_REGION) ?? 'com',
    accountId: clean(env.ZOHO_ACCOUNT_ID),
  }
}

/** Names only: which credentials are missing, never what any of them is. */
export function missingCredentials(e: ZohoEnv): string[] {
  const out: string[] = []
  if (!e.clientId) out.push('ZOHO_CLIENT_ID')
  if (!e.clientSecret) out.push('ZOHO_CLIENT_SECRET')
  if (!e.refreshToken) out.push('ZOHO_REFRESH_TOKEN')
  return out
}

type Fetch = typeof fetch

/**
 * One mailbox, one cached access token. Zoho access tokens live an hour and
 * the refresh endpoint is rate limited, so a token per call would throttle a
 * normal sweep (agent-mail-mcp access_token()).
 */
export class ZohoMail {
  private token: { value: string; expiresAt: number; scope: string } | null =
    null
  private account: { id: string; email: string | null } | null = null

  constructor(
    private readonly env: ZohoEnv,
    private readonly http: Fetch = fetch,
    private readonly now: () => number = Date.now
  ) {}

  private get apiHost(): string {
    return `https://mail.zoho.${this.env.region}`
  }

  /** The grant's scope from the last refresh; '' before the first one. */
  get scope(): string {
    return this.token?.scope ?? ''
  }

  async accessToken(): Promise<string> {
    const missing = missingCredentials(this.env)
    if (missing.length) {
      throw new MailError(
        `mail is not configured: ${missing.join(', ')} not set on this service`
      )
    }
    if (this.token && this.token.expiresAt - 120_000 > this.now()) {
      return this.token.value
    }
    const body = new URLSearchParams({
      refresh_token: this.env.refreshToken!,
      client_id: this.env.clientId!,
      client_secret: this.env.clientSecret!,
      grant_type: 'refresh_token',
    })
    const r = await this.http(
      `https://accounts.zoho.${this.env.region}/oauth/v2/token`,
      { method: 'POST', body, signal: AbortSignal.timeout(30_000) }
    )
    const tok = (await r.json().catch(() => ({}))) as Record<string, any>
    if (!r.ok || !tok.access_token) {
      // The token endpoint's error is a code like "invalid_code"; it never
      // echoes the secret back, but it is still clipped.
      throw new MailError(
        `token refresh failed (HTTP ${r.status}): ${String(tok.error ?? '').slice(0, 80)}`
      )
    }
    this.token = {
      value: String(tok.access_token),
      expiresAt: this.now() + (Number(tok.expires_in) || 3600) * 1000,
      scope: String(tok.scope ?? ''),
    }
    return this.token.value
  }

  async api(
    path: string,
    params?: Record<string, string | number | undefined>
  ): Promise<any> {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v !== undefined && v !== '') q.set(k, String(v))
    }
    const url = `${this.apiHost}/api${path}${q.size ? `?${q}` : ''}`
    const r = await this.http(url, {
      headers: {
        Authorization: `Zoho-oauthtoken ${await this.accessToken()}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(45_000),
    })
    if (!r.ok) {
      const detail = (await r.text().catch(() => '')).slice(0, 400)
      throw new MailError(
        `Zoho HTTP ${r.status} on ${path}: ${detail}` +
          (r.status === 401 || r.status === 403
            ? ' -- usually the SCOPE: re-mint the refresh token (agent-mail-mcp README step 3)'
            : '')
      )
    }
    return await r.json()
  }

  async post(path: string, payload: Record<string, unknown>): Promise<any> {
    const r = await this.http(`${this.apiHost}/api${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${await this.accessToken()}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    })
    if (!r.ok) {
      const detail = (await r.text().catch(() => '')).slice(0, 400)
      throw new MailError(
        `Zoho HTTP ${r.status} on send: ${detail}` +
          (r.status === SEND_REFUSED_STATUS
            ? ` -- sending needs ${SEND_SCOPE}; a refresh never widens a grant, re-mint it`
            : '')
      )
    }
    return await r.json()
  }

  async whoAccount(): Promise<{ id: string; email: string | null }> {
    if (this.account) return this.account
    const data = ((await this.api('/accounts'))?.data ?? []) as any[]
    if (!this.env.accountId && !data.length) {
      throw new MailError('the token is valid but sees no mail account')
    }
    const first = data[0] ?? {}
    this.account = {
      id: this.env.accountId ?? String(first.accountId),
      email: first.primaryEmailAddress ?? null,
    }
    return this.account
  }
}

/** A letter as it will leave, fixed at the moment the owner is asked. */
export interface MailDraft {
  to: string
  subject: string
  body: string
  cc?: string
  replyTo?: string
}

const ADDRESS = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/

/** Comma-separated plain addresses; anything else is refused, not guessed. */
export function checkAddresses(list: string, field: string): string {
  const parts = String(list ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  if (!parts.length) throw new MailError(`${field}: no address`)
  for (const p of parts) {
    if (!ADDRESS.test(p)) throw new MailError(`${field}: not an address: ${p}`)
  }
  return parts.join(',')
}

export function draftFrom(args: Record<string, any>): MailDraft {
  const subject = String(args?.subject ?? '').trim()
  const body = String(args?.body ?? '')
  if (!subject) throw new MailError('subject is required')
  if (!body.trim()) throw new MailError('body is required')
  const d: MailDraft = { to: checkAddresses(args?.to, 'to'), subject, body }
  if (args?.cc) d.cc = checkAddresses(args.cc, 'cc')
  if (args?.reply_to) d.replyTo = String(args.reply_to).trim()
  return d
}

/**
 * The words on the owner's permission card. The whole letter is what is
 * being approved, so the card carries it -- clipped, and saying so.
 */
export function approvalText(d: MailDraft, from: string | null): string {
  const clip = 600
  const body =
    d.body.length > clip
      ? `${d.body.slice(0, clip)}… (+${d.body.length - clip} chars)`
      : d.body
  return [
    'Send an email from your mailbox?',
    `From: ${from ?? '(primary address)'}`,
    `To: ${d.to}`,
    ...(d.cc ? [`Cc: ${d.cc}`] : []),
    `Subject: ${d.subject}`,
    ...(d.replyTo ? [`In reply to: ${d.replyTo}`] : []),
    '',
    body,
  ].join('\n')
}
