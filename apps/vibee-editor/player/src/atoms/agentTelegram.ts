import { atom } from 'jotai'
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'

/**
 * IS THIS PERSON'S OWN TELEGRAM CONNECTED TO THE AGENT?
 *
 * `null`  — nobody asked the server yet;
 * `false` — asked, no session (or the server could not be reached: offering to
 *           connect is the safe answer, claiming "connected" is not);
 * `true`  — an MTProto session for this telegram_id exists on the render server.
 *
 * One atom, because two screens act on the same fact: the profile page keeps
 * its content behind the connect screen until it is true (owner, 2026-09-09:
 * "you cannot enter the profile until you have signed in by phone — the agent
 * does not work without it"), and the connect screen itself flips it when the
 * person finishes or disconnects. Two local copies of that fact would disagree
 * for exactly the second that matters.
 */
export const agentTelegramConnectedAtom = atom<boolean | null>(null)

export const loadAgentTelegramStatusAtom = atom(null, async (_get, set) => {
  try {
    const r = await fetch(`${API_BASE}/api/tg/connect/status`, {
      headers: authHeaders(),
    })
    const d = await r.json().catch(() => ({}))
    set(agentTelegramConnectedAtom, r.ok && d?.['подключено'] === true)
  } catch {
    set(agentTelegramConnectedAtom, false)
  }
})
