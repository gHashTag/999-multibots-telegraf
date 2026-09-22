/**
 * THE PERSON'S TOUCH MOVES THE MOUSE -- MADE SO BY THE SERVER, NOT HOPED FOR.
 *
 * Owner, 2026-09-22: "why can't I control the mouse in the browser in manual
 * mode?". The same day the viewer's own bar was hidden inside the app
 * (skin.ts FRAMED_CSS), and with it neko's keyboard icon -- the only visible
 * way to ASK for control. What was left was implicit hosting, which only
 * works while nobody else holds control and the room's controls are not
 * locked. Any stale session holding control -- another device, a tab left
 * open -- and the person's clicks go nowhere, with nothing on screen to say
 * why.
 *
 * So when the person takes the wheel (routes.ts /api/browser/wheel, sent on
 * their first touch), the render, which holds the pod's admin login, makes
 * the room agree: controls unlocked, implicit hosting on, and control given
 * to the person's newest watching session. The agent never drives through
 * neko (it drives through CDP), so this takes nothing from it.
 */
import { nekoLogin } from './screen'

export interface NekoSession {
  id: string
  profile?: { is_admin?: boolean; can_host?: boolean; name?: string }
  state?: {
    is_connected?: boolean
    is_watching?: boolean
    connected_since?: string
    watching_since?: string
  }
}

export interface RoomSettings {
  locked_controls?: boolean
  implicit_hosting?: boolean
  [k: string]: unknown
}

/**
 * The session the person is looking through: connected, not an admin (the
 * render's own logins are admins), watching if any is, the newest first.
 * Pure.
 */
export function pickPersonSession(sessions: NekoSession[]): NekoSession | null {
  const people = sessions.filter(
    s => s.state?.is_connected && !s.profile?.is_admin
  )
  if (!people.length) return null
  const watching = people.filter(s => s.state?.is_watching)
  const pool = watching.length ? watching : people
  const since = (s: NekoSession) =>
    Date.parse(s.state?.watching_since || s.state?.connected_since || '') || 0
  return pool.reduce((a, b) => (since(b) >= since(a) ? b : a))
}

/** The settings to write, or null when the room already lets a touch in. Pure. */
export function settingsToFix(s: RoomSettings): RoomSettings | null {
  if (!s.locked_controls && s.implicit_hosting !== false) return null
  return { ...s, locked_controls: false, implicit_hosting: true }
}

export type MouseOutcome =
  | 'given'
  | 'already'
  | 'nobody-watching'
  | 'cannot-host'

interface Fetcher {
  (
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string }
  ): Promise<{ ok: boolean; status: number; text: () => Promise<string> }>
}

async function call(
  fetcher: Fetcher,
  url: string,
  bearer: string,
  method = 'GET',
  body?: unknown
): Promise<unknown> {
  const r = await fetcher(url, {
    method,
    headers: {
      authorization: `Bearer ${bearer}`,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`neko ${r.status}: ${text.slice(0, 160)}`)
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}

export async function handMouseToPerson(
  pod: { endpoint: string; adminToken: string },
  fetcher: Fetcher = fetch as unknown as Fetcher
): Promise<{ outcome: MouseOutcome; fixedSettings: boolean }> {
  const base = `http://${pod.endpoint}`
  const bearer = await nekoLogin(pod.endpoint, pod.adminToken, fetcher)
  const settings = ((await call(
    fetcher,
    `${base}/api/room/settings`,
    bearer
  )) ?? {}) as RoomSettings
  const fix = settingsToFix(settings)
  if (fix) await call(fetcher, `${base}/api/room/settings`, bearer, 'POST', fix)

  const sessions = ((await call(fetcher, `${base}/api/sessions`, bearer)) ??
    []) as NekoSession[]
  const person = pickPersonSession(Array.isArray(sessions) ? sessions : [])
  if (!person) return { outcome: 'nobody-watching', fixedSettings: !!fix }
  if (person.profile?.can_host === false)
    return { outcome: 'cannot-host', fixedSettings: !!fix }

  const control = ((await call(fetcher, `${base}/api/room/control`, bearer)) ??
    {}) as { has_host?: boolean; host_id?: string }
  if (control.has_host && control.host_id === person.id)
    return { outcome: 'already', fixedSettings: !!fix }
  await call(
    fetcher,
    `${base}/api/room/control/give/${encodeURIComponent(person.id)}`,
    bearer,
    'POST'
  )
  return { outcome: 'given', fixedSettings: !!fix }
}
