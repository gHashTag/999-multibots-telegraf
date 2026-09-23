import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
  }),
}))

/**
 * THE COCKPIT: WHO IS UNDER WAY, WHAT THE SEARCH NARROWS, AND THE AUTO SWITCH.
 *
 * Owner, 2026-09-23: show at once whom work is being done with, give the
 * clients screen filters, and add a mode where the agent stops asking about
 * every single send.
 *
 * Three properties are worth pinning, and each one is a way the screen could
 * lie: the "under way" list is derived from facts and not from a flag; the
 * search narrows the counts as well as the rows; and the AUTO switch shows
 * what the SERVER says, never an optimistic guess.
 *
 * Fictional ids only (9000000xx).
 */
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const WEEK = 7 * 24 * 60 * 60 * 1000
const iso = (ms: number) => new Date(ms).toISOString()

let autopilot: Record<string, unknown> = {
  on: false,
  minutes_left: 0,
  sent_today: 0,
  left_today: 20,
  cap: 20,
  hours: 8,
}
const calls: Array<{ name: string; args: Record<string, unknown> }> = []

let emptyScore = false
let picks: string[] = []
let failPicks = false
let lastPick: { lead: unknown; on: unknown } | null = null

const answers = (): Record<string, unknown> => ({
  crm_overview: { ['всего_людей']: 3 }, // cyrillic-ok: server key
  crm_waiting: {
    total: 3,
    ours: 2,
    due: 0,
    theirs: 1,
    waiting: [
      {
        telegram_id: '900000211',
        name: 'Waiting One',
        waiting: 'ours',
        days: '2 дня', // cyrillic-ok: server text
        stage: 'talk',
        because: 'ответил, а мы молчим', // cyrillic-ok: server text
      },
      {
        telegram_id: '900000212',
        name: 'Waiting Two',
        waiting: 'ours',
        days: '5 дней', // cyrillic-ok: server text
        stage: 'talk',
        because: 'написал, ответа нет', // cyrillic-ok: server text
      },
      {
        telegram_id: '900000213',
        name: 'They Owe Us',
        waiting: 'theirs',
        days: '1 день', // cyrillic-ok: server text
        stage: 'talk',
        because: 'написали, ответа нет', // cyrillic-ok: server text
      },
    ],
  },
  crm_hot_leads: { ['найдено']: 0, ['люди']: [] }, // cyrillic-ok: server keys
  crm_clients: {
    paid_known: true,
    clients: [
      // Paid: under way whatever else is true.
      {
        telegram_id: '900000201',
        name: 'Paid Person',
        stage: 'client',
        paid: true,
        has_profile: false,
        has_soul: false,
        duets: 0,
        last_seen: iso(Date.now() - 40 * WEEK),
      },
      // A package written for them: under way.
      {
        telegram_id: '900000202',
        name: 'Packaged Person',
        stage: 'talk',
        paid: false,
        has_profile: true,
        has_soul: false,
        duets: 0,
        last_seen: null,
      },
      // Seen long ago, nothing invested: NOT under way.
      {
        telegram_id: '900000203',
        name: 'Cold Person',
        stage: 'new',
        paid: false,
        has_profile: false,
        has_soul: false,
        duets: 0,
        last_seen: iso(Date.now() - 4 * WEEK),
      },
    ],
  },
  autopilot_status: autopilot,
  autopilot_leads: { leads: picks, count: picks.length },
  autopilot_set: autopilot,
  crm_outcomes: {
    days: 7,
    dm_answered: 263,
    auto_sent: 6,
    pressed_sent: 3,
    cancelled: 1,
    cards_drawn: 10,
    quiet: 40,
    failed: 0,
    without_you_percent: 67,
    before: {
      auto_sent: 1,
      pressed_sent: 9,
      left: 10,
      without_you_percent: 10,
    },
  },
})

