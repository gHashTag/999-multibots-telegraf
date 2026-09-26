import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketplaceAgentPrompt, systemPrompt } from './src/agent/chat'
import { threadFor } from './src/agent/routes'

describe('the first labour-market agent is real and isolated', () => {
  it('gives Blogger the complete publication contract', () => {
    const prompt = marketplaceAgentPrompt('blogger')
    expect(prompt).toContain('БЛОГЕР T27')
    expect(prompt).toContain('полные EN и RU версии')
    expect(prompt).toContain('трёхпанельный')
    expect(prompt).toContain('хештегов')
    expect(prompt).toContain('контекстный офер')
    expect(prompt).toContain('X, LinkedIn и Telegram')
    expect(systemPrompt('miniapp', false, 'blogger')).toContain(prompt)
  })

  it('refuses catalogue cards that are still training', async () => {
    /*
     * A trainee may be opened by its verdicts (hire by evidence); a table
     * that cannot be read keeps it CLOSED, which is what this pool proves.
     */
    const getPool = () => {
      throw new Error('the verdict table is unreachable')
    }
    await expect(threadFor(null, '42', getPool, 'blogger')).resolves.toEqual({
      ok: true,
      thread: 'agent:blogger',
      client: null,
      agent: 'blogger',
    })
    await expect(threadFor(null, '42', getPool, 'google')).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'agent is not available',
    })
  })

  /*
   * A SPECIALIST IN A CLIENT'S CONVERSATION (owner, 2026-09-26). The memory
   * stays the client's; the agent brings its contract. Whether the caller
   * may talk about this client at all is still the seller gate's answer.
   */
  it('a seller may call an agent into a client conversation; the memory stays the client’s', async () => {
    const OWNER = process.env.OWNER_TELEGRAM_ID || '144022504'
    const pool = async () => ({}) as never
    await expect(threadFor('12345', OWNER, pool, 'blogger')).resolves.toEqual({
      ok: true,
      thread: 'client:12345',
      client: '12345',
      agent: 'blogger',
    })
  })

  it('a stranger gets neither the client nor the agent', async () => {
    const getPool = () => {
      throw new Error('no seller row can be read')
    }
    await expect(threadFor('12345', '42', getPool, 'blogger')).resolves.toEqual(
      { ok: false, status: 403, error: 'not a seller' }
    )
  })

  it('an unknown agent is refused even in a client conversation', async () => {
    const OWNER = process.env.OWNER_TELEGRAM_ID || '144022504'
    const pool = async () => ({}) as never
    await expect(threadFor('12345', OWNER, pool, 'nobody')).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'agent is not available',
    })
  })
})

/*
 * OWNER PREVIEW (#2957). A trainee goes live after one real run; the keeper
 * is the one who can make it. Everybody else is still sold live agents only.
 */
describe('a keeper can open a trainee, nobody else can', () => {
  const KEEPER = '900000077'
  const getPool = () => {
    throw new Error('the market gate must not touch the database')
  }
  let saved: string | undefined
  beforeEach(() => {
    saved = process.env.HIVE_KEEPERS
    process.env.HIVE_KEEPERS = KEEPER
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.HIVE_KEEPERS
    else process.env.HIVE_KEEPERS = saved
  })

  it('opens every catalogued trainee for the keeper, each in its own thread', async () => {
    for (const id of ['job', 'google', 'tiktok', 'scientist', 'fpga', 'rtl']) {
      await expect(threadFor(null, KEEPER, getPool, id)).resolves.toEqual({
        ok: true,
        thread: `agent:${id}`,
        client: null,
        agent: id,
      })
    }
  })

  it('still refuses a trainee to anybody who is not a keeper', async () => {
    await expect(threadFor(null, '900000078', getPool, 'job')).resolves.toEqual(
      { ok: false, status: 400, error: 'agent is not available' }
    )
  })

  it('refuses an agent that is not in the catalogue, even to a keeper', async () => {
    await expect(
      threadFor(null, KEEPER, getPool, 'nonexistent')
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'agent is not available',
    })
  })

  it('the trainee a keeper opened speaks with its own voice', () => {
    const job = marketplaceAgentPrompt('job')
    expect(job).toContain('РАБОТА И НАЙМ') // cyrillic-ok: matches the prompt's words
    expect(systemPrompt('miniapp', false, 'job')).toContain(job)
  })
})

