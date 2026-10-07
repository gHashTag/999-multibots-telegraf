/**
 * A WATCH SEAT IS GIVEN BACK, ONCE, AND A CAST NOBODY WATCHES IS STOPPED
 * (src/browser/watch-link.ts openWatch).
 *
 * The bee on #3510 found three guards no test pinned, each a way a link
 * locks or leaks:
 * - a LIVE watcher who leaves must free the seat (two leaks lock the link
 *   at 4029 for the life of the process);
 * - a refused watcher must not free the seat twice (the second release is
 *   somebody else's seat, so a third watcher gets in);
 * - a watcher who leaves while the screencast is starting must stop it, or
 *   it runs with no cap and no recheck until the pod restarts.
 *
 * `frames`, `cdp` and `site-rules` are mocked for this whole file, which is
 * why these live apart from the main watch-link suite: that suite drives the
 * real startScreencast.
 */
import { beforeEach, expect, it, vi } from 'vitest'
import {
  createWatchLink,
  enterViewer,
  openWatch,
  resetWatchLinksForTests,
  watchViewerOf,
} from './src/browser/watch-link'

const castCtl = vi.hoisted(() => ({
  stop: [] as Array<ReturnType<typeof vi.fn>>,
  pending: null as null | { resolve: () => void },
  deferred: false,
}))

vi.mock('./src/browser/frames', async orig => ({
  ...((await orig()) as object),
  startScreencast: async () => {
    const stop = vi.fn()
    castCtl.stop.push(stop)
    if (castCtl.deferred)
      return new Promise<() => void>(r => {
        castCtl.pending = { resolve: () => r(stop) }
      })
    return stop
  },
}))
vi.mock('./src/browser/cdp', async orig => ({
  ...((await orig()) as object),
  frontPage: async () => ({ id: 'tab-1' }),
}))
vi.mock('./src/browser/site-rules', async orig => ({
  ...((await orig()) as object),
  siteRulesOf: async () => [],
}))

const ID = '900000001'
const SIZE = { width: 800, height: 600 }

interface Row {
  token_hash: string
  telegram_id: string
  expires_at: string
  revoked_at: string | null
}
let rows: Row[] = []
let sessionState = 'live'

const pool = {
  query: async (text: string, params: unknown[] = []) => {
    const p = params as string[]
    if (text.includes('CREATE TABLE')) return { rows: [] }
    if (text.includes('browser_watch_links')) {
      if (text.includes('count(*)')) return { rows: [{ n: rows.length }] }
      if (text.startsWith('INSERT')) {
        rows.push({
          token_hash: p[0],
          telegram_id: p[1],
          expires_at: p[4],
          revoked_at: null,
        })
        return { rows: [] }
      }
      if (text.includes('SET views')) return { rows: [] }
      if (text.includes('SELECT telegram_id'))
        return {
          rows: rows
            .filter(
              r => r.token_hash === p[0] && !r.revoked_at && r.expires_at > p[1]
            )
            .map(r => ({ telegram_id: r.telegram_id })),
        }
      throw new Error('unexpected watch-link query: ' + text)
    }
    if (text.includes('browser_journal')) return { rows: [] }
    /* Everything else is the session read. */
    return {
      rows: [
        {
          telegram_id: ID,
          session_id: 's1',
          pod_id: 'pod',
          endpoint: '127.0.0.1:1',
          cdp_endpoint: '127.0.0.1:2',
          allowed_ms: null,
          wheel_ms: null,
          state: sessionState,
          view_token: 'v',
          admin_token: 'a',
        },
      ],
    }
  },
}

/** A socket whose close runs its handlers once, as ws does. */
function fakeWs() {
  const fns: Array<() => void> = []
  const ws = {
    readyState: 1,
    bufferedAmount: 0,
    send: vi.fn(),
    close: vi.fn(() => {
      if (ws.readyState === 3) return
      ws.readyState = 3
      for (const f of fns.splice(0)) f()
    }),
    on: (_e: 'close', fn: () => void) => void fns.push(fn),
  }
  return ws
}

beforeEach(() => {
  rows = []
  sessionState = 'live'
  castCtl.stop.length = 0
  castCtl.pending = null
  castCtl.deferred = false
  resetWatchLinksForTests()
})

it('a watcher leaving a LIVE watch frees its seat and stops the cast', async () => {
  const r = await createWatchLink(pool, ID, {})
  if (!r.ok) throw new Error(r.error)
  const ws = fakeWs()
  await openWatch(pool, r.token, watchViewerOf(ws), SIZE)
  ws.close(1001)
  expect(castCtl.stop[0]).toHaveBeenCalled()
  /* Both seats are free again: the one that left gave its seat back. */
  expect([enterViewer(r.id), enterViewer(r.id)]).toEqual([true, true])
})

it("a refused watcher does not free somebody else's seat", async () => {
  const r = await createWatchLink(pool, ID, {})
  if (!r.ok) throw new Error(r.error)
  expect(enterViewer(r.id)).toBe(true) // another watcher, watching
  sessionState = 'stopped'
  const ws = fakeWs()
  await openWatch(pool, r.token, watchViewerOf(ws), SIZE)
  /* One seat is still taken by the other watcher: one more gets in, not two. */
  expect([enterViewer(r.id), enterViewer(r.id)]).toEqual([true, false])
})

it('a watcher who leaves while the cast is starting stops it', async () => {
  const r = await createWatchLink(pool, ID, {})
  if (!r.ok) throw new Error(r.error)
  castCtl.deferred = true
  const ws = fakeWs()
  const done = openWatch(pool, r.token, watchViewerOf(ws), SIZE)
  for (let i = 0; i < 200 && !castCtl.pending; i++)
    await new Promise(res => setTimeout(res, 1))
  expect(castCtl.pending).not.toBeNull()
  ws.close(1001)
  castCtl.pending!.resolve()
  await done
  expect(castCtl.stop[0]).toHaveBeenCalled()
})
