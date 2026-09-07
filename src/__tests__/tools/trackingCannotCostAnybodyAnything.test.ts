import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

/**
 * RECORDING A STEP MAY NEVER COST SOMEBODY THEIR ANSWER.
 *
 * The funnel between arriving and paying was invisible: `payments_v2` knows
 * about invoices, `prompts_history` about generations, and nothing knew the
 * middle -- where 2380 registered people become 354 who ever generated. That
 * blindness is also why top-ups stopping in December 2025 went unnoticed until
 * September.
 *
 * But a tracker that throws, or that makes a person wait, is worse than no
 * tracker. So the rule is absolute: `track` swallows everything and is never
 * awaited by a caller.
 */
const ROOT = path.join(__dirname, '..', '..', '..')

vi.mock('@/core/supabase', () => ({
  supabase: {
    from: () => ({
      insert: async () => {
        throw new Error('the database is on fire')
      },
    }),
  },
}))

describe('track never reaches the caller, whatever happens', () => {
  beforeEach(() => vi.clearAllMocks())

  it('resolves even when the insert throws', async () => {
    const { track } = await import('@/services/trackEvent')
    await expect(
      track({ from: { id: 1 }, botInfo: { username: 'b' } }, 'start')
    ).resolves.toBeUndefined()
  })

  it('resolves when there is no person to attribute the step to', async () => {
    const { track } = await import('@/services/trackEvent')
    await expect(track({}, 'menu_shown')).resolves.toBeUndefined()
  })
})

describe('every call site is fire-and-forget', () => {
  /**
   * `await track(...)` would put the database between a person and their reply.
   * The whole point is that it cannot, so no call site may await.
   */
  const SITES = [
    'src/navigation/registerCommands.ts',
    'src/navigation/helpers/menuKeyboard.ts',
    'src/price/helpers/sendInsufficientStarsMessage.ts',
    'src/navigation/middleware/noSilence.ts',
  ]

  it('finds the call sites it claims to check', () => {
    const found = SITES.filter(f =>
      fs.readFileSync(path.join(ROOT, f), 'utf8').includes('track(')
    )
    expect(found).toEqual(SITES)
  })

  it('never awaits a step, at any of them', () => {
    const awaited: string[] = []
    for (const file of SITES) {
      const src = fs.readFileSync(path.join(ROOT, file), 'utf8')
      if (/await\s+track\s*\(/.test(src)) awaited.push(file)
    }
    expect(
      awaited,
      'a step must never be awaited: it would make a person wait'
    ).toEqual([])
  })

  it('records the six steps the reader counts, and no others', () => {
    const helper = fs.readFileSync(
      path.join(ROOT, 'src/services/trackEvent.ts'),
      'utf8'
    )
    const reader = fs.readFileSync(
      path.join(ROOT, 'scripts/events.cjs'),
      'utf8'
    )
    const declared = [...helper.matchAll(/^\s*\|\s*'([a-z_]+)'/gm)].map(
      m => m[1]
    )
    expect(declared.length).toBeGreaterThanOrEqual(6)
    for (const step of declared) {
      expect(reader, `the reader must count '${step}'`).toContain(`'${step}'`)
    }
  })
})

describe('the reader will not print a funnel it did not measure', () => {
  const SCRIPT = path.join(ROOT, 'scripts', 'events.cjs')
  const run = (env: NodeJS.ProcessEnv) => {
    try {
      return {
        code: 0,
        out: execFileSync('node', [SCRIPT], {
          cwd: ROOT,
          encoding: 'utf8',
          env,
        }),
      }
    } catch (e: any) {
      return {
        code: e.status ?? -1,
        out: String(e.stdout || '') + String(e.stderr || ''),
      }
    }
  }

  it('exits 2 without credentials rather than showing an empty funnel', () => {
    const bare = { ...process.env }
    delete bare.SUPABASE_URL
    delete bare.SUPABASE_SERVICE_ROLE_KEY
    delete bare.SUPABASE_SERVICE_KEY
    delete bare.SUPABASE_ANON_KEY
    const { code, out } = run(bare)
    expect(code, `output:\n${out}`).toBe(2)
    expect(out).toContain('NO CREDENTIALS')
  })

  /**
   * The subtle one, and it bit on the first production run: a missing table
   * came back as a count of `null` with NO error, the error-only guard did not
   * fire, and the reader printed a column of nulls. The condition has to be
   * "did I get a number".
   */
  it('treats a non-numeric count as a refusal, not as data', () => {
    const source = fs.readFileSync(SCRIPT, 'utf8')
    expect(source).toMatch(/typeof probe\.n !== 'number'/)
    expect(source).toContain('THE TABLE IS NOT THERE')
    expect(source).toContain('20260908_user_events.sql')
  })
})