vi.stubGlobal(
  'fetch',
  vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'))
    const name = String(body?.params?.name ?? '')
    const args = (body?.params?.arguments ?? {}) as Record<string, unknown>
    calls.push({ name, args })
    if (name === 'autopilot_lead') {
      lastPick = { lead: args.lead, on: args.on }
      if (args.on === true) picks = [...picks, String(args.lead)]
      else picks = picks.filter(p => p !== String(args.lead))
    }
    if (name === 'autopilot_set') {
      autopilot = {
        ...autopilot,
        on: args.on === true,
        until: args.on === true ? iso(Date.now() + 3_600_000) : undefined,
        left_today: 19,
      }
    }
    if (name === 'autopilot_leads' && failPicks)
      return new Response('nope', { status: 500 })
    let data = answers()[name] ?? {}
    if (name === 'crm_outcomes' && emptyScore)
      data = {
        days: 7,
        auto_sent: 0,
        pressed_sent: 0,
        cancelled: 0,
        cards_drawn: 0,
        quiet: 0,
        failed: 0,
        without_you_percent: null,
        note: 'nothing yet',
      }
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: { structuredContent: data },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  })
)

let host: HTMLDivElement
let root: Root

const settle = async () => {
  await act(async () => {
    await new Promise(r => setTimeout(r, 0))
  })
}

beforeEach(() => {
  calls.length = 0
  picks = []
  lastPick = null
  failPicks = false
  autopilot = {
    on: false,
    minutes_left: 0,
    sent_today: 0,
    left_today: 20,
    cap: 20,
    hours: 8,
  }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

async function screen() {
  const { default: CrmPage } = await import('./Crm')
  await act(async () => {
    root.render(
      <MemoryRouter>
        <CrmPage />
      </MemoryRouter>
    )
  })
  await settle()
  await settle()
}

const text = () => host.textContent ?? ''
const rowsUnder = (heading: string) => {
  const all = [...host.querySelectorAll('.crm__list')]
  return all
}
const byText = (needle: string) =>
  [...host.querySelectorAll('button')].find(b =>
    (b.textContent ?? '').includes(needle)
  )

describe('under way', () => {
  it('shows the people somebody has already invested in, and only them', async () => {
    await screen()
    const lists = rowsUnder('crm.vip.title')
    // The first list under the heading is "under way": paid and packaged.
    const under = lists[lists.length - 2]?.textContent ?? ''
    expect(under).toContain('Paid Person')
    expect(under).toContain('Packaged Person')
    expect(under).not.toContain('Cold Person')
  })

  it('counts them in the heading, so the number matches the rows', async () => {
    await screen()
    expect(text()).toContain('crm.vip.title 2')
  })
})

describe('the search', () => {
  it('narrows the rows AND the chip counts together', async () => {
    await screen()
    const input = host.querySelector('input[type="search"]')!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )!.set!
      setter.call(input, 'cold')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await settle()
    expect(text()).toContain('Cold Person')
    expect(text()).not.toContain('Paid Person')
    // One row left in "all", and none under way.
    expect(text()).toContain('crm.clients.filter.all 1')
    expect(text()).toContain('crm.vip.title 0')
  })
})

describe('the AUTO switch', () => {
  it('starts from what the server says', async () => {
    await screen()
    expect(text()).toContain('crm.auto.off')
    expect(byText('crm.auto.turnOn')).toBeTruthy()
  })

  it('turns on and shows the window and the budget the server returned', async () => {
    await screen()
    await act(async () => {
      byText('crm.auto.turnOn')!.click()
    })
    await settle()
    const set = calls.filter(c => c.name === 'autopilot_set')
    expect(set).toHaveLength(1)
    expect(set[0].args.on).toBe(true)
    // The state line now carries the numbers, not a guess.
    expect(text()).toContain('crm.auto.on:')
    expect(text()).toContain('19')
    expect(byText('crm.auto.turnOff')).toBeTruthy()
  })
})

describe('the measured figure', () => {
  it('says what left by itself, what the owner sent, and the share', async () => {
    await screen()
    // The key carries its numbers: 7 days, 6 automatic, 3 pressed, 67%.
    await settle()
    const panel = host.querySelector('.crm-auto')?.textContent ?? ''
    expect(panel, panel).toContain('crm.score.line:7,263,6,3,67%')
  })

  it('does not print a made-up zero when nothing has gone out', async () => {
    const answers0 = answers()
    ;(answers0 as Record<string, unknown>).crm_outcomes = {
      days: 7,
      auto_sent: 0,
      pressed_sent: 0,
      cancelled: 0,
      cards_drawn: 0,
      quiet: 0,
      failed: 0,
      without_you_percent: null,
      note: 'nothing yet',
    }
    emptyScore = true
    await screen()
    await settle()
    expect(text()).toContain('crm.score.empty:7')
    expect(text()).not.toContain('crm.score.line')
    emptyScore = false
  })
})

describe('the week before', () => {
  it('is printed beside this one, so the figure has something to be compared with', async () => {
    await screen()
    await settle()
    const panel = host.querySelector('.crm-auto')?.textContent ?? ''
    expect(panel).toContain('crm.score.line:7,263,6,3,67%')
    expect(panel).toContain('crm.score.before:10,10%')
  })

  it('is absent when the journal has nothing to compare with', async () => {
    emptyScore = true
    await screen()
    await settle()
    const panel = host.querySelector('.crm-auto')?.textContent ?? ''
    expect(panel).toContain('crm.score.empty')
    expect(panel).not.toContain('crm.score.before')
    emptyScore = false
  })
})

/**
 * PICKING SOMEBODY FOR AUTO, FROM THE LIST.
 *
 * The tick shipped on the client's card beside the chat, and that card is
 * hidden below 1100px -- so on a phone the "chosen" scope could never be
 * filled. These pin the control where the owner actually works: on the row,
 * at any width.
 */
describe('AUTO on a client row', () => {
  it('sends the person and the intent, and remembers the answer', async () => {
    await screen()
    const boxes = [...host.querySelectorAll('.crm__auto input')]
    expect(boxes.length).toBeGreaterThan(0)
    const first = boxes[0] as HTMLInputElement
    expect(first.checked).toBe(false)
    await act(async () => {
      first.click()
    })
    await settle()
    expect(lastPick).toMatchObject({ on: true })
    expect(
      (host.querySelector('.crm__auto input') as HTMLInputElement).checked
    ).toBe(true)
  })

  it('draws a tick as ON for somebody already chosen', async () => {
    picks = ['900000201']
    await screen()
    const row = [...host.querySelectorAll('.crm__row--client')].find(r =>
      (r.textContent ?? '').includes('Paid Person')
    )!
    expect(
      (row.querySelector('.crm__auto input') as HTMLInputElement).checked
    ).toBe(true)
  })
})

describe('the control is reachable where the owner works', () => {
  it('lives at top level in the stylesheet, not inside a width gate', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const css = readFileSync(join(__dirname, 'Crm.css'), 'utf8')
    /*
     * The client card (`.chat-aside`) is display:none below 1100px, which is
     * exactly why this tick had to move here. If `.crm__auto` ever ends up
     * inside a media query, the "chosen" scope becomes unfillable on a phone
     * again -- silently, because every test above passes in jsdom whatever the
     * stylesheet says.
     *
     * Depth by braces, not by counting lines: the first version counted `}`
     * at the start of a line and cheerfully passed the very mutation it was
     * written to catch.
     */
    const at = css.indexOf('.crm__auto')
    expect(at, '.crm__auto is gone from the stylesheet').toBeGreaterThan(-1)
    const before = css.slice(0, at)
    const depth =
      (before.match(/{/g) ?? []).length - (before.match(/}/g) ?? []).length
    expect(depth, 'the AUTO tick is nested inside a block').toBe(0)
  })
})

