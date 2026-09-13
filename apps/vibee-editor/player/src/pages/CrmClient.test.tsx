import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Spec: t27 specs/automation/crm-client-workspace.t27
 *
 * ONE CLIENT'S PAGE.
 *
 * Three things are worth a test, and all three are about not lying:
 *
 *   1. The panels show what the server said about THIS client -- profile
 *      marks, plan progress, duet runs with their coverage, touches, media,
 *      last messages -- translated from the tools' shapes once, in lib/crm.
 *   2. A panel whose tool did not answer says "unavailable" and never a zero.
 *      "No plan, no duets, no messages" is a verdict; the screen may not pass
 *      it when it did not hear back.
 *   3. The one primary button leads to the thread about this client and
 *      nowhere else.
 */

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
  }),
}))
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const CLIENT = '435572800'

const answers: Record<string, unknown> = {
  crm_client_profile: {
    telegram_id: CLIENT,
    client: 'Leela Chakra',
    has_profile: true,
    has_soul: false,
    skills: ['reels', 'voice', { name: 'plan' }],
    profile: { client: 'Leela Chakra' },
    updated_at: '2026-09-12T10:00:00Z',
  },
  crm_client_plan: {
    telegram_id: CLIENT,
    goals: [
      {
        id: 1,
        title: 'GoalOnlyTitle',
        intent: 'warm up',
        items: { total: 6, done: 2, by_status: { idea: 3, draft: 1, done: 2 } },
      },
    ],
    items: [],
    total: 6,
    done: 2,
  },
  crm_duet_runs: {
    runs: [
      {
        id: 'duet-1',
        buyer: CLIENT,
        state: 'done',
        dry_run: false,
        turns: 4,
        started_at: '2026-09-13T09:00:00Z',
        finished_at: '2026-09-13T09:05:00Z',
        paid_calls: 1,
        media_sent: 2,
        profile_used: true,
        coverage: { reel_render: { calls: 3, ok: 2, fail: 1 } },
        violations: ['sent a link'],
        voice_flags: ['too formal', 'too long'],
        lines: 8,
      },
    ],
  },
  // Shapes below mirror the render tools (crm-touch-tools.ts, crm-memory-tools.ts).
  crm_history: {
    telegram_id: CLIENT,
    total: 2,
    stage: 'talking',
    because: 'replied',
    waiting: 'ours',
    touches: [
      {
        kind: 'written',
        at: '2026-09-10T08:00:00Z',
        note: null,
        bot_name: 'b',
      },
      {
        kind: 'replied',
        at: '2026-09-11T08:00:00Z',
        note: 'asked price',
        bot_name: 'b',
      },
    ],
  },
  crm_lead_context: {
    name: 'Geya',
    username: 'playom',
    waiting_for_reply: 1,
    dialog: [
      { at: '2026-09-11T08:00:00Z', who: 'person', text: 'LeadSaidThis' },
      { at: '2026-09-11T08:01:00Z', who: 'owner', text: 'WeSaidThat' },
    ],
  },
  crm_lead_media: {
    items: [
      {
        id: 'm1',
        kind: 'photo',
        name: 'MediaOnlyName.jpg',
        at: '2026-09-09T08:00:00Z',
        who: 'person',
        url: 'https://files.example/m1.jpg',
      },
    ],
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
        // A 500 with a body, the way a real server fails.
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

async function draw(path = `/crm/${CLIENT}`) {
  const { default: CrmClientPage } = await import('./CrmClient')
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/crm/:clientId" element={<CrmClientPage />} />
        </Routes>
      </MemoryRouter>
    )
  })
  await act(async () => {
    await new Promise(r => setTimeout(r, 0))
  })
}

