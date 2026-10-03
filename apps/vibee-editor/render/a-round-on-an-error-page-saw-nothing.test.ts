import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A ROUND THAT LANDED ON CHROMIUM'S ERROR PAGE SAW NOTHING.
 *
 * Found 2026-10-03 following the bee's note on #3488: with no block on the
 * person's list, the round's look read `chrome-error://chromewebdata/` as a
 * page, counted the site as seen and sent "This site can't be reached" to
 * the person as its news. The real runRoundNow walks one site here, every
 * browser road stubbed; the look must fail, so the site is "not opened".
 */
const sent = vi.fn()
const restarted = vi.fn()
vi.mock('./src/auth/telegram-sender', () => ({
  sendToTelegram: async (...a: unknown[]) => void sent(...a),
}))
vi.mock('./src/browser/routes', () => ({
  startBrowserAsAgent: vi.fn(),
  /* It did not come back: the round then says so, once. */
  restartBrowserAsAgent: async (...a: unknown[]) => (restarted(...a), false),
}))
vi.mock('./src/browser/sessions', () => ({
  readSession: async () => ({ state: 'live', cdpEndpoint: 'http://pod:9222' }),
  personHasTheWheel: () => false,
}))
vi.mock('./src/browser/logins', () => ({ loginsOfPerson: async () => null }))
vi.mock('./src/browser/health', () => ({
  waitForBrowser: async () => true,
  cdpHealthIo: async () => ({}),
}))
vi.mock('./src/browser/windows', async importOriginal => ({
  ...(await importOriginal<typeof import('./src/browser/windows')>()),
  openWindow: async () => 'W',
  tileWindow: async () => undefined,
  goTo: async () => undefined,
  closeWindow: async () => undefined,
}))
const landed = { url: 'chrome-error://chromewebdata/' }
vi.mock('./src/browser/cdp', async importOriginal => ({
  ...(await importOriginal<typeof import('./src/browser/cdp')>()),
  pageUrl: async () => landed.url,
  evaluateOn: async () => ({
    title: 'dead.example',
    text: 'This site can’t be reached. dead.example took too long to respond.',
  }),
}))

const { runRoundNow } = await import('./src/agent/rounds-wiring')
const { resetSiteRulesCache } = await import('./src/browser/site-rules')

/* One site, the shortest settle: a strategy row, as the owner would write it. */
const pool = {
  async query(sql: string) {
    if (sql.includes('FROM agent_strategies'))
      return {
        rows: [
          {
            value: {
              sites: [{ name: 'Dead', url: 'https://dead.example/' }],
              settleMs: 1000,
            },
          },
        ],
      }
    return { rows: [] }
  },
}

beforeEach(() => {
  sent.mockReset()
  restarted.mockReset()
  resetSiteRulesCache()
})

describe('a round on an error page', () => {
  it('is a site not opened, and the error text is never the news', async () => {
    landed.url = 'chrome-error://chromewebdata/'
    const out = await runRoundNow(pool, '144')
    expect(JSON.parse(out)).toEqual([expect.objectContaining({ ok: false })])
    /* One site is not "the whole browser blank" (rounds.ts): no restart. */
    expect(restarted).not.toHaveBeenCalled()
    expect(sent).toHaveBeenCalledTimes(1)
    expect(String(sent.mock.calls[0][1])).not.toMatch(/reached|too long/)
  })

  it('the same page on a real address is seen (the stubs are not blind)', async () => {
    landed.url = 'https://dead.example/'
    const out = await runRoundNow(pool, '144')
    expect(JSON.parse(out)).toEqual([expect.objectContaining({ ok: true })])
    expect(String(sent.mock.calls[0][1])).toMatch(/reached/)
  })
})
