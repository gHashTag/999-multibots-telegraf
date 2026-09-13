import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    // The key is returned, so these checks never depend on the wording in the
    // dictionary -- only on which key the screen decided to show.
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
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
})

async function draw() {
  const { default: CrmPage } = await import('./Crm')
  await act(async () => {
    // Rows link to `/crm/:clientId`, and a <Link> needs a router around it.
    root.render(
      <MemoryRouter>
        <CrmPage />
      </MemoryRouter>
    )
  })
  // Let the parallel loads settle.
  await act(async () => {
    await new Promise(r => setTimeout(r, 0))
  })
}

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
    const link = [...host.querySelectorAll('a')].map(a => a.getAttribute('href'))
    expect(link).toContain('https://t.me/p')
  })
})

describe('the buttons record, they do not send', () => {
  it('a press calls crm_touch and nothing that reaches a person', async () => {
    serve()
    await draw()
    calls = []
    const btn = [
      ...host.querySelectorAll<HTMLButtonElement>('.crm__row--ours .crm__acts button'),
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
    const btn = host.querySelector<HTMLButtonElement>('.crm__acts button')!
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
})

describe('every person on the list is a way into their own page', () => {
  it('client rows and lead rows link to /crm/:clientId', async () => {
    /*
     * Spec: t27 specs/automation/crm-client-workspace.t27 -- "the list links
     * to the client page". Before this the row went to t.me and nowhere in
     * the app; the per-client page existed for nobody.
     */
    serve()
    await draw()
    const text = String(host.textContent)
    expect(text).toContain('crm.clients.title')
    expect(text).toContain('ClientOnlyName')
    expect(text).toContain('@clientonly')
    expect(text).toContain('crm.clients.duets:7')
    const hrefs = [...host.querySelectorAll('a')].map(a => a.getAttribute('href'))
    expect(hrefs).toContain('/crm/555')
    expect(hrefs).toContain('/crm/111')
    expect(hrefs).toContain('/crm/444')
    // The t.me link is still there, as the secondary control.
    expect(hrefs).toContain('https://t.me/p')
  })

  it('an unreachable client list says so rather than showing nobody', async () => {
    serve({ fail: ['crm_clients'] })
    await draw()
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
    await draw()
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
    await draw()
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
    await draw()
    expect(chip('all').getAttribute('aria-pressed')).toBe('true')
    expect(chip('all').textContent).toBe('crm.clients.filter.all 2')
    expect(chip('clients').textContent).toBe('crm.clients.filter.clients 1')
    expect(chip('leads').textContent).toBe('crm.clients.filter.leads 1')
    expect(host.querySelectorAll('.crm__row--client').length).toBe(2)
  })

  it('clients keeps the paid one, leads keeps the other', async () => {
    serve()
    await draw()
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
    await draw()
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