/**
 * ONE TAP THAT FILLS THE "CHOSEN" LIST.
 *
 * `chosen` is the safe way to run AUTO, and filling it one tick at a time is
 * the work nobody does at midnight. What is pinned: the tap takes exactly the
 * people who are waiting for US, leaves the ones we are waiting on alone, and
 * does not appear at all until the list of chosen people is known.
 */
describe('give AUTO everyone who is waiting', () => {
  const button = () =>
    [...host.querySelectorAll('button')].find(b =>
      (b.textContent ?? '').includes('crm.waiting.pickAll')
    )

  it('picks the people waiting for US, and nobody else', async () => {
    await screen()
    await act(async () => {
      button()!.click()
    })
    await settle()
    const asked = calls
      .filter(c => c.name === 'autopilot_lead')
      .map(c => String(c.args.lead))
    expect(asked.sort()).toEqual(['900000211', '900000212'])
    // The one WE are waiting on is not ours to answer automatically.
    expect(asked).not.toContain('900000213')
  })

  it('says how many it would take', async () => {
    await screen()
    expect(button()!.textContent).toContain('crm.waiting.pickAll:2')
  })

  it('does not appear until the chosen list is known', async () => {
    failPicks = true
    await screen()
    expect(button()).toBeUndefined()
    failPicks = false
  })
})
