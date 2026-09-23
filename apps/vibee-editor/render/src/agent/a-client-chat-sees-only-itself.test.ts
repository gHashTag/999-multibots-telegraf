/**
 * A CLIENT'S CHAT SEES ONLY ITSELF (client-facing.ts).
 *
 * Production, 21.09.2026: a client asked the owner's business DM for a
 * currency exchanger and got a third person's @handle and phone number -- a
 * number this chat had never seen. The business surface listed the whole tool
 * registry, and every tg_* / crm_* tool opens whichever account the turn's
 * ctx resolves to.
 *
 * Proved here on the real loop with fake providers, all data invented:
 * the business surface neither lists nor runs the cross-chat tools, the
 * owner's surfaces keep them, and a contact this chat has not seen does not
 * reach the client -- the owner's and the client's own, the ones already said
 * here and bots' handles do.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAgent } from './chat'
import {
  CLIENT_SURFACE_DENY_REASON,
  CLIENT_SURFACE_TOOLS,
  CONTACT_WITHHELD_LINE,
  clientSurfaceDenial,
  closedToClients,
  contactsIn,
  createContactGuard,
} from './client-facing'
import { forgetProviderChoiceForTests } from './provider-choice'
import { forgetBreakersForTests } from './provider-breaker'
import { TOOLS_BY_NAME, toOpenAITools } from './tools'

const CLIENT = '900000011'
const THIRD_HANDLE = '@placeholder_changer'
const THIRD_PHONE = '+1 000 000 0042'
const THIRD_MAIL = 'someone.else@example.com'
const OWNER_PHONE = '10000000007'

function sse(deltas: Array<Record<string, unknown>>): Response {
  return new Response(
    [
      ...deltas.map(
        d => `data: ${JSON.stringify({ choices: [{ delta: d }] })}`
      ),
      'data: [DONE]',
      '',
    ].join('\n'),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
  )
}
const text = (t: string) => () => sse([{ content: t }])
const call = (name: string) => () =>
  sse([
    {
      tool_calls: [
        { index: 0, id: 'call_0', function: { name, arguments: '{}' } },
      ],
    },
  ])

/** One provider (glm) answering from a queue; every request body is kept. */
function provider(replies: Array<() => Response>) {
  const asked: any[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'))
      asked.push(body)
      const next = replies.shift()
      if (!next) return new Response('not scripted', { status: 500 })
      return next()
    })
  )
  return asked
}

function fakePool() {
  const sql: string[] = []
  return {
    sql,
    query: async (q: string) => {
      sql.push(q)
      if (/SELECT phone FROM tg_sessions/.test(q))
        return { rows: [{ phone: OWNER_PHONE }] }
      return { rows: [] }
    },
  }
}

async function turn(
  surface: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  pool = fakePool()
) {
  const events: Array<Record<string, unknown>> = []
  for await (const ev of runAgent(
    history,
    { telegramId: CLIENT, pool, turn: 't-contact' } as Parameters<
      typeof runAgent
    >[1],
    { surface }
  ))
    events.push(ev as Record<string, unknown>)
  const said = events
    .filter(e => e['тип'] === 'текст')
    .map(e => String(e['текст']))
    .join('')
  return { events, said, pool }
}

const ask = [{ role: 'user' as const, content: 'where can I change money?' }]

beforeEach(() => {
  vi.stubEnv('GLM_API_KEY', 'g')
  vi.stubEnv('NVIDIA_API_KEY', '')
  vi.stubEnv('AGENT_PROVIDER', '')
  vi.stubEnv('AGENT_MODEL', '')
  vi.stubEnv('RESERVE_BASE_URL', '')
  vi.stubEnv('OLLAMA_BASE_URL', '')
  vi.stubEnv('RAILWAY_SERVICE_QUEEN_OLLAMA_URL', '')
  vi.stubEnv('OLLAMA_ENABLED', '')
  vi.stubEnv('ZEP_API_URL', '')
  vi.stubEnv('ZEP_API_KEY', '')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  forgetProviderChoiceForTests()
  forgetBreakersForTests()
})

