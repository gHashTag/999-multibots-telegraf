import { createHash, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'

export type AgentScope = 'full' | 'leela-editorial'
export interface AgentIdentity {
  telegramId: string
  scope: AgentScope
}

export const EDITORIAL_SCOPE_VERSION = 'draft-only-v1'
export const EDITORIAL_PREFIX = 'Leela:'
export const EDITORIAL_TOOLS = new Set([
  'whoami',
  'skills_list',
  'skills_create',
  'plan_list',
  'plan_goal_create',
  'plan_item_add',
])

const credentialHeaders = new Set([
  'x-agent-key',
  'x-api-key',
  'authorization',
  'x-telegram-init-data',
  'x-telegram-initdata',
])
const cardPaths = new Set([
  '/mcp',
  '/health',
  '/.well-known/agent-card.json',
  '/.well-known/agent.json',
])

function sameKey(a: string, b: string): boolean {
  return timingSafeEqual(
    createHash('sha256').update(a).digest(),
    createHash('sha256').update(b).digest()
  )
}

// Null means not an editorial key; an empty owner means recognized but invalid.
// Keep invalid matching entries reserved so a full-key collision cannot elevate.
export function editorialKeyOwner(key: string): string | null {
  if (!key) return null
  let found = false
  let invalid = false
  const owners = new Set<string>()
  for (const pair of (process.env.LEELA_EDITORIAL_AGENT_KEYS || '').split(
    ','
  )) {
    const [candidate, owner, ...extra] = pair.split(':').map(s => s.trim())
    if (!candidate || !sameKey(candidate, key)) continue
    found = true
    if (
      !owner ||
      !/^[1-9]\d{0,15}$/.test(owner) ||
      !Number.isSafeInteger(Number(owner)) ||
      extra.length
    )
      invalid = true
    else owners.add(owner)
  }
  if (!found) return null
  return !invalid && owners.size === 1 ? [...owners][0] : ''
}

export type EditorialAccess =
  | { kind: 'none' }
  | { kind: 'denied'; reason: string }
  | { kind: 'allowed'; identity: AgentIdentity }

/**
 * This check precedes ALL identity precedence and public-path bypasses.
 * Only one X-Agent-Key header is accepted. Alternate/mixed/duplicate credentials
 * fail closed rather than allowing a session or server key to upgrade the scope.
 * Read rawHeaders as well: Node may discard duplicate Authorization headers.
 */
export function editorialAccess(req: IncomingMessage): EditorialAccess {
  const entries: Array<[string, string]> = []
  for (const [name, value] of Object.entries(req.headers)) {
    if (!credentialHeaders.has(name.toLowerCase())) continue
    for (const part of Array.isArray(value) ? value : [value]) {
      if (part?.trim()) entries.push([name.toLowerCase(), part])
    }
  }
  const raw: Array<[string, string]> = []
  for (let i = 0; i < (req.rawHeaders?.length || 0); i += 2) {
    const name = req.rawHeaders[i].toLowerCase()
    const value = req.rawHeaders[i + 1] || ''
    if (credentialHeaders.has(name) && value.trim()) raw.push([name, value])
  }
  const recognized = [...entries, ...raw].some(([, value]) =>
    value
      .split(',')
      .some(
        part =>
          editorialKeyOwner(part.trim().replace(/^Bearer\s+/i, '')) !== null
      )
  )
  if (!recognized) return { kind: 'none' }

  const deny = (): EditorialAccess => ({
    kind: 'denied',
    reason:
      'editorial credential forbidden for this route or credential combination',
  })
  const single = (values: Array<[string, string]>) =>
    values.length === 1 &&
    values[0][0] === 'x-agent-key' &&
    editorialKeyOwner(values[0][1].trim())
  const owner = single(entries)
  if (
    !owner ||
    (raw.length && (!single(raw) || raw[0][1].trim() !== entries[0][1].trim()))
  )
    return deny()

  const path = (req.url || '').split('?')[0]
  if (
    !(req.method === 'POST' && path === '/mcp') &&
    !(req.method === 'GET' && cardPaths.has(path))
  )
    return deny()
  return {
    kind: 'allowed',
    identity: { telegramId: owner, scope: 'leela-editorial' },
  }
}
