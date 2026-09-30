import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

const queued: Array<{ text: string; options: Record<string, unknown> }> = []
vi.mock('@/lib/agentStream', () => ({
  sendOrQueue: (text: string, _a: unknown, options: Record<string, unknown>) =>
    queued.push({ text, options }),
}))

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    // The key is returned, so these checks never depend on the wording in the
    // dictionary -- only on which key the screen decided to show.
    // A reason line (`crm.why.*`) without numbers still ends in ":": the
    // real `t` hands back the bare key only for a MISSING line, and the
    // screen reads that as "use the server's words instead".
    t: (key: string, vars?: Record<string, unknown>) =>
      vars || key.startsWith('crm.why.')
        ? `${key}:${Object.values(vars ?? {}).join(',')}`
        : key,
  }),
}))

/**
 * THE CRM SCREEN.
 *
 * Two properties are worth a test here, and both are about not lying to the
 * person reading it:
 *
 *   1. A panel that could not load says so. Rendering zeros for an unreachable
 *      server tells an owner their business is dead.
 *   2. The buttons record what happened and send nothing. The screen must not
 *      offer a shortcut around the one-message-at-a-time confirmation that
 *      lives in the bot.
 */
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const answers: Record<string, unknown> = {
  crm_overview: { ['всего_людей']: 2380, ['платящих']: 327 }, // cyrillic-ok: server keys
  crm_waiting: {
    total: 2,
    ours: 1,
    due: 0,
    theirs: 1,
    waiting: [
      {
        telegram_id: '111',
        name: 'Ivan',
        link: null,
        bot: 'b',
        waiting: 'ours',
        days: 2,
        stage: 'talking',
        because: 'ответил, а мы молчим',
        next_why: 'answer about the price he asked',
        urgency: 'now',
      },
      {
        telegram_id: '333',
        name: 'Pyotr',
        link: null,
        bot: 'b',
        waiting: 'theirs',
        days: 9,
        stage: 'written',
        because: 'написали, ответа нет',
      },
    ],
    what_to_do: 'x',
  },
  // cyrillic-ok: server keys
  crm_hot_leads: {
    ['найдено']: 12,
    ['показано']: 1,
    set_aside_touched: 4,
    ['люди']: [
      {
        telegram_id: '444',
        ['имя']: 'LeadOnlyName',
        ['ссылка']: 'https://t.me/p',
        ['бот']: 'b1',
        ['молчит_дней']: 3,
      },
    ],
  },
  crm_touch: { saved: true },
  crm_summary: {
    people_with_messages: 30,
    by_stage: {
      client: 3,
      refused: 1,
      later: 2,
      talking: 5,
      written: 8,
      winback: 1,
      new: 10,
    },
  },
  // cyrillic-ok: server keys
  crm_winback: {
    ['порог_дней']: 30,
    ['найдено']: 1,
    ['показано']: 1,
    ['люди']: [
      {
        telegram_id: '900000777',
        ['имя']: 'WinbackBuyerOnly',
        ['ссылка']: null,
        ['бот']: 'b1',
        ['молчит_дней']: 45,
      },
    ],
  },
  crm_revenue: {
    total: 4500,
    last_30d: 500,
    paying_clients: 2,
    ltv: 2250,
    top: [{ id: '777', name: 'RevenueTopName', stars: 3000 }],
  },
  crm_clients: {
    clients: [
      {
        telegram_id: '555',
        name: 'ClientOnlyName',
        username: 'clientonly',
        client: 'Leela',
        has_profile: true,
        has_soul: false,
        skills: 2,
        stage: 'client',
        paid: true,
        last_seen: '2026-09-12T10:00:00Z',
        duets: 7,
      },
      {
        telegram_id: '666',
        name: 'LeadRowOnlyName',
        username: null,
        client: null,
        has_profile: false,
        has_soul: false,
        skills: 0,
        stage: 'talking',
        paid: false,
        last_seen: null,
        duets: 0,
      },
    ],
    paid_known: true,
  },
}

/*
 * Every test starts from these answers. Tests replace one of them to draw a
 * case; without the reset the replacement leaked into every later test, and
 * a test passed or failed by where it sat in the file (loop tick 12: a new
 * describe left no "ours" row and three tests below it broke).
 */
const pristine = structuredClone(answers)

let calls: Array<{ name: string; args: Record<string, unknown> }> = []

function serve(opts: { fail?: string[] } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'))
      const name = body?.params?.name
      calls.push({ name, args: body?.params?.arguments ?? {} })
      if (opts.fail?.includes(name)) {
        /*
         * A 500 WITH A BODY, which is what a real server sends. The first
         * version of this fake returned a bare `{ok:false}` with no `json`, so
         * the code fell into its own catch and looked correct -- and deleting
         * the status check changed nothing. A fake that cannot fail the way the
         * world fails is not a test.
         */
        return {
          ok: false,
          status: 500,
          json: async () => ({ result: { structuredContent: { total: 0 } } }),
        }
      }
      return {
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: { structuredContent: answers[name] ?? {} },
        }),
      }
    })
  )
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  calls = []
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
  for (const k of Object.keys(answers)) delete answers[k]
  Object.assign(answers, structuredClone(pristine))
})

/*
 * THE PAGE IS IMPORTED ONCE, BEFORE ANY TEST IS TIMED.
 *
 * Measured 25.09.2026: `import('./Crm')` takes 5.5 SECONDS on this machine --
 * the module graph, not the rendering. It sat inside `draw()`, so whichever
 * test drew first paid it out of its own 5 s budget: 4018 ms idle, and over
 * the budget the moment the machine was busy. The whole file then cascaded,
 * and the failure count tracked the LOAD rather than the code: 0 failures
 * alone on an idle machine, 5 sequential, 21 in a parallel full run.
 *
 * A suite whose result depends on what else is running is not a gate. The
 * cost is real and stays; it is paid here, once, in a hook with a budget of
 * its own, and every test then gets the cached module.
 */
