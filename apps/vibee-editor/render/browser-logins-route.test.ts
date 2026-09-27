import { describe, it, expect } from 'vitest'
import { handleBrowser } from './src/browser/routes'
import { fixedDriver } from './src/browser/pod-driver'
import type { NetworkLogin } from './src/browser/logins'

/**
 * WHICH NETWORKS AM I SIGNED INTO, ASKED WITHOUT WRITING ANYTHING.
 *
 * Before this route the only way to read the answer was to IMPORT cookies (a
 * write) and read the `signedIn` it echoes, or to call the agent tool. This
 * pins the read-only door -- and the one distinction that makes it honest:
 * no running browser is `running: false`, a THIRD outcome, never an empty
 * signed-out list.
 */

const OWNER = '900000001'

const deps = (personLogins: () => Promise<NetworkLogin[] | null>) => ({
  getPool: async () => ({ query: async () => ({ rows: [] }) }),
  identity: () => OWNER,
  driver: fixedDriver({ endpoint: 'pod:8080' }),
  newToken: () => 'tok',
  actor: () => 'person',
  env: { BROWSER_POD_OWNER: OWNER },
  personLogins,
})

describe('GET /api/browser/logins', () => {
  it('reports per-network state when a browser is running', async () => {
    const networks: NetworkLogin[] = [
      { id: 'google', name: 'Google', state: 'signed_in' },
      { id: 'instagram', name: 'Instagram', state: 'signed_out' },
      { id: 'hh', name: 'hh.ru', state: 'unknown' },
    ]
    const out = await handleBrowser(
      { url: '/api/browser/logins', method: 'GET' },
      deps(async () => networks) as never
    )
    expect(out.status).toBe(200)
    const body = out.body as {
      ok: boolean
      running: boolean
      networks: NetworkLogin[]
    }
    expect(body.running).toBe(true)
    expect(body.networks).toEqual(networks)
  })

  it('says running:false when no browser is running -- NOT an empty list', async () => {
    const out = await handleBrowser(
      { url: '/api/browser/logins', method: 'GET' },
      deps(async () => null) as never
    )
    expect(out.status).toBe(200)
    const body = out.body as {
      ok: boolean
      running: boolean
      networks?: unknown
    }
    // The third outcome: nobody was asked, not "signed out of everything".
    expect(body.running).toBe(false)
    expect('networks' in body).toBe(false)
  })

  it('is read-only', async () => {
    const out = await handleBrowser(
      { url: '/api/browser/logins', method: 'POST' },
      deps(async () => null) as never
    )
    expect(out.status).toBe(405)
  })

  it('never leaks a cookie value -- only names and states cross the wire', async () => {
    const networks: NetworkLogin[] = [
      { id: 'x', name: 'X', state: 'signed_in' },
    ]
    const out = await handleBrowser(
      { url: '/api/browser/logins', method: 'GET' },
      deps(async () => networks) as never
    )
    // NetworkLogin has no value field by construction; pin it on the wire too.
    expect(JSON.stringify(out.body)).not.toMatch(/value|cookie|auth_token/i)
  })
})
