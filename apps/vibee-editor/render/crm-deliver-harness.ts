/**
 * crm_deliver_photo on the bench: a strict crm_owed (crm-owed-double.ts), a
 * pool that throws on any statement it was not taught, and a drawing tool
 * that counts provider tasks and owner charges -- the two numbers "never
 * paid for twice" is about.
 *
 * Shared by the tests for the late portrait and for the client's face, so
 * both read the same doubles. Ids are synthetic (9000000xx).
 */
import { vi } from 'vitest'
import type { OwedDouble } from './crm-owed-double'

export const OWNER = '900000201'
export const LEAD = '900000202'
export const TASK = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
export const TASK2 = '0f1e2d3c4b5a69788796a5b4c3d2e1f0'
export const AVATAR = 'https://s3.example/lead-avatar.jpg'
export const PROVIDER = 'https://tempfile.example/portrait.png'
export const KEPT = 'https://s3.example/kept-portrait.png'

/** Let a chain of already-resolved awaits run to its end. */
export const flush = async () => {
  for (let i = 0; i < 200; i++) await Promise.resolve()
}

/**
 * Everything the delivery touches besides crm_owed, by shape. An unknown
 * statement throws, so a new query cannot pass through unnoticed.
 */
export function deliveryPool(owed: OwedDouble, balance?: number) {
  const journal: Array<{ kind: string; what: string }> = []
  const other: string[] = []
  return {
    journal,
    other,
    query: async (sql: string, p: unknown[] = []) => {
      const flat = sql.replace(/\s+/g, ' ').trim()
      if (/\bcrm_owed\b/.test(flat)) return owed.query(sql, p)
      other.push(flat)
      if (/^CREATE (TABLE|INDEX) IF NOT EXISTS hive_events/.test(flat))
        return { rows: [] }
      if (/^INSERT INTO hive_events/.test(flat)) {
        journal.push({ kind: String(p[0]), what: String(p[4]) })
        return { rows: [] }
      }
      if (/^SELECT balance FROM user_tokens WHERE telegram_id = \$1/.test(flat))
        return {
          rows:
            balance === undefined || String(p[0]) !== LEAD ? [] : [{ balance }],
        }
      throw new Error(`delivery pool: statement not understood: ${flat}`)
    },
  }
}

/**
 * The drawing tool, as the delivery sees it -- and in the ORDER the real
 * image_edit works: the charge is taken and the Kie task created at the start
 * of the call, the task id is reported at once (onImageTask, as runKieJob's
 * onCreated does), and only then does the call wait for the picture. `plan`
 * says what each call answers; `gate`, when given, is what the wait waits on,
 * so a test can put a second call inside the first one's wait.
 */
export function drawingTool(
  plan: Array<'pending' | 'done' | 'fail'>,
  gate?: Promise<unknown>
) {
  const ledger = { tasks: 0, charges: 0 }
  const calls: Array<Record<string, unknown>> = []
  const tool = {
    name: 'image_edit',
    description: '',
    parameters: {},
    handler: async (args: Record<string, unknown>, ctx: any) => {
      calls.push({
        ...args,
        waitMs: ctx?.imageWaitMs,
        chargeLater: ctx?.chargeLater,
        faceOf: ctx?.faceOf,
      })
      ledger.tasks++
      if (!ctx?.chargeLater) ledger.charges++
      const taskId = ledger.tasks === 1 ? TASK : TASK2
      const n = ledger.tasks
      await ctx?.onImageTask?.(taskId)
      if (gate) await gate
      const next = plan.shift() ?? 'done'
      return next === 'pending'
        ? { done: false, pending: true, taskId, reason: 'still drawing' }
        : next === 'fail'
          ? { done: false, reason: 'Kie refused inside the wait' }
          : { done: true, url: `https://s3.example/drawn-${n}.png` }
    },
  }
  return { tool, ledger, calls }
}

/** A text-to-image tool that records what it was asked to draw. */
export function generatingTool() {
  const calls: Array<Record<string, unknown>> = []
  const tool = {
    name: 'image_generate',
    description: '',
    parameters: {},
    handler: async (args: Record<string, unknown>, ctx: any) => {
      calls.push({ ...args, chargeLater: ctx?.chargeLater })
      return { url: 'https://s3.example/no-person.png' }
    },
  }
  return { tool, calls }
}