describe('every panel is about THIS client', () => {
  it('asks the six tools for the id in the address, not for a default', async () => {
    serve()
    await draw()
    const byName = Object.fromEntries(calls.map(c => [c.name, c.args]))
    expect(byName.crm_client_profile).toEqual({ telegram_id: CLIENT })
    expect(byName.crm_client_plan).toEqual({ telegram_id: CLIENT })
    expect(byName.crm_duet_runs).toMatchObject({ buyer: CLIENT })
    expect(byName.crm_history).toEqual({ telegram_id: CLIENT })
    expect(byName.crm_lead_context).toEqual({ chat: CLIENT })
    expect(byName.crm_lead_media).toEqual({ lead: CLIENT })
  })

  it('renders profile marks, plan progress, duets, touches, media and messages', async () => {
    serve()
    await draw()
    const text = String(host.textContent)

    // Profile: has_profile yes, has_soul no, three skills (one given as an object).
    const marks = [...host.querySelectorAll('.crm-client__marks dd')].map(
      d => `${d.getAttribute('data-mark')}:${d.textContent}`
    )
    expect(marks).toEqual(['yes:✓', 'no:—', 'yes:3'])
    expect(text).toContain('plan')

    // Plan: done/total and a bar whose width is the share done.
    expect(text).toContain('crm.client.plan.progress:2,6')
    const bar = host.querySelector<HTMLSpanElement>('.crm-client__bar > span')!
    expect(bar.style.width).toBe('33%')
    expect(text).toContain('GoalOnlyTitle')

    // Duets: state, paid calls, media, coverage as tool: ok/calls, counts.
    expect(text).toContain('crm.client.duets.state.done')
    expect(text).toContain('reel_render: 2/3')
    expect(host.querySelector('.crm-client__chip--fail')?.textContent).toBe(
      'reel_render: 2/3'
    )
    const duet = host.querySelector('.crm-client__duet')!.textContent!
    expect(duet).toContain('crm.client.duets.paid 1')
    expect(duet).toContain('crm.client.duets.media 2')
    expect(duet).toContain('crm.client.duets.violations 1')
    expect(duet).toContain('crm.client.duets.voice 2')

    // Touches and stage.
    expect(text).toContain('crm.stage.talking')
    expect(text).toContain('crm.wait.ours')
    expect(text).toContain('crm.act.replied')
    expect(text).toContain('asked price')

    // Media: kind, name, date.
    expect(text).toContain('photo')
    expect(text).toContain('MediaOnlyName.jpg')
    expect(text).toContain('09.09')

    // Last messages, with who said what.
    expect(text).toContain('LeadSaidThis')
    expect(text).toContain('WeSaidThat')
    expect(host.querySelector('.crm-client__dm--out')?.textContent).toContain(
      'WeSaidThat'
    )
    expect(text).toContain('crm.client.messages.waitingOnUs')

    // The header names the person, not the number, when a name is known.
    expect(text).toContain('crm.client.title:Geya')
    expect(text).toContain('@playom')
  })
})

describe('a panel that could not load says so', () => {
  it('an unreachable plan says unavailable and shows no zero progress', async () => {
    serve({ fail: ['crm_client_plan', 'crm_duet_runs'] })
    await draw()
    const text = String(host.textContent)
    const unavailable = text.split('crm.client.unreachable').length - 1
    expect(unavailable).toBe(2)
    expect(text).not.toContain('crm.client.plan.progress')
    expect(text).not.toContain('crm.client.duets.none')
    expect(host.querySelector('.crm-client__bar')).toBeNull()
    // The other four panels still stand.
    expect(text).toContain('LeadSaidThis')
    expect(text).toContain('MediaOnlyName.jpg')
    expect(text).toContain('crm.stage.talking')
  })

  it('an empty plan is stated as empty, which is different from unreachable', async () => {
    const saved = answers.crm_client_plan
    answers.crm_client_plan = {
      telegram_id: CLIENT,
      goals: [],
      items: [],
      total: 0,
      done: 0,
    }
    serve()
    await draw()
    expect(host.textContent).toContain('crm.client.empty')
    expect(host.textContent).not.toContain('crm.client.unreachable')
    answers.crm_client_plan = saved
  })
})

describe('the way into the conversation', () => {
  it('the primary button links to /crm/:clientId/chat and back to /crm', async () => {
    serve()
    await draw()
    const chat = host.querySelector<HTMLAnchorElement>('a.crm-client__chat')!
    expect(chat.textContent).toBe('crm.client.chatButton')
    expect(chat.getAttribute('href')).toBe(`/crm/${CLIENT}/chat`)
    const crumb = host.querySelector<HTMLAnchorElement>('a.crm-client__crumb')!
    expect(crumb.getAttribute('href')).toBe('/crm')
  })

  it('reads nothing that sends: only crm_* readers are called', async () => {
    serve()
    await draw()
    for (const c of calls) {
      expect(c.name).toMatch(/^crm_/)
      expect(['tg_send', 'tg_forward', 'crm_send', 'crm_touch']).not.toContain(
        c.name
      )
    }
  })
})
