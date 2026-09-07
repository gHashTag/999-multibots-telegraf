import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  HIVE_TABS,
  isHiveTab,
  clean,
  loadBoard,
  loadFactory,
  loadMission,
  loadSpecs,
  loadTree,
} from './hive'
import { PRIMARY_NAV_ITEMS } from './primaryNavigation'

/**
 * THE HIVE TAB -- THE TWO THINGS THAT CAN GO WRONG QUIETLY.
 *
 * FIRST, SILENCE REPORTED AS ZERO. Every loader returns `reachable`. If an
 * unreachable Queen produced `{bees: 0, cards: []}` instead, a dead service
 * would render as a quiet week -- the single worst failure a status screen has.
 *
 * SECOND, KEY MATERIAL ON A DASHBOARD. `/queen/public-hardware` returns
 * publicKey, canonical and signature. Only the FACT of a signature belongs on a
 * screen people screenshot.
 */

/*
 * `fetch` IS RESTORED BY HAND, NOT ONLY BY `vi.unstubAllGlobals()`.
 *
 * Measured 2026-09-07: with only `unstubAllGlobals` this file made
 * `uploadCarriesIdentity.test.ts` fail about two runs in three, while both
 * passed on their own. Excluding this one file made the suite green four times
 * out of four -- so the leak was here, not there.
 *
 * A flaky neighbour is worse than a failing test: it teaches people to re-run
 * the suite until it is green, and after that a real regression is re-run away
 * too.
 */
const realFetch = globalThis.fetch

afterEach(() => {
  vi.unstubAllGlobals()
  globalThis.fetch = realFetch
})

/** Answers one URL, refuses everything else loudly rather than returning {}. */
function serve(map: Record<string, unknown>) {
  vi.stubGlobal('fetch', async (url: string) => {
    const hit = Object.keys(map).find(k => String(url).includes(k))
    if (!hit) throw new Error(`unexpected fetch: ${url}`)
    return { ok: true, json: async () => map[hit] } as any
  })
}

function refuseAll() {
  vi.stubGlobal('fetch', async () => {
    throw new Error('connect ECONNREFUSED')
  })
}

describe('an unreachable Queen is never reported as an empty one', () => {
  const loaders = {
    factory: loadFactory,
    board: loadBoard,
    tree: loadTree,
    mission: loadMission,
    specs: loadSpecs,
  }

  for (const [name, load] of Object.entries(loaders)) {
    it(`${name}: reachable is false and there is no data to misread`, async () => {
      refuseAll()
      const r = await load()
      expect(r.reachable).toBe(false)
      expect(r.data).toBeUndefined()
      expect(r.why).toBeTruthy()
    })
  }
})

describe('the factory panel', () => {
  it('shows that the foundry is signed, and never the key material', async () => {
    serve({
      '/queen/status': {
        swarmState: 'waiting_for_review',
        workers: { capacity: 4, active: 1, idle: 3 },
        scheduler: { intervalSeconds: 300 },
        lastTick: { decidedAt: '2026-09-07T07:56:17.771Z', skippedCount: 198 },
      },
      '/queen/public-hardware': {
        algorithm: 'ed25519',
        keyId: 'queen-foundry-01',
        // Distinctive values on purpose. The first version used `signature:
        // 'sig'`, and the assertion failed on the word "signed" in the
        // serialised output -- a substring check needs values that cannot
        // appear by accident, or it reports a leak that is not there.
        publicKey: 'PUBKEYMATERIAL0000',
        canonical: 'CANONICALSTRING0000',
        signature: 'SIGNATUREBYTES0000',
      },
    })
    const r = await loadFactory()
    expect(r.reachable).toBe(true)
    expect(r.data!.bees).toEqual({ capacity: 4, active: 1, idle: 3 })
    expect(r.data!.signed).toEqual({
      algorithm: 'ed25519',
      keyId: 'queen-foundry-01',
    })
    // The whole point: nothing that looks like a secret reaches the screen.
    const rendered = JSON.stringify(r.data)
    expect(rendered).not.toContain('PUBKEYMATERIAL0000')
    expect(rendered).not.toContain('CANONICALSTRING0000')
    expect(rendered).not.toContain('SIGNATUREBYTES0000')
  })

  it('a silent foundry does not take the whole panel down with it', async () => {
    /*
     * Two calls, two fates. The swarm status is what the panel is FOR; the
     * signature is a detail. If a missing detail blanked the panel, one flaky
     * endpoint would hide the four numbers people actually came to see.
     */
    vi.stubGlobal('fetch', async (url: string) => {
      if (String(url).includes('/queen/status'))
        return {
          ok: true,
          json: async () => ({ workers: { capacity: 4, active: 0, idle: 4 } }),
        } as any
      throw new Error('foundry down')
    })
    const r = await loadFactory()
    expect(r.reachable).toBe(true)
    expect(r.data!.signed).toBeNull()
    expect(r.data!.bees.capacity).toBe(4)
  })
})

describe('the board', () => {
  it('takes the columns from HER, so a new column cannot vanish', async () => {
    /*
     * Hard-coding the six column names here would mean that the day she adds a
     * seventh, its cards disappear from our board without a word. The columns
     * are hers; we only count into them.
     */
    serve({
      '/queen/public-board': {
        repo: 'gHashTag/trios',
        columns: [
          { key: 'review', title: 'in review', blurb: 'holds its boundary' },
          { key: 'seventh', title: 'a new one', blurb: 'she added it today' },
        ],
        cards: [
          { number: 1, column: 'review', title: 'a' },
          { number: 2, column: 'seventh', title: 'b' },
        ],
      },
    })
    const r = await loadBoard()
    expect(r.data!.columns.map(c => c.key)).toEqual(['review', 'seventh'])
    expect(r.data!.columns.find(c => c.key === 'seventh')!.count).toBe(1)
  })
})

describe('text that came from another system', () => {
  it('newlines are flattened, so one title cannot wreck the layout', () => {
    expect(clean('a\n\nb')).toBe('a b')
  })

  it('long text is trimmed rather than pushing the screen aside', () => {
    expect(clean('x'.repeat(500)).length).toBeLessThanOrEqual(161)
    expect(clean('x'.repeat(500), 40).length).toBeLessThanOrEqual(41)
  })

  it('absent text becomes empty, never the word "undefined"', () => {
    expect(clean(undefined)).toBe('')
    expect(clean(null)).toBe('')
  })
})

describe('the sub-tabs are hers, in her order', () => {
  it('all six, named as her menu names them', () => {
    // comb, specs, kanban, mission map, factory, technology tree -- the order
    // on t27.ai/#/queen. A different order here would mean two vocabularies
    // for one board.
    expect([...HIVE_TABS]).toEqual([
      'comb',
      'specs',
      'kanban',
      'mission',
      'factory',
      'tree',
    ])
  })

  it('an unknown sub-tab is rejected, so a typo redirects instead of blanking', () => {
    expect(isHiveTab('comb')).toBe(true)
    expect(isHiveTab('kombs')).toBe(false)
    expect(isHiveTab(undefined)).toBe(false)
  })

  it('the hive is a top-level tab and lands on the first sub-tab', () => {
    const hive = PRIMARY_NAV_ITEMS.find(t => t.id === 'hive')
    expect(hive, 'the hive tab is missing from the bar').toBeTruthy()
    expect(hive!.route).toBe('/hive/comb')
    // The bare `/hive` must also light the tab up, or the person taps it and
    // the bar shows nothing selected.
    expect(hive!.match.test('/hive')).toBe(true)
    expect(hive!.match.test('/hive/tree')).toBe(true)
  })
})