describe('tool availability by surface', () => {
  const all = [...TOOLS_BY_NAME.keys()]

  it('the business surface denies every tool that opens other people', () => {
    const d = clientSurfaceDenial('business', {}, all)
    for (const name of [
      'tg_contacts',
      'tg_search',
      'tg_history',
      'tg_read',
      'tg_dialogs',
      'tg_participants',
      'tg_common_chats',
      'tg_send',
      'crm_leads',
      'crm_lead_context',
      'crm_history',
      'crm_client_profile',
      'crm_summary',
      'browser_read',
      // Not prefixed like the readers above, and just as open onto others:
      // the farm journal, background-job payloads, anybody's SOUL by name.
      'hive_events',
      'hive_board',
      'hive_pulse',
      'inngest_runs',
      'inngest_run',
      'soul_of',
      'my_assets',
      'club_invoice',
    ]) {
      expect(TOOLS_BY_NAME.has(name), name).toBe(true)
      expect(d.denyTools?.has(name), name).toBe(true)
      expect(d.denyReasons?.get(name)).toBe(CLIENT_SURFACE_DENY_REASON)
    }
    for (const name of CLIENT_SURFACE_TOOLS) {
      expect(TOOLS_BY_NAME.has(name), name).toBe(true)
      expect(d.denyTools?.has(name) ?? false, name).toBe(false)
    }
    // Everything else in the registry is closed: an allowlist, not prefixes.
    expect(all.length - (d.denyTools?.size ?? 0)).toBe(
      CLIENT_SURFACE_TOOLS.size
    )
  })

  it("the owner's own surfaces keep every one of them", () => {
    for (const surface of ['bot', 'miniapp', 'ios', 'agent', undefined]) {
      const d = clientSurfaceDenial(surface, {}, all)
      expect(d.denyTools?.size ?? 0, String(surface)).toBe(0)
    }
  })

  it("a caller's own denial keeps its own reason", () => {
    const d = clientSurfaceDenial(
      'business',
      {
        denyTools: new Set(['tg_send', 'image_generate']),
        denyReasons: new Map([['tg_send', 'duet reason']]),
      },
      all
    )
    expect(d.denyReasons?.get('tg_send')).toBe('duet reason')
    expect(d.denyTools?.has('image_generate')).toBe(true)
  })

  it('a tool named later is closed until it is named here, whatever its prefix', () => {
    for (const name of [
      'tg_something_new',
      'browser_something_new',
      'crm_something_new',
      'mail_read',
      'zep_search',
      'hive_something_new',
    ]) {
      expect(closedToClients(name), name).toBe(true)
      expect(
        clientSurfaceDenial('business', {}, [name]).denyTools?.has(name),
        name
      ).toBe(true)
    }
    expect(closedToClients('image_generate')).toBe(false)
  })

  it('the listing a business turn sends to the model is exactly the client set', async () => {
    const asked = provider([text('ok')])
    await turn('business', ask)
    const listed: string[] = (asked[0]?.tools ?? []).map(
      (t: any) => t.function.name
    )
    expect([...listed].sort()).toEqual([...CLIENT_SURFACE_TOOLS].sort())
  })

  it('the listing an owner turn sends still has them', async () => {
    const asked = provider([text('ok')])
    await turn('bot', ask)
    const listed: string[] = (asked[0]?.tools ?? []).map(
      (t: any) => t.function.name
    )
    // Compact or full, the owner's listing is whatever the registry gives.
    const expected = toOpenAITools(undefined).map(t => t.function.name)
    expect(expected.filter(closedToClients).length).toBeGreaterThan(0)
    expect(listed.some(closedToClients)).toBe(true)
    expect(listed).toContain('hive_events')
  })

  it.each(['tg_contacts', 'hive_events', 'inngest_runs'])(
    'a closed call (%s) that arrives anyway is refused and never runs',
    async name => {
      const tool = TOOLS_BY_NAME.get(name)!
      const handler = vi.spyOn(tool, 'handler')
      provider([call(name), text('I will ask the owner.')])
      const { events } = await turn('business', ask)
      expect(handler).not.toHaveBeenCalled()
      const result = events.find(e => e['тип'] === 'результат') as any
      expect(result?.['значение']?.['отказано']).toBe(true)
    }
  )
})