beforeAll(async () => {
  await import('./Crm')
}, 60_000)

/** The contacts live in their own section since the phone redesign. */
const CONTACTS = '/crm?tab=contacts'

/**
 * The rules of Crm.css's phone block (`max-width: 480px`), comments out.
 * jsdom lays nothing out, so a phone layout is pinned in its stylesheet.
 * Depth by braces: the block holds nested rules.
 */
async function phoneRules() {
  const { readFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const css = readFileSync(join(__dirname, 'Crm.css'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    ''
  )
  const at = css.indexOf('@media (max-width: 480px)')
  expect(at).toBeGreaterThan(-1)
  let depth = 0
  let end = css.indexOf('{', at)
  for (let i = end; i < css.length; i++) {
    if (css[i] === '{') depth++
    if (css[i] === '}' && --depth === 0) {
      end = i
      break
    }
  }
  const block = css.slice(css.indexOf('{', at) + 1, end)
  return [...block.matchAll(/([^{}]+){([^}]*)}/g)].map(m => ({
    selector: m[1].trim(),
    body: m[2],
  }))
}

async function draw(at = '/crm') {
  const { default: CrmPage } = await import('./Crm')
  await act(async () => {
    // Rows link to `/crm/:clientId`, and a <Link> needs a router around it.
    root.render(
      <MemoryRouter initialEntries={[at]}>
        <CrmPage />
      </MemoryRouter>
    )
  })
  // Let the parallel loads settle.
  await act(async () => {
    await new Promise(r => setTimeout(r, 0))
  })
}

describe('the revenue strip', () => {
  it('sits in the work section, and a top client links to their card', async () => {
    serve()
    await draw()
    expect(calls.some(c => c.name === 'crm_revenue')).toBe(true)
    expect(
      host.querySelector('[data-testid="crm-revenue-total"]')?.textContent
    ).toBe('4500')
    const link = host.querySelector(
      '[data-testid="crm-revenue-top"] a'
    ) as HTMLAnchorElement | null
    expect(link?.textContent).toBe('RevenueTopName')
    expect(link?.getAttribute('href')).toBe('/crm/777')
  })
})

describe('the screen puts the costly thing first', () => {
  it('somebody who answered us is rendered before somebody we chased', async () => {
    /*
     * The ordering is the product. Server-side sorting puts "ours" first; if
     * the screen re-sorted or reversed, the one item that costs money every day
     * it is ignored would sit at the bottom.
     */
    serve()
    await draw()
    const names = [...host.querySelectorAll('.crm__who')].map(n =>
      String(n.textContent)
    )
    expect(names[0]).toContain('Ivan')
    expect(host.querySelector('.crm__row--ours')?.textContent).toContain('Ivan')
  })

  it('an empty waiting list is stated as good news, not left blank', async () => {
    // A blank panel reads as broken. This one is a result.
    answers.crm_waiting = { total: 0, ours: 0, due: 0, theirs: 0, waiting: [] }
    serve()
    await draw()
    expect(host.textContent).toContain('crm.waiting.none')
    answers.crm_waiting = {
      total: 2,
      ours: 1,
      due: 0,
      theirs: 1,
      waiting: [
        {
          telegram_id: '111',
          name: 'Ivan',
          link: null,
          bot: 'b',
          waiting: 'ours',
          days: 2,
          stage: 'talking',
          because: 'x',
        },
        {
          telegram_id: '333',
          name: 'Pyotr',
          link: null,
          bot: 'b',
          waiting: 'theirs',
          days: 9,
          stage: 'written',
          because: 'y',
        },
      ],
      what_to_do: 'x',
    }
  })
})

describe('a panel that could not load says so', () => {
  it('an unreachable waiting list does not render as zero', async () => {
    /*
     * Zeros for a server that did not answer tell the owner nobody is waiting
     * and nobody is buying. That is a worse lie than an empty screen, and it is
     * indistinguishable from a quiet week.
     */
    serve({ fail: ['crm_waiting'] })
    await draw()
    expect(host.textContent).toContain('crm.unreachable')
    expect(host.textContent).not.toContain('crm.waiting.none')
  })

  it('one broken panel does not take the others down', async () => {
    // Three independent loads. Losing the audience numbers must not cost the
    // waiting list, which is the reason the screen exists.
    serve({ fail: ['crm_overview'] })
    await draw()
    expect(host.textContent).toContain('Ivan')
  })
})

describe('the server speaks Russian keys and the screen does not have to', () => {
  it('a lead arrives with its name, link and quiet days intact', async () => {
    /*
     * The translation happens once, at the boundary in `lib/crm.ts`. Caught by
     * mutation: the waiting rows were NOT translated, so every row key and
     * every touch id would have been undefined in production -- and the test
     * had gone green because its fixture was written to match the component
     * instead of the server. A fake that agrees with the code proves nothing.
     */
    serve()
    await draw()
    const text = String(host.textContent)
    /*
     * A name that appears NOWHERE ELSE in the fixtures. The first version used
     * a name the waiting list also carried, so the assertion was satisfied by
     * the wrong row and the mutation that blanked the lead name survived.
     */
    expect(text, 'имя лида потерялось при переводе ключей').toContain(
      'LeadOnlyName'
    )
    expect(text).toContain('crm.leads.quiet:3')
    expect(text).toContain('crm.leads.setAside:4')
    const link = [...host.querySelectorAll('a')].map(a =>
      a.getAttribute('href')
    )
    expect(link).toContain('https://t.me/p')
  })
})

describe('prepare asks the agent, it does not send', () => {
  it("shows the server's advice and queues a draft in the client's own thread", async () => {
    answers.crm_waiting = {
      total: 1,
      ours: 1,
      due: 0,
      theirs: 0,
      waiting: [
        {
          telegram_id: '111',
          name: 'Ivan',
          link: null,
          bot: 'b',
          waiting: 'ours',
          days: 2,
          stage: 'talking',
          because: 'x',
          next_why: 'answer about the price he asked',
          urgency: 'now',
        },
      ],
    }
    serve()
    await draw()
    expect(host.textContent).toContain('answer about the price he asked')
    calls = []
    queued.length = 0
    const btn = host.querySelector<HTMLButtonElement>(
      '.crm__row--ours .crm__prepare'
    )!
    await act(async () => {
      btn.click()
      await new Promise(r => setTimeout(r, 0))
    })
    expect(queued).toHaveLength(1)
    expect(queued[0].options).toEqual({ client: '111' })
    expect(queued[0].text).toContain('crm.wait.prepareAsk')
    for (const forbidden of ['tg_send', 'tg_forward', 'crm_send', 'crm_touch'])
      expect(calls.map(c => c.name)).not.toContain(forbidden)
  })
})

describe('a waiting reason is said in the screen language', () => {
  /*
   * The server's reasons are Russian words; an English screen printed them
   * as they came (loop tick 12). A code now travels next to the words. The
   * mocked `t` echoes the key with its numbers, so a translated line reads
   * "crm.why.<code>:<vars>" here and the server's words are the fallback.
   */
  const row = (over: Record<string, unknown>) => ({
    telegram_id: '111',
    name: 'Ivan',
    link: null,
    bot: 'b',
    waiting: 'theirs',
    days: 9,
    stage: 'written',
    because: 'WORDS-BECAUSE',
    next_why: 'WORDS-NEXT',
    urgency: 'today',
    ...over,
  })

  it('translates a reason that comes with a code, and asks the agent in it', async () => {
    answers.crm_waiting = {
      total: 1,
      ours: 1,
      due: 0,
      theirs: 0,
      waiting: [
        row({
          waiting: 'ours',
          because_code: 'we_wrote',
          next_why_code: 'we_wrote_days',
          next_why_vars: { days: 9 },
        }),
      ],
    }
    serve()
    await draw()
    expect(host.querySelector('.crm__next')!.textContent).toBe(
      'crm.why.we_wrote_days:9'
    )
    expect(host.querySelector('.crm__why')!.textContent).toBe(
      'crm.wait.ours · crm.wait.days:9 · crm.why.we_wrote:'
    )
    expect(host.textContent).not.toContain('WORDS-NEXT')
    expect(host.textContent).not.toContain('WORDS-BECAUSE')
    queued.length = 0
    await act(async () => {
      host.querySelector<HTMLButtonElement>('.crm__prepare')!.click()
      await new Promise(r => setTimeout(r, 0))
    })
    expect(queued[0].text).toContain('crm.why.we_wrote_days:9')
  })

  it("shows the server's words when a reason has no code", async () => {
    answers.crm_waiting = {
      total: 1,
      ours: 0,
      due: 0,
      theirs: 1,
      waiting: [row({})],
    }
    serve()
    await draw()
    expect(host.querySelector('.crm__why')!.textContent).toBe(
      // The age says its unit: a bare "9" said nothing.
      'crm.wait.theirs · crm.wait.days:9 · WORDS-BECAUSE'
    )
    expect(host.querySelector('.crm__next')!.textContent).toBe('WORDS-NEXT')
  })
})

describe('the funnel and the win-back list', () => {
  it('the funnel strip sits at the top of the work, in funnel order', async () => {
    serve()
    await draw()
    const strip = host.querySelector('[data-testid="crm-funnel"]')!
    expect(strip).toBeTruthy()
    const stages = [...strip.querySelectorAll('[data-stage]')].map(li =>
      li.getAttribute('data-stage')
    )
    expect(stages).toEqual([
      'new',
      'written',
      'talking',
      'client',
      'winback',
      'later',
      'refused',
    ])
    // Above the waiting list: the strip comes first in the document.
    const waitingRow = host.querySelector('.crm__row--ours')!
    expect(
      strip.compareDocumentPosition(waitingRow) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('an unreachable summary draws no funnel at all, not zeros', async () => {
    serve({ fail: ['crm_summary'] })
    await draw()
    expect(host.querySelector('[data-testid="crm-funnel"]')).toBeNull()
    expect(host.textContent).toContain('Ivan')
  })

  it('an unreachable win-back list says so rather than showing nobody', async () => {
    serve({ fail: ['crm_winback'] })
    await draw()
    expect(host.textContent).toContain('crm.winback.title')
    expect(host.textContent).not.toContain('crm.winback.none')
    expect(host.textContent).toContain('crm.unreachable')
  })

  it('Return asks the agent in the client thread and sends nothing', async () => {
    serve()
    await draw()
    expect(host.textContent).toContain('WinbackBuyerOnly')
    expect(
      [...host.querySelectorAll('a')].map(a => a.getAttribute('href'))
    ).toContain('/crm/900000777')
    calls = []
    queued.length = 0
    const btn = host.querySelector<HTMLButtonElement>('.crm__return')!
    await act(async () => {
      btn.click()
      await new Promise(r => setTimeout(r, 0))
    })
    expect(queued).toHaveLength(1)
    expect(queued[0].options).toEqual({ client: '900000777' })
    expect(queued[0].text).toContain('crm.winback.returnAsk')
    for (const forbidden of ['tg_send', 'tg_forward', 'crm_send', 'crm_touch'])
      expect(calls.map(c => c.name)).not.toContain(forbidden)
  })
})

describe('the buttons record, they do not send', () => {
  it('a press calls crm_touch and nothing that reaches a person', async () => {
    serve()
    await draw()
    calls = []
    const btn = [
      ...host.querySelectorAll<HTMLButtonElement>(
        '.crm__row--ours .crm__acts button'
      ),
    ].find(b => b.textContent?.trim() === 'crm.act.replied')!
    await act(async () => {
      btn.click()
      await new Promise(r => setTimeout(r, 0))
    })
    const names = calls.map(c => c.name)
    expect(names).toContain('crm_touch')
    // The tools that reach another human being are not reachable from here.
    for (const forbidden of ['tg_send', 'tg_forward', 'crm_send']) {
      expect(names).not.toContain(forbidden)
    }
    expect(calls.find(c => c.name === 'crm_touch')?.args).toEqual({
      telegram_id: '111',
      kind: 'replied',
    })
  })

  it('after recording it RE-READS rather than guessing the new stage', async () => {
    /*
     * The stage and the waiting kind are derived on the server. Patching the
     * row in place would put a second copy of that rule in the browser, and two
     * copies of a rule are how one gets fixed and the other forgotten.
     */
    serve()
    await draw()
    calls = []
    // The first LOGGING button: Prepare asks the agent and records nothing.
    const btn = host.querySelector<HTMLButtonElement>(
      '.crm__acts button:not(.crm__prepare)'
    )!
    await act(async () => {
      btn.click()
      await new Promise(r => setTimeout(r, 0))
    })
    expect(calls.map(c => c.name)).toContain('crm_waiting')
  })

  it('the screen says out loud that nothing is sent', async () => {
    serve()
    await draw()
    expect(host.textContent).toContain('crm.note')
  })

  /*
   * ONE GROUP, SO IT WRAPS AS ONE. On a phone the buttons wrapped one at a
   * time: "Refused" alone on a second line, and in Russian stretched across
   * the whole row. The stylesheet moves the group; it needs the group.
   */
  it('keeps the three outcomes in one group, beside "Prepare"', async () => {
    serve()
    await draw()
    const acts = host.querySelector('.crm__row--ours .crm__acts')!
    const group = acts.querySelector(':scope > .crm__outcomes')
    expect(group, 'no outcome group').not.toBeNull()
    expect(group!.getAttribute('role')).toBe('group')
    expect(
      [...group!.querySelectorAll('button')].map(b => b.textContent)
    ).toEqual(['crm.act.written', 'crm.act.replied', 'crm.act.refused'])
    expect(acts.querySelector(':scope > .crm__prepare')).not.toBeNull()
  })

  it('on a phone, grows the group and never a lone button', async () => {
    const rules = await phoneRules()
    // A grow on every `.crm__acts button` stretches the lone "Wrote" of a
    // hot lead, or the restore button, across the whole row.
    for (const r of rules)
      if (/\.crm__acts button(?![-\w])/.test(r.selector))
        expect(r.body, r.selector).not.toMatch(/flex/)
    const outcomes = rules.find(r => r.selector === '.crm__outcomes button')
    expect(outcomes?.body).toMatch(/flex:\s*1 1 0/)
  })
})

/*
 * NAME OVER STAGE. A waiting row's head was one line: face, name, stage.
 * The stage never shrinks, and in Russian "t.me" plus "talking" is 131px of
 * a 318px row -- "Anna-Maria Vetrova-Sokolovskaya" was cut after one word.
 * On a phone the stage is the name's subtitle and the face spans both.
 */
describe('a waiting row on a phone', () => {
  const rule = (rules: Awaited<ReturnType<typeof phoneRules>>, sel: string) =>
    rules.find(r => r.selector === sel)?.body ?? ''

  it('puts the stage under the name, beside one face', async () => {
    const rules = await phoneRules()
    const head = rule(rules, '.crm__who:has(> .crm-avatar)')
    expect(head).toMatch(/display:\s*grid/)
    // `1fr` alone is minmax(auto, 1fr): an unbreakable name would widen
    // the column past the row instead of being cut.
    expect(head).toMatch(/grid-template-columns:\s*auto minmax\(0, 1fr\)/)
    // The row's own `gap: 10px` would part the name from its subtitle.
    expect(head).toMatch(/row-gap:\s*0/)
    expect(rule(rules, '.crm__who:has(> .crm-avatar) > .crm-avatar')).toMatch(
      /grid-row:\s*span 2/
    )
  })

  it('keeps the face first in the head, the stage after the name', async () => {
    serve()
    await draw()
    const heads = [...host.querySelectorAll('.crm__who')].filter(w =>
      w.querySelector(':scope > .crm-avatar')
    )
    expect(heads.length).toBeGreaterThan(0)
    for (const w of heads)
      expect([...w.children].map(c => c.className.split(' ')[0])).toEqual([
        'crm-avatar',
        'crm__open',
        'crm__stage',
      ])
  })
})

/*
 * THE COLUMN'S NAME STAYS ON SCREEN. On a phone AUTO is named once, in the
 * section heading -- which scrolled away with the first rows, leaving a long
 * list of bare round boxes. The heading is pinned under the finder (iOS and
 * Telegram contacts do the same) until its section ends.
 */
describe('section headings on a phone', () => {
  it('gives each heading a section of its own', async () => {
    // A sticky element is held inside its parent: two headings in one
    // parent stay pinned together, and the first never leaves.
    serve()
    await draw(CONTACTS)
    const lists = [...host.querySelectorAll('.crm__list')]
    expect(lists.length).toBeGreaterThan(1)
    for (const list of lists) {
      const group = list.parentElement!
      expect(group.matches('section.crm__group')).toBe(true)
      expect(group.querySelectorAll(':scope > .crm__subtitle')).toHaveLength(1)
      expect(group.firstElementChild?.matches('.crm__subtitle')).toBe(true)
    }
  })

  it("publishes the finder's height where the headings can read it", async () => {
    serve()
    await draw(CONTACTS)
    const finder = host.querySelector('.crm__finder')!
    const scope = finder.parentElement!
    expect(scope.style.getPropertyValue('--crm-finder-h')).toMatch(/^\d+px$/)
    for (const group of host.querySelectorAll('.crm__group'))
      expect(scope.contains(group)).toBe(true)
  })

  it('pins the heading under the finder, opaque', async () => {
    const rules = await phoneRules()
    const head =
      rules.find(
        r => r.selector === '.crm__contacts .crm__group > .crm__subtitle'
      )?.body ?? ''
    expect(head).toMatch(/position:\s*sticky/)
    // A copied number is true only until the finder grows.
    expect(head).toMatch(/top:\s*var\(--crm-finder-h/)
    expect(head).toMatch(/background:/)
  })
})

describe('a search shows why each row is there', () => {
  const rowOf = (name: string) =>
    [...host.querySelectorAll('.crm__contact')].find(li =>
      li.textContent?.includes(name)
    )!
  const marks = (el: Element) =>
    [...el.querySelectorAll('mark.crm__hit')].map(m => m.textContent)

  it('marks the typed letters in the name', async () => {
    serve()
    await draw(`${CONTACTS}&q=clientonlyn`)
    const name = rowOf('ClientOnlyName').querySelector('.crm__contact-name')!
    expect(marks(name)).toEqual(['ClientOnlyN'])
    expect(name.textContent).toBe('ClientOnlyName')
  })

  it('puts the fact the letters were found in first, before the stage', async () => {
    // The facts line ends in an ellipsis on a phone: a hit behind the
    // stage and a long package name was past it.
    serve()
    await draw(`${CONTACTS}&q=clientonly`)
    const facts = rowOf('ClientOnlyName').querySelector('.crm__contact-facts')!
    expect(marks(facts)).toEqual(['clientonly'])
    expect(facts.textContent).toMatch(/^crm\.clients\.paid@clientonly · /)
  })

  it('a hit deep in a long package name cuts what is before it', async () => {
    const saved = answers.crm_clients as { clients: object[] }
    answers.crm_clients = {
      ...saved,
      clients: [
        { ...saved.clients[0], client: 'Floristics and decor studio' },
        saved.clients[1],
      ],
    }
    try {
      serve()
      await draw(`${CONTACTS}&q=studio`)
      const facts = rowOf('ClientOnlyName').querySelector(
        '.crm__contact-facts'
      )!
      expect(marks(facts)).toEqual(['studio'])
      expect(facts.textContent).toMatch(/…\S* studio · /)
    } finally {
      answers.crm_clients = saved
    }
  })

  it('a row found by its id alone names the id', async () => {
    serve()
    await draw(`${CONTACTS}&q=666`)
    const facts = rowOf('LeadRowOnlyName').querySelector('.crm__contact-facts')!
    expect(marks(facts)).toEqual(['666'])
    expect(facts.textContent).toMatch(/^id 666 · /)
  })

  it('no search, no marks and no id', async () => {
    serve()
    await draw(CONTACTS)
    expect(host.querySelector('mark')).toBeNull()
    expect(host.querySelector('.crm__contacts')?.textContent).not.toMatch(
      /id 666/
    )
  })
})

describe('contacts on a phone are one surface', () => {
  const rule = async (sel: string) =>
    (await phoneRules()).find(r => r.selector.replace(/\s+/g, ' ') === sel)
      ?.body ?? ''

  it('the list carries the frame, not a gap between framed rows', async () => {
    const list = await rule('.crm__contacts .crm__group > .crm__list')
    expect(list).toMatch(/gap:\s*0/)
    expect(list).toMatch(/border:\s*1px/)
    const row = await rule(
      '.crm__contacts .crm__group > .crm__list > .crm__contact'
    )
    expect(row).toMatch(/border:\s*0/)
    expect(row).toMatch(/background:\s*transparent/)
  })

  it('a hairline between rows starts where the names do', async () => {
    const line = await rule(
      '.crm__contacts .crm__group > .crm__list > .crm__contact + .crm__contact::before'
    )
    // 10px row padding + 40px face + 8px gap.
    expect(line).toMatch(/left:\s*58px/)
    expect(line).toMatch(/height:\s*1px/)
  })
})

describe('every person on the list is a way into their own page', () => {
  const hrefs = () =>
    [...host.querySelectorAll('a')].map(a => a.getAttribute('href'))

  it('client rows and lead rows link to /crm/:clientId', async () => {
    /*
     * Spec: t27 specs/automation/crm-client-workspace.t27 -- "the list links
     * to the client page". Before this the row went to t.me and nowhere in
     * the app; the per-client page existed for nobody.
     */
    serve()
    await draw()
    expect(hrefs()).toContain('/crm/111')
    expect(hrefs()).toContain('/crm/444')
    // The t.me link is still there, as the secondary control.
    expect(hrefs()).toContain('https://t.me/p')

    act(() => root.unmount())
    root = createRoot(host)
    await draw(CONTACTS)
    const text = String(host.textContent)
    expect(text).toContain('crm.clients.title')
    expect(text).toContain('ClientOnlyName')
    expect(text).toContain('@clientonly')
    expect(hrefs()).toContain('/crm/555')
  })

  it('an unreachable client list says so rather than showing nobody', async () => {
    serve({ fail: ['crm_clients'] })
    await draw(CONTACTS)
    expect(host.textContent).not.toContain('crm.clients.none')
    expect(host.textContent).toContain('crm.unreachable')
  })
})

describe('paid is a fact from payments, shown as such', () => {
  /*
   * Spec: t27 specs/automation/crm-client-workspace.t27 -- the list tells
   * who has paid, and says so when it cannot tell.
   */
  it('a row with paid:true wears the badge and a row without does not', async () => {
    serve()
    await draw(CONTACTS)
    const rows = [...host.querySelectorAll('.crm__row--client')]
    const paidRow = rows.find(r => r.textContent?.includes('ClientOnlyName'))!
    const leadRow = rows.find(r => r.textContent?.includes('LeadRowOnlyName'))!
    expect(paidRow.querySelector('.crm__badge--paid')?.textContent).toBe(
      'crm.clients.paid'
    )
    expect(leadRow.querySelector('.crm__badge--paid')).toBeNull()
    // Payments were readable, so no warning.
    expect(host.textContent).not.toContain('crm.clients.paidUnknown')
  })

  it('when the server could not read payments the list says so once', async () => {
    const saved = answers.crm_clients as Record<string, unknown>
    answers.crm_clients = { ...saved, paid_known: false }
    serve()
    await draw(CONTACTS)
    const text = String(host.textContent)
    expect(text.split('crm.clients.paidUnknown').length - 1).toBe(1)
    // The rows are still there: the note qualifies the list, it does not
    // replace it.
    expect(text).toContain('ClientOnlyName')
    answers.crm_clients = saved
  })
})

describe('the client list can be narrowed to clients or leads', () => {
  const chip = (kind: string) =>
    [
      ...host.querySelectorAll<HTMLButtonElement>('.crm__filter .crm__chip'),
    ].find(b => b.textContent?.startsWith(`crm.clients.filter.${kind}`))!

  it('opens on all, with counts in the chips', async () => {
    serve()
    await draw(CONTACTS)
    expect(chip('all').getAttribute('aria-pressed')).toBe('true')
    expect(chip('all').textContent).toBe('crm.clients.filter.all 2')
    expect(chip('clients').textContent).toBe('crm.clients.filter.clients 1')
    expect(chip('leads').textContent).toBe('crm.clients.filter.leads 1')
    expect(host.querySelectorAll('.crm__row--client').length).toBe(2)
  })

  it('clients keeps the paid one, leads keeps the other', async () => {
    serve()
    await draw(CONTACTS)
    await act(async () => {
      chip('clients').click()
    })
    let names = [...host.querySelectorAll('.crm__row--client')].map(r =>
      String(r.textContent)
    )
    expect(names.length).toBe(1)
    expect(names[0]).toContain('ClientOnlyName')

    await act(async () => {
      chip('leads').click()
    })
    names = [...host.querySelectorAll('.crm__row--client')].map(r =>
      String(r.textContent)
    )
    expect(names.length).toBe(1)
    expect(names[0]).toContain('LeadRowOnlyName')
    expect(chip('leads').getAttribute('aria-pressed')).toBe('true')
    // Filtering is local: nothing was asked of the server again.
    expect(calls.filter(c => c.name === 'crm_clients').length).toBe(1)
  })

  it('a stage of client or winback counts as a client even when unpaid', async () => {
    const saved = answers.crm_clients as Record<string, unknown>
    answers.crm_clients = {
      clients: [
        {
          telegram_id: '1',
          name: 'WinbackOnly',
          stage: 'winback',
          paid: false,
        },
        { telegram_id: '2', name: 'PlainLeadOnly', stage: 'new', paid: false },
        { telegram_id: '3', name: 'PaidNewOnly', stage: 'new', paid: true },
      ],
      paid_known: false,
    }
    serve()
    await draw(CONTACTS)
    await act(async () => {
      chip('clients').click()
    })
    const text = [...host.querySelectorAll('.crm__row--client')]
      .map(r => String(r.textContent))
      .join('|')
    expect(text).toContain('WinbackOnly')
    expect(text).toContain('PaidNewOnly')
    expect(text).not.toContain('PlainLeadOnly')
    expect(chip('clients').textContent).toBe('crm.clients.filter.clients 2')
    expect(chip('leads').textContent).toBe('crm.clients.filter.leads 1')
    answers.crm_clients = saved
  })
})

/*
 * EVERY CLIENT, NOT THE FIRST PAGE (#2947). The contact book puts hundreds
 * of people in the CRM; the list pages, and a search asks the server.
 */
describe('the clients list pages past the first', () => {
  const row = (id: string, name: string) => ({
    telegram_id: id,
    name,
    username: null,
    client: null,
    has_profile: false,
    has_soul: false,
    skills: 0,
    stage: 'talking',
    paid: false,
    last_seen: null,
    duets: 0,
  })
  function servePaged() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: string, init: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}'))
        const name = body?.params?.name
        const args = body?.params?.arguments ?? {}
        calls.push({ name, args })
        let out: unknown = answers[name] ?? {}
        if (name === 'crm_clients') {
          out = args.query
            ? { clients: [row('900000999', 'FoundBySearch')], paid_known: true }
            : args.offset
              ? {
                  clients: [row('900000002', 'SecondPageName')],
                  paid_known: true,
                  next_offset: null,
                }
              : {
                  clients: [row('900000001', 'FirstPageName')],
                  paid_known: true,
                  next_offset: 100,
                }
        }
        return {
          ok: true,
          json: async () => ({
            jsonrpc: '2.0',
            id: 1,
            result: { structuredContent: out },
          }),
        }
      })
    )
  }

  it('asks for page one, then appends page two on More, then hides More', async () => {
    servePaged()
    await draw(CONTACTS)
    const first = calls.find(c => c.name === 'crm_clients')!
    expect(first.args).toMatchObject({ offset: 0 })
    expect(host.textContent).toContain('FirstPageName')
    const more = [...host.querySelectorAll('button')].find(
      b => b.textContent === 'crm.clients.more'
    )!
    expect(more).toBeTruthy()
    await act(async () => {
      more.click()
      await new Promise(r => setTimeout(r, 0))
    })
    expect(
      calls.filter(c => c.name === 'crm_clients').at(-1)!.args
    ).toMatchObject({ offset: 100 })
    expect(host.textContent).toContain('FirstPageName')
    expect(host.textContent).toContain('SecondPageName')
    expect(host.textContent).not.toContain('crm.clients.more')
  })

  it('a search of two letters asks the server over ALL clients', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      servePaged()
      await draw(CONTACTS)
      const input = host.querySelector<HTMLInputElement>(
        'input[type="search"]'
      )!
      await act(async () => {
        const set = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value'
        )!.set!
        set.call(input, 'Found')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      await act(async () => {
        vi.advanceTimersByTime(350)
        await new Promise(r => setTimeout(r, 0))
      })
      const search = calls.find(c => c.name === 'crm_clients' && c.args.query)
      expect(search?.args).toMatchObject({ query: 'Found', offset: 0 })
      expect(host.textContent).toContain('FoundBySearch')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('groups on /crm (#2950)', () => {
  it('a groups chip lists the groups, each opening its read-only page', async () => {
    answers.crm_groups = {
      groups: [
        {
          chat_id: '-1001111111111',
          kind: 'group',
          title: 'Buyers club',
          members_count: 40,
          messages: 12,
        },
      ],
    }
    try {
      serve()
      await draw(CONTACTS)
      const chip = [...host.querySelectorAll('button')].find(b =>
        b.textContent?.startsWith('crm.clients.filter.groups')
      )!
      expect(chip.textContent).toBe('crm.clients.filter.groups 1')
      await act(async () => {
        chip.click()
      })
      const link = host.querySelector('a[href="/crm/g/-1001111111111/chat"]')
      expect(link?.textContent).toBe('Buyers club')
      expect(host.textContent).not.toContain('ClientOnlyName')
    } finally {
      delete answers.crm_groups
    }
  })

  // Tick 2 of the CRM mobile loop: the groups filter read "@buyers" with
  // the @ and found nothing; one needle now serves people and groups.
  it('a group is found by its @username', async () => {
    answers.crm_groups = {
      groups: [
        {
          chat_id: '-1002222222222',
          kind: 'supergroup',
          title: 'Wholesale',
          username: 'buyers_club',
          members_count: 40,
          messages: 12,
        },
      ],
    }
    try {
      serve()
      await draw(CONTACTS)
      const input = host.querySelector<HTMLInputElement>(
        'input[type="search"]'
      )!
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value'
        )!.set!.call(input, '@buyers')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      const chip = [...host.querySelectorAll('button')].find(b =>
        b.textContent?.startsWith('crm.clients.filter.groups')
      )!
      expect(chip.textContent).toBe('crm.clients.filter.groups 1')
    } finally {
      delete answers.crm_groups
    }
  })
})

/*
 * THE PHONE REDESIGN (owner, 2026-10-01: "finding a contact in the CRM is
 * awkward on a phone, and there is no room"). Measured at 390px before it:
 * the search box 1523px down the work section, rows 140-160px tall.
 */
describe('contacts on a phone', () => {
  const typeInto = async (input: HTMLInputElement, value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      )!.set!.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  it('the work section holds no contact list, and one tap opens the search', async () => {
    serve()
    await draw()
    expect(host.querySelector('.crm__row--client')).toBeNull()
    // The way in is a real field (iOS opens the keyboard only for a focus
    // made inside the tap), not a button that opens one a task later.
    const find = host.querySelector<HTMLInputElement>('.crm__find input')!
    expect(find.placeholder).toBe('crm.contacts.find')
    await act(async () => {
      find.focus()
    })
    const input = host.querySelector<HTMLInputElement>(
      '.crm__finder input[type="search"]'
    )
    expect(input).not.toBeNull()
    expect(host.querySelector('.crm__find')).toBeNull()
    // Came for a person: the box already has the cursor.
    expect(document.activeElement).toBe(input)
    expect(host.textContent).toContain('ClientOnlyName')
  })

  it('clear and the chips keep the keyboard: they never take the focus', async () => {
    serve()
    await draw(CONTACTS)
    const input = host.querySelector<HTMLInputElement>('input[type="search"]')!
    await typeInto(input, 'q')
    const press = (el: Element) => {
      const e = new Event('pointerdown', { bubbles: true, cancelable: true })
      el.dispatchEvent(e)
      return e.defaultPrevented
    }
    expect(press(host.querySelector('.crm__search-clear')!)).toBe(true)
    expect(press(host.querySelector('.crm__chip')!)).toBe(true)
  })

  it('no "More clients" under an answered search: the server looked at all', async () => {
    const saved = answers.crm_clients as Record<string, unknown>
    answers.crm_clients = { ...saved, next_offset: 50 }
    try {
      serve()
      await draw(CONTACTS)
      // There IS a next page: without a query the button is offered.
      expect(host.querySelector('.crm__more')).not.toBeNull()
      const input = host.querySelector<HTMLInputElement>(
        'input[type="search"]'
      )!
      await typeInto(input, 'qq')
      expect(host.querySelector('.crm__more')).toBeNull()
    } finally {
      answers.crm_clients = saved
    }
  })

  it('a search that finds nobody says so and KEEPS the box to change it', async () => {
    // It used to swap the whole panel for "no clients yet", search box
    // included, so the letters could not even be erased.
    serve()
    await draw(CONTACTS)
    const input = host.querySelector<HTMLInputElement>('input[type="search"]')!
    await typeInto(input, 'q')
    expect(host.textContent).toContain('crm.clients.notFound:q')
    expect(host.textContent).not.toContain('crm.clients.none')
    const clear = host.querySelector<HTMLButtonElement>('.crm__search-clear')!
    await act(async () => {
      clear.click()
    })
    expect(input.value).toBe('')
    expect(host.textContent).toContain('ClientOnlyName')
  })

  it('details and removal wait behind "..."; AUTO stays on the row', async () => {
    serve()
    await draw(CONTACTS)
    const row = [...host.querySelectorAll('.crm__row--client')].find(r =>
      r.textContent?.includes('ClientOnlyName')
    )!
    expect(row.querySelector('.crm__auto input')).not.toBeNull()
    expect(row.textContent).not.toContain('crm.clients.duets')
    expect(row.textContent).not.toContain('crm.row.drop')
    const more = row.querySelector<HTMLButtonElement>('.crm__contact-toggle')!
    expect(more.getAttribute('aria-expanded')).toBe('false')
    await act(async () => {
      more.click()
    })
    expect(more.getAttribute('aria-expanded')).toBe('true')
    expect(row.textContent).toContain('crm.clients.duets:7')
    expect(row.textContent).toContain('crm.row.drop')
  })
})

/*
 * RECENTLY OPENED (CRM mobile loop, tick 2; HubSpot and Pipedrive both put
 * recent records under an empty search). Going back to a person was: type a
 * name, wait for the server, tap.
 */
describe('recent contacts', () => {
  afterEach(() => window.localStorage.clear())

  const recentRow = () => host.querySelector('.crm__recent')

  it('an empty search offers the people opened last, newest first', async () => {
    window.localStorage.setItem('vibee.crm.recent', '["666","555"]')
    serve()
    await draw(CONTACTS)
    const links = [...(recentRow()?.querySelectorAll('a') ?? [])]
    expect(links.map(a => a.getAttribute('href'))).toEqual([
      '/crm/666',
      '/crm/555',
    ])
  })

  it('an id the server did not list draws nothing', async () => {
    window.localStorage.setItem('vibee.crm.recent', '["999999","555"]')
    serve()
    await draw(CONTACTS)
    const links = [...(recentRow()?.querySelectorAll('a') ?? [])]
    expect(links.map(a => a.getAttribute('href'))).toEqual(['/crm/555'])
  })

  it('keeps to the chip: under Leads a paying client is not offered', async () => {
    // 555 paid, 666 is a lead. The row used to show both under any chip.
    window.localStorage.setItem('vibee.crm.recent', '["555","666"]')
    serve()
    await draw('/crm?tab=contacts&who=leads')
    const links = [...(recentRow()?.querySelectorAll('a') ?? [])]
    expect(links.map(a => a.getAttribute('href'))).toEqual(['/crm/666'])
  })

  it('typing a search hides the row', async () => {
    window.localStorage.setItem('vibee.crm.recent', '["555"]')
    serve()
    await draw(CONTACTS)
    expect(recentRow()).not.toBeNull()
    const input = host.querySelector<HTMLInputElement>('input[type="search"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      )!.set!.call(input, 'Lead')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(recentRow()).toBeNull()
  })
})

/*
 * BACK FROM A CARD LANDS ON THE LIST AS IT WAS LEFT (CRM mobile loop, tick
 * 4). /crm and /crm/:id are sibling routes, so opening a contact unmounted
 * the list; Back mounted it fresh with the search and the chip gone.
 */
describe('the list survives a visit to a card', () => {
  function Card() {
    const navigate = useNavigate()
    return (
      <button className="probe-back" onClick={() => navigate(-1)}>
        back
      </button>
    )
  }

  const box = () =>
    host.querySelector<HTMLInputElement>('input[type="search"]')!
  const chipOn = () =>
    host.querySelector('.crm__filter .crm__chip[aria-pressed="true"]')
      ?.textContent

  async function type(text: string) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      )!.set!.call(box(), text)
      box().dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  async function click(el: Element) {
    await act(async () => {
      ;(el as HTMLElement).click()
    })
    await act(async () => {
      await new Promise(r => setTimeout(r, 0))
    })
  }

  it('an address with ?who= and ?q= opens with that chip and that search', async () => {
    serve()
    await draw('/crm?tab=contacts&who=leads&q=Lead')
    expect(box().value).toBe('Lead')
    expect(chipOn()).toMatch(/^crm\.clients\.filter\.leads/)
  })

  it('an unknown ?who= is the whole list, not an empty one', async () => {
    serve()
    await draw('/crm?tab=contacts&who=nonsense')
    expect(chipOn()).toMatch(/^crm\.clients\.filter\.all/)
  })

  it('search and chip are there again after Back', async () => {
    serve()
    const { default: CrmPage } = await import('./Crm')
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[CONTACTS]}>
          <Routes>
            <Route path="/crm" element={<CrmPage />} />
            <Route path="/crm/:clientId" element={<Card />} />
          </Routes>
        </MemoryRouter>
      )
    })
    await act(async () => {
      await new Promise(r => setTimeout(r, 0))
    })
    const leadsChip = [
      ...host.querySelectorAll('.crm__filter .crm__chip'),
    ].find(b => b.textContent?.startsWith('crm.clients.filter.leads'))!
    await click(leadsChip)
    await type('Lead')
    await click(host.querySelector('a[href="/crm/666"]')!)
    expect(host.querySelector('.probe-back')).not.toBeNull()

    await click(host.querySelector('.probe-back')!)
    expect(box().value).toBe('Lead')
    expect(chipOn()).toMatch(/^crm\.clients\.filter\.leads/)
  })

  it('Back lands on the row that was tapped, not at the top (tick 5)', async () => {
    serve()
    window.sessionStorage.clear()
    const { default: CrmPage } = await import('./Crm')
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[CONTACTS]}>
          <Routes>
            <Route path="/crm" element={<CrmPage />} />
            <Route path="/crm/:clientId" element={<Card />} />
          </Routes>
        </MemoryRouter>
      )
    })
    await act(async () => {
      await new Promise(r => setTimeout(r, 0))
    })
    try {
      document.documentElement.scrollTop = 777
      await click(host.querySelector('a[href="/crm/666"]')!)
      document.documentElement.scrollTop = 0 // the card starts at its top
      await click(host.querySelector('.probe-back')!)
      expect(box()).not.toBeNull()
      expect(document.documentElement.scrollTop).toBe(777)
    } finally {
      document.documentElement.scrollTop = 0
    }
  })
})