/*
 * EVERY SPECIALIST HAS A CONTRACT, AND IT NAMES ONLY REAL TOOLS (#2958).
 * A prompt that promises a tool the registry does not have is the
 * "agent claims a capability" defect in its purest form.
 */
describe('specialist contracts', () => {
  it('every catalogued agent has one, naming only tools that exist', async () => {
    const { MARKETPLACE_AGENTS } = await import(
      '../packages/vibee-atoms/src/agent-marketplace'
    )
    const { TOOLS } = await import('./src/agent/tools')
    const names = new Set(TOOLS.map(t => t.name))
    for (const a of MARKETPLACE_AGENTS) {
      const prompt = marketplaceAgentPrompt(a.id)
      expect(prompt.length, a.id).toBeGreaterThan(200)
      const refs = prompt.match(/\b[a-z]+_[a-z_]*/g) ?? []
      for (const ref of refs) {
        const ok = ref.endsWith('_')
          ? [...names].some(n => n.startsWith(ref))
          : names.has(ref)
        expect(ok, `${a.id} names ${ref}`).toBe(true)
      }
    }
  })

  it('the three trainees carry their done-conditions', () => {
    expect(marketplaceAgentPrompt('google')).toMatch(/web_read/)
    expect(marketplaceAgentPrompt('google')).toContain('не найдено') // cyrillic-ok: contract words
    expect(marketplaceAgentPrompt('tiktok')).toContain('pricing')
    expect(marketplaceAgentPrompt('tiktok')).toContain('ссылка на mp4') // cyrillic-ok: contract words
    expect(marketplaceAgentPrompt('scientist')).toContain('шаги') // cyrillic-ok: contract words
    expect(marketplaceAgentPrompt('scientist')).toContain('не измерено') // cyrillic-ok: contract words
    expect(marketplaceAgentPrompt('scientist')).toContain('гипотеза') // cyrillic-ok: contract words
    /* FPGA and RTL run no synthesis or simulator: they must say so. */
    expect(marketplaceAgentPrompt('fpga')).toContain('не запускалось') // cyrillic-ok: contract words
    expect(marketplaceAgentPrompt('fpga')).toContain('323') // the withdrawn figure is the reason
    expect(marketplaceAgentPrompt('rtl')).toContain('тестбенч') // cyrillic-ok: contract words
    expect(marketplaceAgentPrompt('rtl')).toContain('не запускалось') // cyrillic-ok: contract words
    /* The engineers run what they write, and quote it (hdl-run.ts). */
    expect(marketplaceAgentPrompt('rtl')).toContain('hdl_run')
    expect(marketplaceAgentPrompt('fpga')).toContain('hdl_run mode synth')
  })
})

/*
 * HIRE BY EVIDENCE (owner, 2026-09-24). A trainee with seven passing daily
 * checks in a row opens to everybody, not only to a keeper; anything short
 * of that -- or a verdict table that cannot be read -- keeps it closed.
 */
describe('a trainee that earned the market', () => {
  const passingDays = (agent: string, days: number, pass = true) => {
    const now = Date.now()
    return Array.from({ length: days }, (_, d) => ({
      agent,
      at: new Date(now - d * 24 * 3_600_000 - 60_000).toISOString(),
      pass,
    }))
  }
  const poolWith = (rows: Array<Record<string, unknown>>) => () => ({
    async query(sql: string) {
      if (sql.includes('SELECT agent, at, pass FROM agent_acceptance'))
        return { rows }
      return { rows: [] }
    },
  })

  it('seven passing days open it to a client who is not a keeper', async () => {
    await expect(
      threadFor(null, '900000078', poolWith(passingDays('job', 7)), 'job')
    ).resolves.toEqual({
      ok: true,
      thread: 'agent:job',
      client: null,
      agent: 'job',
    })
  })

  it('six days, or a failure among the seven, keep it closed', async () => {
    const refused = { ok: false, status: 400, error: 'agent is not available' }
    await expect(
      threadFor(null, '900000078', poolWith(passingDays('job', 6)), 'job')
    ).resolves.toEqual(refused)
    const withAFailure = passingDays('job', 7)
    withAFailure[3] = { ...withAFailure[3], pass: false }
    await expect(
      threadFor(null, '900000078', poolWith(withAFailure), 'job')
    ).resolves.toEqual(refused)
  })

  it("one agent's streak does not open another", async () => {
    await expect(
      threadFor(null, '900000078', poolWith(passingDays('google', 7)), 'job')
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'agent is not available',
    })
  })
})