describe('the outgoing contact guard', () => {
  it('finds phones, e-mails, handles and t.me links -- not amounts, dates or asset URLs', () => {
    const kinds = (s: string) => contactsIn(s).map(c => c.kind)
    expect(kinds(`call ${THIRD_PHONE}`)).toEqual(['phone'])
    expect(kinds(`mail ${THIRD_MAIL}`)).toEqual(['email'])
    expect(kinds(`write ${THIRD_HANDLE}`)).toEqual(['handle'])
    expect(kinds('open t.me/placeholder_changer')).toEqual(['handle'])
    expect(kinds('the club is 10 000 stars, 1 000 000 000 total')).toEqual([])
    expect(kinds('on 2026-09-22 at 14:57')).toEqual([])
    expect(
      kinds('https://cdn.example.com/u/900000011/1758552000123456.png')
    ).toEqual([])
  })

  it.each([
    ['https://wa.me/10000000099', 'phone'],
    ['wa.me/10000000099', 'phone'],
    ['https://api.whatsapp.com/send?phone=10000000099', 'phone'],
    ['whatsapp://send?phone=10000000099', 'phone'],
    ['viber://chat?number=%2B10000000099', 'phone'],
    ['https://t.me/+10000000099', 'phone'],
    ['https://signal.me/#p/+10000000099', 'phone'],
    ['tg://resolve?domain=placeholder_changer', 'handle'],
    ['tg://resolve?phone=10000000099', 'phone'],
    ['https://t.me/placeholder_changer', 'handle'],
    ['https://instagram.com/placeholder_changer', 'handle'],
    ['https://www.instagram.com/placeholder.changer/', 'handle'],
    ['instagram.com/stories/placeholder_changer/1', 'handle'],
    ['https://vk.com/placeholder_changer', 'handle'],
    ['https://m.vk.com/placeholder_changer', 'handle'],
    ['https://example.com/@placeholder_changer', 'handle'],
    ['https://example.com/contact?to=someone.else%40example.com', 'email'],
  ])('reads the person an address names: %s', (link, kind) => {
    expect(contactsIn(`Write here: ${link}.`).map(c => c.kind)).toContain(kind)
    const g = createContactGuard({ seen: ['hello'] })
    expect(g.check(`Write here: ${link}`)).toBe(CONTACT_WITHHELD_LINE)
  })

  it('an address that names nobody is not read as one', () => {
    for (const link of [
      'https://instagram.com/p/AbCdEf123',
      'https://vk.com/feed',
      'https://t.me/$AbCdEfGh1234567890',
      // A signed link's hex signature and a uuid carry long digit runs.
      'https://storage.example.com/b/r.mp4?X-Amz-Date=20260922T145700Z&X-Amz-Signature=0a1234567890123bcdef',
      'https://render.example.com/renders/1a2b3c4d-0000-4000-8000-123456789012.mp4',
      'https://example.com/news/2026-09-22/1234567890123',
    ]) {
      expect(contactsIn(link), link).toEqual([])
    }
  })

  it('our own asset addresses are not read at all', () => {
    const own = 'https://assets.example.com/u/+10000000099-agent-image.png'
    expect(contactsIn(own).map(c => c.kind)).toEqual(['phone'])
    vi.stubEnv('S3_PUBLIC_URL', 'https://assets.example.com')
    expect(contactsIn(own)).toEqual([])
  })

  it('an address the client already gave in this chat passes', () => {
    const g = createContactGuard({
      seen: ['client: my friend is at https://wa.me/10000000099'],
    })
    const fine = 'Yes, wa.me/10000000099 is the one.'
    expect(g.check(fine)).toBe(fine)
  })

  it('withholds a third party it has not seen, and tells only kinds', () => {
    const g = createContactGuard({ seen: ['hello'] })
    expect(g.check(`try ${THIRD_HANDLE}, ${THIRD_PHONE}`)).toBe(
      CONTACT_WITHHELD_LINE
    )
    expect(g.check(`or ${THIRD_MAIL}`)).toBe(CONTACT_WITHHELD_LINE)
    expect(g.withheld().sort()).toEqual(['email', 'handle', 'phone'])
  })

  it("lets through what this chat already said, the owner's own, and bots", () => {
    const g = createContactGuard({
      seen: [`client: my friend is ${THIRD_HANDLE}`],
      own: [`+${OWNER_PHONE}`],
    })
    const fine = `Yes, ${THIRD_HANDLE}. Or me: +1 000 000 0007. Pay in @placeholder_pay_bot`
    expect(g.check(fine)).toBe(fine)
    expect(g.withheld()).toEqual([])
  })

  it('on the business surface the client gets the honest line and the owner a note', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    provider([text(`Write to ${THIRD_HANDLE} or call ${THIRD_PHONE}.`)])
    const { said, pool } = await turn('business', ask)
    expect(said).toBe(CONTACT_WITHHELD_LINE)
    expect(said).not.toContain('placeholder_changer')
    const logged = error.mock.calls.find(c =>
      String(c[0]).includes('withheld from a client')
    )
    expect(logged).toBeTruthy()
    // The log carries kinds, never the value it withheld.
    expect(String(logged?.[1])).not.toContain('0042')
    expect(String(logged?.[1])).not.toContain('placeholder_changer')
    expect(pool.sql.some(q => q.includes('INSERT INTO hive_events'))).toBe(true)
  })

  it('on the business surface a messenger link to a third party is withheld', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    provider([text('The exchanger is here: https://wa.me/10000000099')])
    const { said } = await turn('business', ask)
    expect(said).toBe(CONTACT_WITHHELD_LINE)
  })

  it('a contact the client already has in this chat passes', async () => {
    provider([text(`Yes, ${THIRD_HANDLE} is the one.`)])
    const { said } = await turn('business', [
      { role: 'user', content: `is ${THIRD_HANDLE} reliable?` },
    ])
    expect(said).toBe(`Yes, ${THIRD_HANDLE} is the one.`)
  })

  it("the owner's own number passes", async () => {
    provider([text('Call me: +1 000 000 0007.')])
    const { said } = await turn('business', ask)
    expect(said).toBe('Call me: +1 000 000 0007.')
  })

  it("the owner's own surface is not filtered", async () => {
    provider([text(`Write to ${THIRD_HANDLE} or call ${THIRD_PHONE}.`)])
    const { said } = await turn('bot', ask)
    expect(said).toBe(`Write to ${THIRD_HANDLE} or call ${THIRD_PHONE}.`)
  })
})

