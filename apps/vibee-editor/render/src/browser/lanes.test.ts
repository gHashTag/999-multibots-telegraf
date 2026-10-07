import { describe, it, expect, beforeEach } from 'vitest'
import {
  CHOICE_TTL_MS,
  chosenFront,
  chosenFrontIds,
  chosenFrontsOf,
  chosenLaneFront,
  forgetFront,
  rememberFront,
  rememberLaneFront,
} from './front-page'
import {
  MAIN_LANE,
  claimLane,
  lanesOf,
  openInLane,
  pickLaneFront,
  readLane,
  resetLanesForTests,
} from './lanes'
import { MAX_WINDOWS, type DeskWindowDeps } from './windows'
import { openAndChoose } from './agent-tools'

const WHO = '900000001'
const OTHER = '900000002'

beforeEach(() => {
  resetLanesForTests()
  forgetFront(WHO)
  forgetFront(OTHER)
})

describe('the lane a chat names', () => {
  it('no lane at all is the main lane, and so is "main" said out loud', () => {
    expect(readLane(undefined)).toEqual({ ok: true, lane: MAIN_LANE })
    expect(readLane('main')).toEqual({ ok: true, lane: 'main' })
  })

  it('takes short lowercase names of letters, digits and dashes', () => {
    for (const ok of ['a', '0', 'research', 'x-2', 'a'.repeat(24), '9-lives'])
      expect(readLane(ok), ok).toEqual({ ok: true, lane: ok })
  })

  it('refuses anything else rather than guessing at it', () => {
    for (const bad of [
      null,
      '',
      7,
      true,
      ['a'],
      { lane: 'a' },
      'Research',
      '-x',
      'x_y',
      'a b',
      '../x',
      'a'.repeat(25),
      'лента', // cyrillic-ok: a lane name that must be refused
    ]) {
      const read = readLane(bad)
      expect(read.ok, JSON.stringify(bad)).toBe(false)
      if (!read.ok) expect(read.error).toContain('^[a-z0-9][a-z0-9-]{0,23}$')
    }
  })
})

describe('each lane acts in the tab it chose', () => {
  it('a lane choosing a tab does not move main, nor main the lane', () => {
    rememberFront(WHO, 'main-tab', 1)
    rememberLaneFront(WHO, 'research', 'research-tab', 1)
    expect(chosenFront(WHO, 2)).toBe('main-tab')
    expect(chosenLaneFront(WHO, 'research', 2)).toBe('research-tab')
    expect(chosenLaneFront(WHO, 'other', 2)).toBeNull()
    rememberFront(WHO, 'main-again', 3)
    expect(chosenLaneFront(WHO, 'research', 4)).toBe('research-tab')
  })

  it('main is exactly the old choice: forgetting main leaves the lanes alone', () => {
    rememberFront(WHO, 'main-tab', 1)
    rememberLaneFront(WHO, 'research', 'research-tab', 1)
    expect(chosenLaneFront(WHO, MAIN_LANE, 2)).toBe('main-tab')
    forgetFront(WHO)
    expect(chosenFront(WHO, 2)).toBeNull()
    expect(chosenLaneFront(WHO, 'research', 2)).toBe('research-tab')
  })

  it('a closed tab is nobody s choice, whichever lane made it', () => {
    rememberFront(WHO, 'shared', 1)
    rememberLaneFront(WHO, 'research', 'shared', 1)
    rememberLaneFront(WHO, 'writing', 'kept', 1)
    forgetFront(WHO, 'shared')
    expect(chosenFront(WHO, 2)).toBeNull()
    expect(chosenLaneFront(WHO, 'research', 2)).toBeNull()
    expect(chosenLaneFront(WHO, 'writing', 2)).toBe('kept')
  })

  it('every lane s tab is spared by the sweeps, and only that person s', () => {
    const now = Date.now()
    rememberFront(WHO, 'main-tab', now)
    rememberLaneFront(WHO, 'research', 'research-tab', now)
    rememberLaneFront(OTHER, 'research', 'not-mine', now)
    expect(chosenFrontsOf(WHO, now).sort()).toEqual([
      'main-tab',
      'research-tab',
    ])
    expect(chosenFrontIds(now)).toEqual(
      expect.arrayContaining(['main-tab', 'research-tab', 'not-mine'])
    )
  })

  it('a lane never falls back to somebody else s page', () => {
    const tabs = [
      { id: 'main-tab', type: 'page', url: 'https://a.test' },
      { id: 'lane-tab', type: 'page', url: 'https://b.test' },
    ]
    expect(pickLaneFront(tabs, 'lane-tab')).toBe('lane-tab')
    /* Main would take the first page here; a lane takes nothing. */
    expect(pickLaneFront(tabs, null)).toBeNull()
    expect(pickLaneFront(tabs, 'closed-tab')).toBeNull()
    /* A list that did not answer is no proof the tab is gone. */
    expect(pickLaneFront(null, 'lane-tab')).toBe('lane-tab')
    expect(pickLaneFront(null, null)).toBeNull()
  })

  it('the default lane opens as it always did: a tab, chosen for main', async () => {
    rememberLaneFront(WHO, 'research', 'research-tab')
    const page = await openAndChoose(
      WHO,
      'pod:9222',
      'https://linkedin.com',
      async (_cdp, url) => ({ id: 'the-new-tab', url })
    )
    expect(page.id).toBe('the-new-tab')
    expect(chosenFront(WHO)).toBe('the-new-tab')
    expect(chosenLaneFront(WHO, 'research')).toBe('research-tab')
  })
})

