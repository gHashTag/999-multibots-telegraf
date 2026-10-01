/**
 * EVERY POINT ON THE WELCOME SCREEN IS TRUE OF THE CATALOGUE IT RESTS ON.
 *
 * The three points used to say "each agent answers from a Telegram bot of
 * its own" and promise "your clone" to everybody. The one live agent has no
 * bot (agent-marketplace.ts), and the clone starts at the Blogger package.
 * Rewritten as claims about what an ORDERED agent gets; this file keeps them
 * that way: change the catalogue and the sentence that relied on it fails.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AGENT_PACKAGES,
  type AgentPackage,
} from '../../../packages/vibee-atoms/src/agent-packages'
import { MARKETPLACE_AGENTS } from '../../../packages/vibee-atoms/src/agent-marketplace'
import { checkedDay } from '@/hooks/useAgentAcceptance'

const ui = vi.hoisted(() => ({
  lang: 'en' as 'en' | 'ru',
  credential: true,
  verdicts: null as Record<
    string,
    {
      agent: string
      pass: boolean
      at: string
      tools: string[]
      codes: string[]
      streak?: number
      fresh?: boolean
    }
  > | null,
}))

vi.mock('@/hooks/useAgentAvatars', () => ({ useAgentAvatars: () => ({}) }))
vi.mock('@/hooks/useAgentAcceptance', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/useAgentAcceptance')>()),
  useAgentAcceptance: () => ui.verdicts,
}))
vi.mock('@/lib/embedGuest', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/embedGuest')>()),
  hasCredential: () => ui.credential,
}))
vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    lang: ui.lang,
    setLang: () => {},
    t: (k: string) => k,
  }),
}))

import { WelcomePage } from '@/pages/Welcome'
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

/** A package's includes with every "everything in X" expanded. */
function allIncludes(pkg: AgentPackage, seen = new Set<string>()): string[] {
  if (seen.has(pkg.id)) return []
  seen.add(pkg.id)
  return pkg.includes.flatMap(item => {
    const parent = /^everything in (.+)$/.exec(item.en)?.[1]
    const from = parent && AGENT_PACKAGES.find(p => p.name.en === parent)
    return from ? allIncludes(from, seen) : [item.en]
  })
}

let host: HTMLDivElement
let root: Root | null = null

function points(lang: 'en' | 'ru'): string[] {
  ui.lang = lang
  act(() => {
    root = createRoot(host)
    root.render(
      <MemoryRouter>
        <WelcomePage />
      </MemoryRouter>
    )
  })
  return [...host.querySelectorAll('.welcome-points li')].map(
    li => li.textContent ?? ''
  )
}

beforeEach(() => {
  ui.verdicts = null
  window.localStorage.clear()
  host = document.createElement('div')
  document.body.appendChild(host)
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  host.remove()
})

describe('"Its own bot"', () => {
  it('every package, expanded, includes a separate bot', () => {
    for (const pkg of AGENT_PACKAGES) {
      expect(
        allIncludes(pkg).some(i => /separate bot/.test(i)),
        pkg.id
      ).toBe(true)
    }
  })

  it('is said of an ordered agent, not of every agent', () => {
    // No live market agent carries a bot yet, so "each agent answers from
    // its own bot" would be false today.
    expect(points('en')[0]).toMatch(/order/i)
  })

  it('and the same in Russian', () => {
    expect(points('ru')[0]).toMatch(/заказанный/) // cyrillic-ok
  })
})

describe('"Your face and voice"', () => {
  const cloned = AGENT_PACKAGES.filter(pkg =>
    allIncludes(pkg).some(i => /clone/.test(i))
  )

  it('not every package has the clone, so the point must say which', () => {
    expect(cloned.length).toBeGreaterThan(0)
    expect(cloned.length).toBeLessThan(AGENT_PACKAGES.length)
  })

  it('names the first package that has it', () => {
    const first = AGENT_PACKAGES.find(pkg => cloned.includes(pkg))!
    expect(points('en')[1]).toContain(first.name.en)
  })
})

