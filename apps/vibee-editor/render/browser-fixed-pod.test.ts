import { describe, it, expect } from 'vitest'
import { fixedDriver, driverFromEnv } from './src/browser/pod-driver'
import { handleBrowser, isThePodsOwner } from './src/browser/routes'

/**
 * ONE PROVISIONED POD, ONE PERSON.
 *
 * On Railway the only driver is `fixed`: one browser, started once. Two
 * things were wrong with it, and both had kept it from ever being switched on.
 */

const OWNER = '900000001'
const STRANGER = '900000002'
const env = { BROWSER_POD_OWNER: OWNER }

const deps = (who: string) => ({
  getPool: async () => ({
    query: async () => ({ rows: [] }),
  }),
  identity: () => who,
  driver: fixedDriver({ endpoint: 'pod.internal:8080' }),
  newToken: () => 'minted-token-xyz',
  actor: () => 'person' as const,
  env,
})

describe('who may open the shared pod', () => {
  it('LETS NOBODY BUT ITS ONE OWNER IN', async () => {
    /*
     * Handed to everybody, the first person to sign into their mail would
     * open it to all the rest. Everybody else gets the same answer they got
     * before any pod existed.
     */
    const out = await handleBrowser(
      { url: '/api/browser/session', method: 'POST' },
      deps(STRANGER) as never
    )
    expect(out.status).toBe(503)
    expect(out.body.state).toBe('unavailable')
  })

  it('refuses a stranger on EVERY method, not only on open', async () => {
    for (const method of ['GET', 'POST', 'DELETE']) {
      const out = await handleBrowser(
        { url: '/api/browser/session', method },
        deps(STRANGER) as never
      )
      expect(out.status, method).toBe(503)
    }
  })

  it('lets the owner through to the broker', async () => {
    const out = await handleBrowser(
      { url: '/api/browser/session', method: 'GET' },
      deps(OWNER) as never
    )
    expect(out.status).not.toBe(503)
  })

  it('NAMES ONE PERSON, never a list', () => {
    /* Two trusted people sharing one browser still share each other's
       logins. A comma is not a way to add a second owner. */
    expect(isThePodsOwner(OWNER, env)).toBe(true)
    expect(isThePodsOwner(STRANGER, env)).toBe(false)
    expect(
      isThePodsOwner(OWNER, { BROWSER_POD_OWNER: `${OWNER},${STRANGER}` })
    ).toBe(false)
    expect(isThePodsOwner('', env)).toBe(false)
  })
})

describe('the shared pod signs in with its OWN password', () => {
  it('REPORTS THE PASSWORDS IT WAS STARTED WITH', async () => {
    /*
     * The broker minted a fresh pair per visit and stored it regardless, so
     * the proxy swapped a password the pod had never heard of into its login
     * and the viewer could never sign in. `fixed` had never worked end to
     * end. The driver now says what the pod accepts, and the broker keeps it.
     */
    const pod = await fixedDriver({
      endpoint: 'pod.internal:8080',
      viewPassword: 'pod-view-pw',
      adminPassword: 'pod-admin-pw',
    }).start({
      sessionId: 's',
      profileId: 'p',
      viewToken: 'minted-view',
      adminToken: 'minted-admin',
    })
    expect(pod.viewToken).toBe('pod-view-pw')
    expect(pod.adminToken).toBe('pod-admin-pw')
  })

  it('reads them from the environment the deployment sets', async () => {
    const d = driverFromEnv(
      {
        BROWSER_POD_DRIVER: 'fixed',
        BROWSER_POD_ENDPOINT: 'pod.internal:8080',
        BROWSER_POD_VIEW_PASSWORD: 'from-env-view',
        BROWSER_POD_ADMIN_PASSWORD: 'from-env-admin',
      },
      async () => ({ stdout: '' })
    )!
    const pod = await d.start({
      sessionId: 's',
      profileId: 'p',
      viewToken: 'x',
      adminToken: 'y',
    })
    expect(pod.viewToken).toBe('from-env-view')
    expect(pod.adminToken).toBe('from-env-admin')
  })
})

describe('what the broker writes down', () => {
  it('STORES THE POD PASSWORD, not the one it minted', async () => {
    /*
     * Found by mutation: the driver reported the pod's password and the
     * broker could still write its own minted token over it -- the tests
     * above only checked the driver. This drives a real open and reads what
     * was written, because the stored token is what the proxy swaps into
     * the pod's login.
     */
    const writes: unknown[][] = []
    const pool = {
      query: async (sql: string, params: unknown[] = []) => {
        if (/INSERT INTO browser_sessions|UPDATE browser_sessions/i.test(sql)) {
          writes.push(params)
        }
        /* profileIdFor reads its row back and refuses, honestly, without one. */
        if (/RETURNING profile_id/i.test(sql)) {
          return { rows: [{ profile_id: 'profile-1' }] }
        }
        return { rows: [] }
      },
    }
    const out = await handleBrowser(
      { url: '/api/browser/session', method: 'POST' },
      {
        getPool: async () => pool,
        identity: () => OWNER,
        driver: fixedDriver({
          endpoint: 'pod.internal:8080',
          viewPassword: 'pod-own-view',
          adminPassword: 'pod-own-admin',
        }),
        newToken: () => 'broker-minted',
        actor: () => 'person' as const,
        env,
      } as never
    )
    expect(out.status).toBe(201)
    const flat = writes.flat().map(String)
    expect(flat).toContain('pod-own-view')
    expect(flat).toContain('pod-own-admin')
  })
})