describe('how many lanes one browser holds', () => {
  it('main and two more: the cap is the windows cap, main included', () => {
    expect(MAX_WINDOWS).toBe(3)
    expect(claimLane(WHO, 'a', 1)).toEqual({ ok: true })
    expect(claimLane(WHO, 'b', 1)).toEqual({ ok: true })
    const refused = claimLane(WHO, 'c', 1)
    expect(refused.ok).toBe(false)
    if (!refused.ok) {
      /* Honest: it names the lanes that hold the windows, and when one frees. */
      expect(refused.error).toContain('main, a, b')
      expect(refused.error).toContain('30 minutes')
    }
    expect(lanesOf(WHO, 1)).toEqual(['a', 'b'])
  })

  it('a lane already held is kept, and main is never refused', () => {
    claimLane(WHO, 'a', 1)
    claimLane(WHO, 'b', 1)
    expect(claimLane(WHO, 'a', 2)).toEqual({ ok: true })
    expect(claimLane(WHO, MAIN_LANE, 2)).toEqual({ ok: true })
    expect(lanesOf(WHO, 2)).toEqual(['a', 'b'])
  })

  it('one person s lanes do not count against another s', () => {
    claimLane(WHO, 'a', 1)
    claimLane(WHO, 'b', 1)
    expect(claimLane(OTHER, 'c', 1)).toEqual({ ok: true })
  })

  it('a lane idle past the choice TTL is let go, and its choice with it', () => {
    claimLane(WHO, 'a', 1)
    rememberLaneFront(WHO, 'a', 'a-tab', 1)
    claimLane(WHO, 'b', 1)
    /* b keeps working; a goes quiet. */
    claimLane(WHO, 'b', CHOICE_TTL_MS)
    const later = 1 + CHOICE_TTL_MS + 1
    expect(claimLane(WHO, 'c', later)).toEqual({ ok: true })
    expect(lanesOf(WHO, later)).toEqual(['b', 'c'])
    expect(chosenLaneFront(WHO, 'a', later)).toBeNull()
  })

  it('a lane in use keeps its chosen tab past the half hour', () => {
    claimLane(WHO, 'a', 0)
    rememberLaneFront(WHO, 'a', 'a-tab', 0)
    claimLane(WHO, 'a', CHOICE_TTL_MS - 1)
    expect(chosenLaneFront(WHO, 'a', CHOICE_TTL_MS + 10)).toBe('a-tab')
  })
})