describe('"Work with receipts"', () => {
  it('every live agent lists what proves its work, receipts among it', () => {
    const live = MARKETPLACE_AGENTS.filter(a => a.status === 'live')
    expect(live.length).toBeGreaterThan(0)
    for (const agent of live) {
      expect(
        agent.evidence.some(e => /receipt/.test(e.en)),
        agent.id
      ).toBe(true)
    }
  })

  // The point says "the card below" -- so the welcome card itself has to
  // carry the proof, not only the market page behind it.
  it('the welcome card of every live agent shows its proof, in EN', () => {
    points('en')
    const live = MARKETPLACE_AGENTS.filter(a => a.status === 'live')
    const cards = [...host.querySelectorAll('.welcome-agent-card')]
    expect(cards).toHaveLength(live.length)
    live.forEach((agent, i) => {
      const shown = [...cards[i].querySelectorAll('.welcome-agent__proof li')]
      expect(shown.map(li => li.textContent)).toEqual(
        agent.evidence.map(e => e.en)
      )
    })
  })

  it('and in Russian', () => {
    points('ru')
    const live = MARKETPLACE_AGENTS.filter(a => a.status === 'live')
    const card = host.querySelector('.welcome-agent-card')!
    const shown = [...card.querySelectorAll('.welcome-agent__proof li')].map(
      li => li.textContent
    )
    expect(shown).toEqual(live[0].evidence.map(e => e.ru))
  })

  it('keeps the proof out of the link, so its name stays short', () => {
    points('en')
    const link = host.querySelector('.welcome-agent')!
    expect(link.querySelector('.welcome-agent__proof')).toBeNull()
    const list = host.querySelector('.welcome-agent__proof ul')!
    const heading = document.getElementById(
      list.getAttribute('aria-labelledby')!
    )
    expect(heading?.textContent).toBe('What proves the job')
  })
})

// "Receipts" should not rest on the promise list alone: the same newest
// daily acceptance verdict the market card shows stands on top of it.
describe('the last daily check on the welcome card', () => {
  const at = '2026-09-30T15:22:07.000Z'
  const checked = () =>
    host.querySelector('.welcome-agent-card .welcome-agent__checked')

  it('says it passed, with the day', () => {
    ui.verdicts = {
      blogger: { agent: 'blogger', pass: true, at, tools: [], codes: [] },
    }
    points('en')
    // The day comes from the shared formatter: ICU spells it "Sep" or "Sept".
    expect(checked()?.textContent).toBe(
      `✓ Checked on a real account · ${checkedDay(at, 'en')}`
    )
    expect(checked()?.getAttribute('data-pass')).toBe('yes')
  })

  it('says it failed, rather than keep quiet about it', () => {
    ui.verdicts = {
      blogger: { agent: 'blogger', pass: false, at, tools: [], codes: ['X'] },
    }
    const failed = /^✗ Последняя проверка не прошла · 30/ // cyrillic-ok
    points('ru')
    expect(checked()?.textContent).toMatch(failed)
    expect(checked()?.getAttribute('data-pass')).toBe('no')
  })

  it('adds the run of passing days when there is one', () => {
    ui.verdicts = {
      blogger: {
        agent: 'blogger',
        pass: true,
        at,
        tools: [],
        codes: [],
        streak: 7,
        fresh: true,
      },
    }
    points('en')
    expect(checked()?.textContent).toMatch(/· 7 days running$/)
  })

  // Directories that re-check listings drop the badge once checks stop;
  // a pass from a fortnight ago must not look as green as yesterday's.
  it('a check that is no longer current loses its tick, keeps its day', () => {
    ui.verdicts = {
      blogger: {
        agent: 'blogger',
        pass: true,
        at,
        tools: [],
        codes: [],
        streak: 0,
        fresh: false,
      },
    }
    points('en')
    expect(checked()?.textContent).toBe(
      `○ Last check · ${checkedDay(at, 'en')} · none since`
    )
    expect(checked()?.getAttribute('data-tone')).toBe('stale')
    expect(checked()?.textContent).not.toMatch(/✓|Checked on/)
  })

  it('shows nothing when the server has not answered', () => {
    points('en')
    expect(checked()).toBeNull()
    expect(host.textContent).not.toMatch(/not checked|never checked/i)
  })
})