/**
 * The bypasses and the false positive left after #2865, from issue #2875.
 * Every value here is invented: 9000000xx ids, placeholder handles, a number
 * in the +1 000 000 00xx block nobody owns.
 */
describe('the guard reads a contact written as prose', () => {
  const kinds = (s: string) => contactsIn(s).map(c => c.kind)

  it('a handle without the @, after the messenger it belongs to', () => {
    expect(kinds('Telegram: placeholder_changer')).toEqual(['handle'])
    expect(kinds('тг — placeholder_changer')).toEqual(['handle'])
    expect(kinds('Instagram: placeholder_changer')).toEqual(['handle'])
    expect(kinds('вк: placeholder_changer')).toEqual(['handle'])
    // The same person, however it is written: the key must match the @ form.
    expect(contactsIn('Telegram: placeholder_changer')[0].key).toBe(
      'placeholder_changer'
    )
  })

  it('prose that merely mentions a messenger is not a handle', () => {
    for (const line of [
      'Telegram support answers in a day',
      'write to me on Telegram',
      'insta-blogger is what he calls himself',
      'мы в телеграме отвечаем быстро',
    ]) {
      expect(kinds(line)).toEqual([])
    }
  })

  it('a prose handle is withheld from a client and passes once seen', async () => {
    provider([text('Ask him — Telegram: placeholder_changer')])
    const { said } = await turn('business', ask)
    expect(said).toBe(CONTACT_WITHHELD_LINE)

    provider([text('Yes, Telegram: placeholder_changer is the one.')])
    const seen = await turn('business', [
      { role: 'user', content: 'Telegram: placeholder_changer — надёжный?' },
    ])
    expect(seen.said).toBe('Yes, Telegram: placeholder_changer is the one.')
  })

  it('an 11-digit number grouped in threes is a number, not an amount', () => {
    expect(kinds('позвони 10 000 000 099')).toEqual(['phone'])
    // The same digits as the wa.me case above resolve to the same person.
    expect(contactsIn('позвони 10 000 000 099')[0].key).toBe(
      contactsIn('https://wa.me/10000000099')[0].key
    )
  })

  it('the amounts this business actually counts stay amounts', () => {
    expect(kinds('the club is 10 000 stars, 1 000 000 000 total')).toEqual([])
    expect(kinds('баланс 999 999 999 токенов')).toEqual([])
  })

  it('a date with a time is not a number to call', () => {
    // PHONE_RE has no colon in its character class, so this arrives at the
    // date check as "2026-09-22 15" -- ten digits.
    for (const line of [
      'созвон 2026-09-22 15:30',
      'созвон 2026.09.22 09:05',
      'созвон 22.09.2026 15:30',
      'созвон 2026-09-22T15:30',
      'созвон 2026-09-22 15:30:45',
    ]) {
      expect(kinds(line)).toEqual([])
    }
  })

  it('a date in the answer no longer replaces the whole answer', async () => {
    provider([text('Давайте созвонимся 2026-09-22 15:30.')])
    const { said } = await turn('business', ask)
    expect(said).toBe('Давайте созвонимся 2026-09-22 15:30.')
  })
})