/** The clock the owed double writes with, unless a test gives it another. */
export const DOUBLE_NOW = Date.parse('2026-09-21T12:00:00Z')

export async function deliverySetup(o: {
  owed: OwedDouble
  plan?: Array<'pending' | 'done' | 'fail'>
  /** What the drawing tool's wait waits on (see drawingTool). */
  gate?: Promise<unknown>
  /** What reading the avatar waits on: a request still choosing the face. */
  avatarGate?: Promise<unknown>
  kie?: Array<'running' | 'success' | 'fail' | 'unknown'>
  /** The delivery's clock; default: the owed double's own. */
  now?: () => number
  avatar?: string
  sent?: Array<{ url: string; transcript: string | null }>
  /** The caller has corresponded with the lead (paid deliveries need it). */
  ownClient?: boolean
  /** The lead's wallet; absent means no row yet. */
  balance?: number
}) {
  vi.doMock('./src/agent/crm-offer-tool', async orig => ({
    ...((await orig()) as object),
    resolveLead: async () => ({
      id: LEAD,
      display: 'Test (@test_lead)',
      firstName: 'Test',
    }),
  }))
  vi.doMock('./src/agent/telegram-tools', async orig => ({
    ...((await orig()) as object),
    requireSeller: async () => undefined,
  }))
  vi.doMock('./src/agent/crm-touch-tools', async orig => ({
    ...((await orig()) as object),
    reachable: async () => ({ ok: false, why: 'test' }),
  }))
  vi.doMock('./src/agent/chat-memory', async orig => ({
    ...((await orig()) as object),
    personOf: async () => (o.ownClient ? { username: 'test_lead' } : null),
  }))
  const { forgetOwedTableForTests } = await import('./src/agent/crm-owed')
  forgetOwedTableForTests()
  const mod = await import('./src/agent/crm-deliver-tool')
  const q = await import('./src/agent/tg-proposals')
  q.forgetProposals()
  const draw = drawingTool(o.plan ?? [], o.gate)
  const gen = generatingTool()
  const kie = o.kie ?? []
  const check = vi.fn(async (id: string) => {
    const s = kie.shift() ?? 'running'
    return s === 'success'
      ? { state: 'success' as const, taskId: id, url: PROVIDER }
      : s === 'fail'
        ? { state: 'fail' as const, taskId: id, reason: 'Kie refused' }
        : s === 'unknown'
          ? {
              state: 'unknown' as const,
              taskId: id,
              reason: 'recordInfo: HTTP 404 record not found',
            }
          : { state: 'running' as const, taskId: id }
  })
  const keep = vi.fn(async () => KEPT)
  const avatarAsked: string[] = []
  const tools = mod.makeCrmDeliverTools(
    n =>
      n === 'image_edit'
        ? (draw.tool as never)
        : n === 'image_generate'
          ? (gen.tool as never)
          : undefined,
    {
      leadPhoto: async (_c, lead) => {
        avatarAsked.push(lead.id)
        if (o.avatarGate) await o.avatarGate
        return o.avatar ?? AVATAR
      },
      sentPhotos: async () => o.sent ?? [],
      checkTask: check,
      keepImage: keep,
      now: o.now ?? (() => DOUBLE_NOW),
    }
  )
  const pool = deliveryPool(o.owed, o.balance)
  const ctx = {
    telegramId: OWNER,
    pool,
    turn: 'turn-1',
    surface: 'bot',
  } as never
  return {
    deliver: tools.find(t => t.name === 'crm_deliver_photo')!,
    rescue: tools.find(t => t.name === 'crm_portrait_rescue')!,
    q,
    draw,
    gen,
    check,
    keep,
    pool,
    ctx,
    avatarAsked,
    PORTRAIT_DRAWING: mod.PORTRAIT_DRAWING,
    PORTRAIT_WAIT_MS: mod.PORTRAIT_WAIT_MS,
  }
}