// The working card's only action used to open the operator dashboard; the
// way to talk to the agent waited two sections down on a package card.
describe('talking to a live agent from its welcome card', () => {
  const RU_TALK = /^Написать агенту: .+, бесплатно$/ // cyrillic-ok

  beforeEach(() => {
    ui.credential = true
  })

  function talk(): HTMLAnchorElement | null {
    return host.querySelector('.welcome-agent-card .welcome-agent__talk')
  }

  it('is one tap away, and opens the agent at work, not its dashboard', () => {
    points('en')
    const live = MARKETPLACE_AGENTS.filter(a => a.status === 'live')
    const links = host.querySelectorAll('.welcome-agent__talk')
    expect(links).toHaveLength(live.length)
    expect(talk()?.getAttribute('href')).toBe(`/agents/${live[0].id}/work`)
    expect(talk()?.getAttribute('aria-label')).toMatch(
      /^Talk to the agent: .+, free$/
    )
    expect(talk()?.textContent).toMatch(/^Talk to the agent/)
  })

  it('says what it costs, in the words of the package cards', () => {
    points('en')
    const note = talk()?.nextElementSibling?.textContent
    expect(note).toBe('Free: chatting costs nothing')
    const onPackage = host.querySelector('.package-card__try-note')
    if (onPackage) expect(onPackage.textContent).toBe(note)
  })

  it('warns about the Telegram sign-in before the press, not after', () => {
    ui.credential = false
    points('en')
    expect(talk()?.nextElementSibling?.textContent).toBe(
      'Free, with a Telegram sign-in'
    )
  })

  it('and in Russian', () => {
    points('ru')
    expect(talk()?.getAttribute('aria-label')).toMatch(RU_TALK)
  })

  it('the dashboard link no longer claims to "open" the agent', () => {
    points('en')
    expect(host.querySelector('.welcome-agent__open')?.textContent).toMatch(
      /^Details/
    )
  })
})

// "Checked" is a claim; the calls the check made are its receipt. Folded by
// default, so the card stays as short as it was.
describe('what the last check called, on the welcome card', () => {
  const at = '2026-09-30T15:22:07.000Z'
  const RU_SUMMARY = /^Что вызвала проверка \(3\)$/ // cyrillic-ok

  function calls(): HTMLDetailsElement | null {
    return host.querySelector('.welcome-agent-card .welcome-agent__calls')
  }

  function verdictWith(tools: string[]) {
    ui.verdicts = {
      blogger: {
        agent: 'blogger',
        pass: true,
        at,
        tools,
        codes: [],
        streak: 7,
        fresh: true,
      },
    }
  }

  it('lists each call in words, with how many times, folded', () => {
    verdictWith(['hive_pulse', 'web_read', 'web_read'])
    points('en')
    expect(calls()?.open).toBe(false)
    expect(calls()?.querySelector('summary')?.textContent).toBe(
      'What the check called (3)'
    )
    expect(
      [...(calls()?.querySelectorAll('li') ?? [])].map(li => li.textContent)
    ).toEqual([
      "Read the project's pulse for the last day",
      'Read a web page ×2',
    ])
  })

  it('and in Russian', () => {
    verdictWith(['hive_pulse', 'web_read', 'web_read'])
    points('ru')
    expect(calls()?.querySelector('summary')?.textContent).toMatch(RU_SUMMARY)
  })

  it('says nothing when the check recorded no calls', () => {
    verdictWith([])
    points('en')
    expect(calls()).toBeNull()
  })
})

// "Last check failed" alone is as much a matter of trust as "checked".
describe('why the last check failed, on the welcome card', () => {
  const at = '2026-09-30T15:22:07.000Z'
  const RU_WHY = /^Почему не прошла$/ // cyrillic-ok

  function receipt(): HTMLDetailsElement | null {
    return host.querySelector('.welcome-agent-card .welcome-agent__calls')
  }

  function failedWith(codes: string[], tools: string[]) {
    ui.verdicts = {
      blogger: { agent: 'blogger', pass: false, at, tools, codes, fresh: true },
    }
  }

  it('leads with the reasons, then what it did call', () => {
    failedWith(['error', 'expected_tool_missing'], ['web_read'])
    points('en')
    expect(receipt()?.getAttribute('data-tone')).toBe('fail')
    expect(receipt()?.querySelector('summary')?.textContent).toBe(
      'Why it failed'
    )
    expect(
      [
        ...(receipt()?.querySelectorAll('.checked-tools__reasons li') ?? []),
      ].map(li => li.textContent)
    ).toEqual([
      'The run broke off with an error',
      'It did not use the tool the task needs',
    ])
    expect(
      receipt()?.querySelector('.checked-tools__calls li')?.textContent
    ).toBe('Read a web page')
  })

  it('a failure with no calls still says why', () => {
    failedWith(['no_answer'], [])
    points('en')
    expect(receipt()?.querySelector('.checked-tools__calls')).toBeNull()
    expect(receipt()?.textContent).toMatch(/The agent gave no answer/)
  })

  it('and in Russian', () => {
    failedWith(['no_answer'], [])
    points('ru')
    expect(receipt()?.querySelector('summary')?.textContent).toMatch(RU_WHY)
  })
})
