import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as SPEC from './crm-sellers.gen'

/**
 * WHO THE CRM WORKS FOR IS WRITTEN IN t27 FIRST (skill t27-spec-first).
 *
 * gHashTag/t27 specs/automation/crm-sellers.t27 is the spec of record; that
 * the vendored copy, its generated module and the host agree is held by
 * scripts/check-t27-specs.mjs. Here each `test` of the spec runs against the
 * HOST: isSeller / requireSeller (telegram-tools.ts), the crm_sellers tool,
 * and the bot's per-seller sweep (another package: its files are read).
 *
 * v2 came from binding v1: its tests were braceless, compared literals with
 * themselves and named real people; the rules are now fns the host mirrors.
 *
 * Refresh: node scripts/sync-t27-spec.mjs <t27 checkout> automation/crm-sellers
 */
const OWNER = '900000001'
const SELLER = '900000077'
const STRANGER = '900000042'
const SESSION = 'x'.repeat(369)
const ROOT = join(__dirname, '..', '..', '..', '..', '..')

/** A base with sessions for the given ids; the session strings are invented. */
function sessionsPool(ids: string[]) {
  const queries: string[] = []
  return {
    queries,
    query: async (sql: string, params: unknown[] = []) => {
      queries.push(sql.replace(/\s+/g, ' ').trim())
      if (/CREATE TABLE/i.test(sql)) return { rows: [] }
      if (/SELECT session FROM tg_sessions/.test(sql)) {
        return {
          rows: ids.includes(String(params[0])) ? [{ session: SESSION }] : [],
        }
      }
      if (/SELECT telegram_id, updated_at FROM tg_sessions/.test(sql)) {
        return {
          rows: ids.map(telegram_id => ({
            telegram_id,
            updated_at: '2026-09-09T10:00:00.000Z',
            session: SESSION,
          })),
        }
      }
      return { rows: [] }
    },
  }
}

async function tools() {
  return import('../agent/telegram-tools')
}

/** The gate as the spec's admits(has_session, is_owner) reads it. */
async function admitted(id: string, sessions: string[]) {
  const { isSeller } = await tools()
  return isSeller({ telegramId: id, pool: sessionsPool(sessions) } as never)
}

beforeEach(() => {
  vi.resetModules()
  process.env.OWNER_TELEGRAM_ID = OWNER
  delete process.env.TELEGRAM_SESSION_STRING
})

describe("the spec's tests hold against the host", () => {
  it('a person with a connected account is a seller, owner or not', async () => {
    // admits(true, false), admits(true, true)
    expect(await admitted(SELLER, [SELLER, OWNER])).toBe(true)
    expect(await admitted(OWNER, [SELLER, OWNER])).toBe(true)
    expect(SPEC.SELLER_IS).toBe('connected-account')
    const pool = sessionsPool([SELLER])
    const { isSeller } = await tools()
    await isSeller({ telegramId: SELLER, pool } as never)
    expect(pool.queries.some(q => q.includes(SPEC.SESSION_TABLE))).toBe(true)
  })

  it('a person without a session is refused unless they are the owner with the env fallback', async () => {
    // admits(false, false), admits(false, true)
    expect(await admitted(STRANGER, [SELLER])).toBe(false)
    expect(await admitted(OWNER, [])).toBe(true)
    expect(SPEC.OWNER_ALWAYS_ADMITTED).toBe(true)
    // The owner's fallback is the env session string, read by client().
    const src = readFileSync(
      join(__dirname, '..', 'agent', 'telegram-tools.ts'),
      'utf8'
    )
    expect(src).toContain(`process.env.${SPEC.OWNER_FALLBACK}`)
  })

  it('the gate reads the session table, and the refusal names the fix', async () => {
    const { requireSeller } = await tools()
    const pool = sessionsPool([])
    const refused = requireSeller({
      telegramId: STRANGER,
      pool,
    } as never)
    await expect(refused).rejects.toThrow(/Подключите аккаунт в приложении/) // cyrillic-ok: the refusal under test
    expect(SPEC.REFUSAL_NAMES_FIX).toBe(true)
    expect(pool.queries.some(q => q.includes(SPEC.SESSION_TABLE))).toBe(
      SPEC.GATE_READS_SESSION
    )
    expect(SPEC.GATE).toBe(requireSeller.name)
    expect(SPEC.DATA_SCOPED_BY_CALLER).toBe(true)
    // The playbook is every seller's, and an offer to yourself is judged
    // against the caller: crm-playbook.test.ts and crm-offer tests run them.
    expect(SPEC.PLAYBOOK_FOR).toBe('every-seller')
    expect(SPEC.SELF_OFFER_CHECK).toBe('caller')
  })

  it('the sweep runs for each seller, one at a time', () => {
    // The bot's package: its files are read. resolveSellers and the tick are
    // run in src/__tests__/services/crmSellers.test.ts there.
    const sweep = readFileSync(
      join(
        ROOT,
        'src',
        'inngest_app',
        'functions',
        'crm',
        'crmProactiveSweep.ts'
      ),
      'utf8'
    )
    expect(sweep).toContain(`concurrency: { limit: ${SPEC.SWEEP_CONCURRENCY} }`)
    const proactive = readFileSync(
      join(ROOT, 'src', 'services', 'crmProactive.ts'),
      'utf8'
    )
    expect(proactive).toContain(`'${SPEC.SWEEP_SOURCE_TOOL}'`)
    expect(proactive).toContain('export async function runProactiveTickAll')
    const index = readFileSync(join(ROOT, 'src', 'index.ts'), 'utf8')
    expect(index).toContain(`process.env.${SPEC.SWEEP_SOURCE_ENV}`)
    expect(index).toContain(`process.env.${SPEC.SWEEP_SOURCE_FALLBACK}`)
    expect(SPEC.SWEEP_PER_SELLER).toBe(true)
    expect(SPEC.PLAN_PER_SELLER).toBe(true)
  })

  it('the list tool never returns a session string and only the owner may call it', async () => {
    const { CRM_SELLERS_TOOLS } = await import('../agent/crm-sellers-tool')
    const tool = CRM_SELLERS_TOOLS.find(t => t.name === SPEC.LIST_TOOL)!
    expect(tool).toBeTruthy()
    // may_list(false): a seller who is not the platform owner is refused.
    await expect(
      tool.handler({}, {
        telegramId: SELLER,
        pool: sessionsPool([SELLER, OWNER]),
      } as never)
    ).rejects.toThrow()
    // may_list(true): the owner reads ids and dates, never a session.
    const out: any = await tool.handler({}, {
      telegramId: OWNER,
      pool: sessionsPool([SELLER, OWNER]),
    } as never)
    expect(out.count).toBe(2)
    expect(JSON.stringify(out)).not.toContain(SESSION.slice(0, 20))
    expect(out.sellers.every((s: any) => !('session' in s))).toBe(
      !SPEC.LIST_TOOL_RETURNS_SESSION
    )
    expect(SPEC.LIST_TOOL_CALLER).toBe('owner')
    expect(tool.parameters).toMatchObject({
      properties: { probe: { type: 'boolean' } },
    })
    expect(SPEC.LIST_TOOL_PROBE).toBe(true)
    expect(SPEC.SESSIONS_PROBED).toBe(false)
  })
})