/** A lane's window with every browser call written down instead of made. */
function spyDeps(over: Partial<DeskWindowDeps> = {}) {
  const said: string[] = []
  let opened = 0
  const depsFor = (endpoint: string): DeskWindowDeps => ({
    open: async url => {
      said.push(`open ${endpoint} ${url}`)
      return `win-${++opened}`
    },
    tile: async id => void said.push(`tile ${id}`),
    goTo: async (id, url) => void said.push(`goTo ${id} ${url}`),
    alive: async () => true,
    close: async id => void said.push(`close ${id}`),
    wait: async () => void said.push('wait'),
    ...over,
  })
  return { depsFor, said }
}

describe("a lane's own window", () => {
  it('the first open opens a window, the next ones walk it, and the lane acts there', async () => {
    const { depsFor, said } = spyDeps()
    rememberFront(WHO, 'main-tab')
    const one = await openInLane(
      WHO,
      'r',
      'pod:9222',
      'https://a.test',
      depsFor
    )
    const two = await openInLane(
      WHO,
      'r',
      'pod:9222',
      'https://b.test',
      depsFor
    )
    expect(one).toEqual({ id: 'win-1', url: 'https://a.test' })
    expect(two).toEqual({ id: 'win-1', url: 'https://b.test' })
    expect(said).toEqual([
      'open pod:9222 https://a.test',
      'tile win-1',
      'goTo win-1 https://b.test',
    ])
    expect(chosenLaneFront(WHO, 'r')).toBe('win-1')
    /* Main's hands did not move. */
    expect(chosenFront(WHO)).toBe('main-tab')
  })

  it('two lanes get two windows, not one shared', async () => {
    const { depsFor, said } = spyDeps()
    await openInLane(WHO, 'r', 'pod:9222', 'https://a.test', depsFor)
    await openInLane(WHO, 'w', 'pod:9222', 'https://b.test', depsFor)
    expect(said.filter(s => s.startsWith('open'))).toHaveLength(2)
    expect(chosenLaneFront(WHO, 'r')).toBe('win-1')
    expect(chosenLaneFront(WHO, 'w')).toBe('win-2')
  })

  it('opens again when a restart took the window, or the browser moved', async () => {
    let alive = true
    const { depsFor, said } = spyDeps({ alive: async () => alive })
    await openInLane(WHO, 'r', 'pod:9222', 'https://a.test', depsFor)
    alive = false
    expect(
      (await openInLane(WHO, 'r', 'pod:9222', 'https://b.test', depsFor)).id
    ).toBe('win-2')
    alive = true
    expect(
      (await openInLane(WHO, 'r', 'pod:9333', 'https://c.test', depsFor)).id
    ).toBe('win-3')
    expect(said.filter(s => s.startsWith('open'))).toEqual([
      'open pod:9222 https://a.test',
      'open pod:9222 https://b.test',
      'open pod:9333 https://c.test',
    ])
  })

  it('a lane past the cap opens nothing', async () => {
    const { depsFor, said } = spyDeps()
    claimLane(WHO, 'a')
    claimLane(WHO, 'b')
    await expect(
      openInLane(WHO, 'c', 'pod:9222', 'https://a.test', depsFor)
    ).rejects.toThrow(/already has 3 lanes/)
    expect(said).toEqual([])
  })

  it('main opens tabs, never a lane window', async () => {
    const { depsFor, said } = spyDeps()
    await expect(
      openInLane(WHO, MAIN_LANE, 'pod:9222', 'https://a.test', depsFor)
    ).rejects.toThrow(/main lane opens tabs/)
    expect(said).toEqual([])
  })

  it('an idle lane gives its window back', async () => {
    const { depsFor, said } = spyDeps()
    await openInLane(WHO, 'r', 'pod:9222', 'https://a.test', depsFor, 0)
    expect(lanesOf(WHO, CHOICE_TTL_MS + 1)).toEqual([])
    await new Promise(r => setTimeout(r, 0))
    expect(said).toContain('close win-1')
  })
})
