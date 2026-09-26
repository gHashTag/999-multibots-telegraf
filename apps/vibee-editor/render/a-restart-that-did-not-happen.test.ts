import { describe, it, expect, vi } from 'vitest'
import {
  fixedDriver,
  driverFromEnv,
  railwayRestart,
} from './src/browser/pod-driver'
import {
  browserAnswers,
  waitForBrowser,
  HEALTH_ANSWER,
} from './src/browser/health'
import {
  configureAgentStart,
  restartBrowserAsAgent,
} from './src/browser/routes'

/**
 * A RESTART THAT DID NOT HAPPEN MUST NOT BE REPORTED AS ONE.
 *
 * 2026-09-24..26: the owner could not sign in to any social network through
 * the agent. Chromium in the pod answered HTTP -- `/json/version`, `/json/new`
 * -- while `Runtime.evaluate` timed out and screenshots came back "Internal
 * error", so the agent could neither read nor see a page. Every round detected
 * it, called the one cure, and was told the browser had come back: on the
 * `fixed` driver `stop` is a no-op, so stop-then-start handed the SAME broken
 * Chromium back. The pod had not restarted for three days.
 *
 * Both halves are pinned here: a restart is a real one or it is false, and a
 * browser is healthy when it can RUN something, not when it answers HTTP.
 */

const pool = {
  query: async (sql: string) =>
    /RETURNING profile_id/i.test(sql)
      ? { rows: [{ profile_id: 'profile-1' }] }
      : { rows: [] },
}

describe('is the browser still a browser', () => {
  const io = (evaluate: () => Promise<unknown>) => {
    const closed: string[] = []
    return {
      closed,
      io: {
        newPage: async () => ({ id: 'tab-1' }),
        evaluateOn: evaluate,
        closePage: async (_e: string, id: string) => {
          closed.push(id)
        },
      },
    }
  }

  it('says yes only when a page RUNS something and answers', async () => {
    const { io: healthy } = io(async () => HEALTH_ANSWER)
    expect(await browserAnswers('pod:9223', healthy)).toBe(true)
  })

  it('SAYS NO WHEN EVALUATE HANGS, which is what HTTP liveness missed', async () => {
    const { io: hung, closed } = io(() => new Promise(() => undefined))
    expect(await browserAnswers('pod:9223', hung, 20)).toBe(false)
    /* A probe that leaked tabs would feed the very state it looks for. */
    expect(closed).toEqual(['tab-1'])
  })

  it('says no when evaluate fails outright', async () => {
    const { io: broken } = io(async () => {
      throw new Error('CDP Runtime.evaluate timed out')
    })
    expect(await browserAnswers('pod:9223', broken)).toBe(false)
  })

  it('waits for a pod that needs a moment, and gives up on one that never comes', async () => {
    let tries = 0
    const { io: slow } = io(async () => (++tries >= 3 ? HEALTH_ANSWER : null))
    expect(
      await waitForBrowser('pod:9223', slow, { everyMs: 1, timeoutMs: 1_000 })
    ).toBe(true)

    const { io: dead } = io(async () => null)
    expect(
      await waitForBrowser('pod:9223', dead, { everyMs: 1, timeoutMs: 5 })
    ).toBe(false)
  })
})

