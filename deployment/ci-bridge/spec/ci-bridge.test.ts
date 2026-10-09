/**
 * Binding test of spec automation/ci-bridge: every `test` of the spec, run
 * against the bridge's own functions (bridge.mjs), which call the compiled
 * logic in ci-bridge.logic.ts. The HTTP side is bridge.test.mjs.
 */
import { describe, expect, it } from 'vitest'
import * as SPEC from './ci-bridge.gen'
import {
  CONTEXT,
  SUITES,
  markMode,
  needsRun,
  runsHere,
  verdict,
} from '../bridge.mjs'
import { appJwt, heal, recheckAsked } from '../bridge.mjs'
import { generateKeyPairSync } from 'node:crypto'

const REPO = 'gHashTag/999-multibots-telegraf'
const T0 = Date.parse('2026-10-09T12:00:00Z')
const pr = (fullName: string, updatedS: number) => ({
  head: { repo: { full_name: fullName } },
  updated_at: new Date(updatedS * 1000).toISOString(),
})
const pending = (ageS: number) => ({
  state: 'pending',
  updated_at: new Date(T0 - ageS * 1000).toISOString(),
})

describe('spec automation/ci-bridge', () => {
  it('the host speaks the spec names', () => {
    expect(CONTEXT).toBe(SPEC.CONTEXT)
    expect(SUITES.join(',')).toBe(SPEC.SUITES)
  })

  it('only our own heads touched since the bridge began run', () => {
    const since = 100_000_000
    const at = (s: number) => s * 1000
    expect(SPEC.FORK_HEADS_RUN).toBe(false)
    expect(runsHere(pr(REPO, 100_000_000), REPO, at(since))).toBe(true)
    expect(runsHere(pr(REPO, 100_000_001), REPO, at(since))).toBe(true)
    expect(runsHere(pr(REPO, 99_999_999), REPO, at(since))).toBe(false)
    expect(runsHere(pr('stranger/fork', 200_000_000), REPO, at(since))).toBe(
      false
    )
  })

  it('a head runs once; only a lost pending older than an hour runs again', () => {
    expect(needsRun(null, T0)).toBe(true)
    expect(
      needsRun({ state: 'success', updated_at: '2026-01-01T00:00:00Z' }, T0)
    ).toBe(false)
    expect(needsRun(pending(SPEC.STALE_S), T0)).toBe(false)
    expect(needsRun(pending(SPEC.STALE_S + 1), T0)).toBe(true)
    expect(needsRun(pending(1800), T0)).toBe(false)
  })

  it('a status when allowed, else a check run, else nothing runs', () => {
    expect(markMode(undefined)).toBe('statuses')
    expect(markMode({ statuses: 'write', checks: 'write' })).toBe('statuses')
    expect(markMode({ statuses: 'write' })).toBe('statuses')
    expect(markMode({ checks: 'write' })).toBe('checks')
    expect(markMode({ pull_requests: 'read' })).toBe(null)
  })

  it('an error is never green and any failed suite is red', () => {
    expect(verdict({ a: 0, b: 0, c: 0, d: 0 }).state).toBe('success')
    expect(verdict({ a: 0, b: 0, c: 0, d: 1 }).state).toBe('failure')
    expect(verdict(null).state).toBe('error')
    expect(verdict({ error: 'boom' }).state).toBe('error')
    expect(verdict({}).state).toBe('error')
    expect(verdict({ a: 1 }).code).toBe(SPEC.STATE_FAILURE)
    expect(verdict({}).code).toBe(SPEC.STATE_ERROR)
    expect(verdict({ a: 0 }).code).toBe(SPEC.STATE_SUCCESS)
  })

  it("the JWT stays under GitHub's ten minutes and the token is renewed early", () => {
    expect(SPEC.JWT_LIFE_S + SPEC.JWT_BACKDATE_S).toBeLessThanOrEqual(
      SPEC.GITHUB_JWT_MAX_S
    )
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const jwt = appJwt('42', privateKey, T0)
    const body = JSON.parse(
      Buffer.from(jwt.split('.')[1], 'base64url').toString()
    )
    expect(body.iat).toBe(T0 / 1000 - SPEC.JWT_BACKDATE_S)
    expect(body.exp - body.iat).toBe(SPEC.JWT_LIFE_S)
    /* renewal at the margin is pinned in bridge.test.mjs ("mints once, reuses
     * the token, renews it before it ends"): 4 min left renews, 10 do not */
  })

  it('a stale bridge heals once, after its grace', async () => {
    const json = (v: unknown) => new Response(JSON.stringify(v))
    const fetch = async (url: string) => {
      const u = new URL(url)
      if (u.hostname === 'backboard.railway.com')
        return json({ data: { serviceInstanceDeployV2: 'd' } })
      if (u.pathname.endsWith('/commits')) return json([{ sha: 'new' }])
      if (u.pathname.includes('/compare/')) return json({ status: 'behind' })
      return json({ sha: 'head' })
    }
    const cfg = {
      repo: REPO,
      token: 't',
      ownSha: 'old',
      railwayToken: 'r',
      serviceId: 's',
      environmentId: 'e',
      startedAt: T0,
      healed: false,
    }
    const at = (s: number) => ({ fetch, now: () => T0 + s * 1000, log() {} })
    expect(await heal({ ...cfg }, at(SPEC.STALE_GRACE_S - 1))).toBe(
      'stale, waiting'
    )
    const once = { ...cfg }
    expect(await heal(once, at(SPEC.STALE_GRACE_S))).toBe('healing')
    expect(await heal(once, at(99_999))).toBe('stale, waiting')
    expect(await heal({ ...cfg, ownSha: 'new' }, at(99_999))).toBe('fresh')
  })

  it('a trusted /recheck newer than a finished mark runs the head again', async () => {
    const mark = { state: 'failure', updated_at: '2026-10-09T11:00:00Z' }
    const ask = (association: string, at: string, m: unknown = mark) =>
      recheckAsked(
        { repo: REPO, token: 't' },
        {
          fetch: async () =>
            new Response(
              JSON.stringify([
                {
                  body: SPEC.RECHECK_WORD,
                  author_association: association,
                  created_at: at,
                },
              ])
            ),
        },
        { number: 7 },
        m
      )
    expect(await ask('OWNER', '2026-10-09T11:30:00Z')).toBe(true)
    expect(await ask('NONE', '2026-10-09T11:30:00Z')).toBe(false)
    expect(await ask('OWNER', '2026-10-09T10:30:00Z')).toBe(false)
    expect(
      await ask('OWNER', '2026-10-09T11:30:00Z', {
        state: 'pending',
        updated_at: mark.updated_at,
      })
    ).toBe(false)
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(2)
  })
})
