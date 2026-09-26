/**
 * THE PRESS, SENT WHERE THE SOCKET CANNOT REACH.
 *
 * `stopOwnerRun` ends the sweep this process is running, and the aborted
 * fetch ends the render turn the person is waiting on. Between them they
 * cover every turn somebody is WATCHING -- and no others.
 *
 * The turns nobody watches are the expensive ones: the duet writes into a
 * chat of its own, an a2a call leaves its run behind it. Neither has a socket
 * to close, so neither ever saw the press. This asks the render to write the
 * stop down instead; running turns read it at their step boundary.
 *
 * Never throws. The press already did something locally, and a render that
 * did not answer must not turn a working button into an error.
 */
const BASE = 'https://vibee-render-production.up.railway.app'

export async function requestRemoteStop(
  owner: string,
  opts: { base?: string; key?: string; fetchImpl?: typeof fetch } = {}
): Promise<'written' | 'not written'> {
  const key = opts.key ?? process.env.RENDER_API_KEY ?? ''
  const id = String(owner ?? '').trim()
  if (!key || !id) return 'not written'
  const send = opts.fetchImpl ?? fetch
  try {
    const r = await send(
      `${opts.base ?? BASE}/api/agent/stop?telegram_id=${encodeURIComponent(id)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
      }
    )
    return r.ok ? 'written' : 'not written'
  } catch {
    return 'not written'
  }
}