describe('the driver restarts the pod for real, or admits it cannot', () => {
  it('admits it when this deployment has no way to restart the service', async () => {
    const d = fixedDriver({ endpoint: 'pod.internal:8080' })
    expect(await d.restart?.('fixed:pod.internal:8080')).toBe(false)
  })

  it('restarts the deployment that exists, without rebuilding it', async () => {
    const sent: string[] = []
    const fetchImpl = (async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { query: string }
      sent.push(body.query)
      return {
        ok: true,
        json: async () =>
          /deployments/.test(body.query)
            ? { data: { deployments: { edges: [{ node: { id: 'dep-7' } }] } } }
            : { data: { deploymentRestart: true } },
      }
    }) as unknown as typeof fetch
    const ok = await railwayRestart({
      token: 't',
      serviceId: 's',
      environmentId: 'e',
      fetchImpl,
    })
    expect(ok).toBe(true)
    expect(sent[1]).toContain('deploymentRestart')
  })

  it('asks for a SUCCESS deployment the way the API accepts it', async () => {
    /*
     * The double above answers any query, so it could not catch this: the live
     * API refuses `status: 'SUCCESS'` with HTTP 400, because
     * DeploymentStatusInput is a filter of lists. Shape pinned here, checked
     * against the pod's own service on 2026-09-26.
     */
    const vars: Record<string, unknown>[] = []
    const fetchImpl = (async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as {
        query: string
        variables: Record<string, unknown>
      }
      vars.push(body.variables)
      return {
        ok: true,
        json: async () =>
          /deployments/.test(body.query)
            ? { data: { deployments: { edges: [{ node: { id: 'dep-7' } }] } } }
            : { data: { deploymentRestart: true } },
      }
    }) as unknown as typeof fetch
    await railwayRestart({
      token: 't',
      serviceId: 'svc',
      environmentId: 'env',
      fetchImpl,
    })
    expect(vars[0].input).toEqual({
      serviceId: 'svc',
      environmentId: 'env',
      status: { in: ['SUCCESS'] },
    })
  })

  it('accepts a PROJECT token, which the account header refuses', async () => {
    /* The two token kinds look alike; a refusal is retried as the other. */
    const headers: string[] = []
    const fetchImpl = (async (
      _url: string,
      init: { headers: Record<string, string>; body: string }
    ) => {
      const project = 'project-access-token' in init.headers
      headers.push(project ? 'project' : 'account')
      if (!project) return { ok: false, status: 401, json: async () => ({}) }
      const body = JSON.parse(init.body) as { query: string }
      return {
        ok: true,
        json: async () =>
          /deployments/.test(body.query)
            ? { data: { deployments: { edges: [{ node: { id: 'dep-7' } }] } } }
            : { data: { deploymentRestart: true } },
      }
    }) as unknown as typeof fetch
    expect(
      await railwayRestart({
        token: 'proj',
        serviceId: 's',
        environmentId: 'e',
        fetchImpl,
      })
    ).toBe(true)
    expect(headers.slice(0, 2)).toEqual(['account', 'project'])
  })

  it('does not claim a restart when Railway refuses', async () => {
    const fetchImpl = (async () => ({
      ok: true,
      json: async () => ({ errors: [{ message: 'Not Authorized' }] }),
    })) as unknown as typeof fetch
    await expect(
      railwayRestart({
        token: 't',
        serviceId: 's',
        environmentId: 'e',
        fetchImpl,
      })
    ).rejects.toThrow(/Not Authorized/)
  })

  it('is wired ONLY when all three of token, service and environment are set', () => {
    const base = {
      BROWSER_POD_DRIVER: 'fixed',
      BROWSER_POD_ENDPOINT: 'pod.internal:8080',
    }
    const exec = async () => ({ stdout: '' })
    const half = driverFromEnv({ ...base, RAILWAY_API_TOKEN: 'tok' }, exec)!
    const whole = driverFromEnv(
      {
        ...base,
        RAILWAY_API_TOKEN: 'tok',
        BROWSER_POD_SERVICE_ID: 'svc',
        RAILWAY_ENVIRONMENT_ID: 'env',
        /* Nowhere, so the test reaches no API at all. */
        RAILWAY_API: 'http://127.0.0.1:9/graphql',
      },
      exec
    )!
    /* Both HAVE restart -- the difference is whether it can do anything. */
    return Promise.all([
      expect(half.restart?.('x')).resolves.toBe(false),
      expect(whole.restart?.('x')).rejects.toBeTruthy(),
    ])
  })
})

describe('what the broker reports', () => {
  it('RETURNS FALSE, AND STARTS NOTHING, when the pod could not be restarted', async () => {
    /*
     * The regression itself: it used to drop the row, start "a new pod" -- the
     * same one -- and return true, so the round told the person their browser
     * was back and walked a browser that was still broken.
     */
    const start = vi.fn()
    const driver = {
      ...fixedDriver({ endpoint: 'pod.internal:8080' }),
      start,
    }
    configureAgentStart(
      () =>
        ({
          getPool: async () => pool,
          driver,
          newToken: () => 'tok',
          env: {},
        }) as never
    )
    expect(await restartBrowserAsAgent('900000001')).toBe(false)
    expect(start).not.toHaveBeenCalled()
  })
})
