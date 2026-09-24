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
 * THE CLIENT'S CARD BESIDE THE CONVERSATION.
 *
 * Owner, 2026-09-23: in wide mode the card should be there straight away.
 * What is pinned here is what the card is FOR -- the facts that change an
 * answer -- and the rule the whole CRM screen lives by: a panel that could
 * not load says so instead of rendering zeros.
 *
 * Fictional ids only (9000000xx).
 */
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const CONTEXT = {
  name: 'A Client',
  username: 'placeholder_client',
  stage: 'talk',
  balance_tokens: 42,
  waiting_for_reply: 2,
  dialog: [
    { at: '2026-09-22T10:00:00Z', who: 'owner', text: 'наш ответ' }, // cyrillic-ok: a line
    { at: '2026-09-22T11:00:00Z', who: 'person', text: 'а сколько стоит?' }, // cyrillic-ok: their line
  ],
}
const PROFILE = { telegram_id: '900000301', has_profile: true }
let context: unknown = CONTEXT
let profile: unknown = PROFILE
let fail = false
let picks: unknown = { leads: [], count: 0 }
let lastPick: { lead: unknown; on: unknown } | null = null

vi.stubGlobal(
  'fetch',
  vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'))
    const name = String(body?.params?.name ?? '')
    const args = (body?.params?.arguments ?? {}) as Record<string, unknown>
    if (fail) return new Response('nope', { status: 500 })
    const data =
      name === 'crm_lead_context'
        ? context
        : name === 'autopilot_leads'
          ? picks
          : name === 'autopilot_lead'
            ? (lastPick = { lead: args.lead, on: args.on })
            : profile
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

beforeEach(() => {
  context = CONTEXT
  profile = PROFILE
  fail = false
  picks = { leads: [], count: 0 }
  lastPick = null
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

async function show(client = '900000301', onAsk?: (text: string) => void) {
  const { ClientAside } = await import('./ClientAside')
  await act(async () => {
    root.render(
      <MemoryRouter>
        <ClientAside client={client} onAsk={onAsk} />
      </MemoryRouter>
    )
  })
  await act(async () => {
    await new Promise(r => setTimeout(r, 0))
  })
}

const text = () => host.textContent ?? ''

describe('the card', () => {
  it('shows who it is, the stage, the balance and that they are waiting', async () => {
    await show()
    expect(text()).toContain('A Client')
    expect(text()).toContain('@placeholder_client')
    expect(text()).toContain('talk')
    expect(text()).toContain('42')
    expect(text()).toContain('crm.aside.waiting.yes')
  })

  it('quotes THEIR last words, not ours', async () => {
    await show()
    expect(text()).toContain('а сколько стоит?') // cyrillic-ok: their line
    expect(text()).not.toContain('наш ответ') // cyrillic-ok: our line
  })

  it('says a package exists when one does', async () => {
    await show()
    expect(text()).toContain('crm.aside.package')
  })

  it('says "unavailable" instead of showing an empty card', async () => {
    fail = true
    await show()
    expect(text()).toContain('crm.client.unreachable')
    expect(text()).not.toContain('crm.aside.waiting.yes')
  })

  it('offers the way to the client screen and to Telegram', async () => {
    await show()
    const hrefs = [...host.querySelectorAll('a')].map(a =>
      a.getAttribute('href')
    )
    expect(hrefs).toContain('/crm/900000301')
    expect(hrefs).toContain('tg://user?id=900000301')
  })
})

/**
 * THE TICK THAT LETS AUTO WRITE TO THIS PERSON.
 *
 * The dashboard switch can be set to "chosen"; this card is where somebody is
 * chosen, while the owner is looking at what they last said. Two ways it could
 * mislead are pinned: an unticked box that has merely not loaded (a lie about
 * a setting that sends messages), and a tick that stays on after the server
 * refused it.
 */
describe('AUTO for this client', () => {
  it('is not drawn at all until the list is known', async () => {
    fail = true
    await show()
    expect(host.querySelector('.chat-aside__auto')).toBeNull()
  })

  it('shows ticked when this person is already chosen', async () => {
    picks = { leads: ['900000301'], count: 1 }
    await show()
    const box = host.querySelector(
      '.chat-aside__auto input'
    ) as HTMLInputElement
    expect(box.checked).toBe(true)
  })

  it('picking sends the person and the intent, and nothing else', async () => {
    await show()
    const box = host.querySelector(
      '.chat-aside__auto input'
    ) as HTMLInputElement
    expect(box.checked).toBe(false)
    await act(async () => {
      box.click()
    })
    await act(async () => {
      await new Promise(r => setTimeout(r, 0))
    })
    expect(lastPick).toEqual({ lead: '900000301', on: true })
    expect(box.checked).toBe(true)
  })
})

/**
 * THE COCKPIT: SOUL, RULES, THE NEXT MOVE.
 *
 * Owner, 2026-09-24: the card showed a name and a balance while the server
 * returned the SOUL, the package and buying words. Pinned: they reach the
 * screen, and a move becomes a question to the agent -- never a message to
 * the client.
 */
describe('the cockpit', () => {
  const click = async (el: Element | null | undefined) => {
    await act(async () => {
      ;(el as HTMLElement).click()
    })
  }

  it('shows the SOUL excerpt and marks a draft', async () => {
    profile = {
      telegram_id: '900000301',
      has_profile: true,
      has_soul: true,
      soul_is_draft: true,
      soul_excerpt: 'Loves short videos about her studio',
    }
    await show()
    expect(text()).toContain('Loves short videos about her studio')
    expect(text()).toContain('crm.aside.soul.draft')
  })

  it('says SOUL is withheld instead of "none" when it is not ours', async () => {
    profile = { has_profile: false, has_soul: false, private_withheld: true }
    await show()
    expect(text()).toContain('crm.aside.soul.withheld')
    expect(text()).not.toContain('crm.aside.soul.none')
  })

  it('the rules tab puts what never to say first', async () => {
    profile = {
      has_profile: true,
      profile: { business: 'yoga', forbidden: ['guarantees'] },
    }
    await show()
    const tab = [...host.querySelectorAll('[role="tab"]')].find(b =>
      b.textContent?.includes('crm.aside.tab.package')
    )
    await click(tab)
    const rows = [...host.querySelectorAll('.chat-aside__rules > div')]
    expect(rows[0].textContent).toContain('guarantees')
    expect(rows[0].getAttribute('data-warning')).toBe('yes')
  })

  it('waiting on us: the first move is to answer, and it asks the agent', async () => {
    profile = { telegram_id: '900000301', has_profile: true, has_soul: true }
    const asked: string[] = []
    await show('900000301', t => asked.push(t))
    const first = host.querySelector('.chat-aside__move')
    expect(first?.textContent).toContain('crm.move.answer')
    await click(first?.querySelector('button'))
    expect(asked).toEqual(['crm.move.answer.ask:A Client'])
  })

  it('a client who switched the assistant off gets a stop, with no button', async () => {
    context = { ...(context as object), assistant_off: { since: null } }
    await show('900000301', () => undefined)
    const moves = [...host.querySelectorAll('.chat-aside__move')]
    expect(moves).toHaveLength(1)
    expect(moves[0].getAttribute('data-tone')).toBe('stop')
    expect(moves[0].querySelector('button')).toBeNull()
    expect(text()).toContain('crm.aside.assistantOff')
  })
})
