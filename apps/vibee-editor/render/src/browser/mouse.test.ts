import { describe, it, expect } from 'vitest'
import {
  pickPersonSession,
  settingsToFix,
  handMouseToPerson,
  type NekoSession,
} from './mouse'

const s = (
  id: string,
  over: Partial<NekoSession['state']> = {},
  admin = false
): NekoSession => ({
  id,
  profile: { is_admin: admin, can_host: true },
  state: { is_connected: true, ...over },
})

describe('whose session gets the mouse', () => {
  it('never the render s own admin logins', () => {
    expect(pickPersonSession([s('admin-1', {}, true)])).toBeNull()
  })

  it('the newest watching session of the person', () => {
    const got = pickPersonSession([
      s('old', { is_watching: true, watching_since: '2026-09-22T10:00:00Z' }),
      s('new', { is_watching: true, watching_since: '2026-09-22T12:00:00Z' }),
      s('idle', {
        is_watching: false,
        connected_since: '2026-09-22T13:00:00Z',
      }),
    ])
    expect(got?.id).toBe('new')
  })

  it('nobody when nobody is connected', () => {
    expect(pickPersonSession([s('gone', { is_connected: false })])).toBeNull()
  })
})

describe('the room lets a touch in', () => {
  it('leaves a room that already does alone', () => {
    expect(settingsToFix({ implicit_hosting: true })).toBeNull()
  })
  it('unlocks locked controls and turns implicit hosting on', () => {
    expect(
      settingsToFix({ locked_controls: true, implicit_hosting: false, x: 1 })
    ).toEqual({ locked_controls: false, implicit_hosting: true, x: 1 })
  })
})

describe('handMouseToPerson against a fake pod', () => {
  function pod(control: { has_host: boolean; host_id?: string }) {
    const calls: string[] = []
    const fetcher = async (url: string, init?: { method?: string }) => {
      const path = url.replace('http://pod:8080', '')
      calls.push(`${init?.method || 'GET'} ${path}`)
      const body =
        path === '/api/login'
          ? { token: 't' }
          : path === '/api/room/settings'
            ? { implicit_hosting: true }
            : path === '/api/sessions'
              ? [
                  s('admin-x', {}, true),
                  s('me', {
                    is_watching: true,
                    watching_since: '2026-09-22T12:00:00Z',
                  }),
                ]
              : path === '/api/room/control'
                ? control
                : null
      return { ok: true, status: 200, text: async () => JSON.stringify(body) }
    }
    return { calls, fetcher }
  }

  it('gives control to the person when a stale session holds it', async () => {
    const p = pod({ has_host: true, host_id: 'stale' })
    const r = await handMouseToPerson(
      { endpoint: 'pod:8080', adminToken: 'a' },
      p.fetcher
    )
    expect(r.outcome).toBe('given')
    expect(p.calls).toContain('POST /api/room/control/give/me')
  })

  it('does nothing when the person already holds it', async () => {
    const p = pod({ has_host: true, host_id: 'me' })
    const r = await handMouseToPerson(
      { endpoint: 'pod:8080', adminToken: 'a' },
      p.fetcher
    )
    expect(r.outcome).toBe('already')
    expect(p.calls.some(c => c.includes('/give/'))).toBe(false)
  })
})
