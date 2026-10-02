import { afterEach, describe, expect, it, vi } from 'vitest'
import { translations, type Language } from '@/atoms/language'
import { CRM_TOOL_CODES, crmErrorText } from './crmErrorText'

/** The dictionary's own lookup, as translateAtom does it. */
const tFor =
  (lang: Language) =>
  (key: string, vars?: Record<string, string | number>): string => {
    const line = translations[lang][key] || key
    return vars
      ? line.replace(/\{(\w+)\}/g, (w, n) => (n in vars ? String(vars[n]) : w))
      : line
  }
const say = (lang: Language, error: string | undefined, code?: string) =>
  crmErrorText({ error, code }, lang, tFor(lang))

const CYRILLIC = /\p{Script=Cyrillic}/u
// The server's refusal, as routes.ts sends it: written for a model, in Russian.
const SERVER_RU = 'Error: Нет ботов' // cyrillic-ok

describe('crmErrorText: what the CRM screen says when a tool call failed', () => {
  it('words callTool’s own failures in the reader’s language', () => {
    expect(say('en', 'HTTP 401', 'http_401')).toBe('the server answered 401')
    expect(say('en', 'empty answer', 'empty')).toBe('empty answer')
    expect(say('en', 'Failed to fetch', 'network')).toBe(
      'no connection to the server'
    )
    expect(say('en', 'Unexpected token <', 'bad_reply')).toBe(
      'the answer could not be read'
    )
    for (const code of ['http_401', 'empty', 'network', 'bad_reply']) {
      const ru = say('ru', 'x', code)
      expect(ru, code).toMatch(CYRILLIC)
      // A key printed as itself means the dictionary lacks it.
      expect(ru, code).not.toMatch(/^crm\./)
    }
  })

  it('keeps the status where the sign-in notice looks for it', () => {
    // refusalRules.isSignInReason reads 401/403 out of the worded reason.
    expect(say('en', 'HTTP 403', 'http_403')).toMatch(/\b403\b/)
    expect(say('ru', 'HTTP 401', 'http_401')).toMatch(/\b401\b/)
  })

  it('a named server refusal: English gets the sentence, Russian the server', () => {
    expect(say('en', SERVER_RU, 'no_bots')).toBe(CRM_TOOL_CODES.no_bots)
    expect(say('en', SERVER_RU, 'no_bots')).not.toMatch(CYRILLIC)
    expect(say('ru', SERVER_RU, 'no_bots')).toBe(SERVER_RU)
  })

  it('no English sentence is Russian or empty', () => {
    for (const [code, line] of Object.entries(CRM_TOOL_CODES)) {
      expect(line, code).not.toBe('')
      expect(line, code).not.toMatch(CYRILLIC)
    }
  })

  it('an unknown code: the server text when it is not Russian, else generic', () => {
    expect(say('en', 'quota exceeded', 'from_the_future')).toBe(
      'quota exceeded'
    )
    expect(say('en', SERVER_RU, 'from_the_future')).toBe('the server refused')
    expect(say('en', SERVER_RU, 'refused')).toBe('the server refused')
    expect(say('ru', SERVER_RU, 'from_the_future')).toBe(SERVER_RU)
    // A code that is an Object.prototype name is not a sentence.
    expect(say('en', SERVER_RU, 'toString')).toBe('the server refused')
  })

  it('a refusal with no text still says something', () => {
    expect(say('en', '', 'refused')).toBe('the server refused')
    expect(say('ru', '', 'refused')).toMatch(CYRILLIC)
  })

  it('no code: the text as it is, and nothing when nothing failed', () => {
    expect(say('en', 'whatever it was')).toBe('whatever it was')
    expect(say('en', undefined)).toBe('')
  })
})

describe('callTool names every failure', () => {
  afterEach(() => vi.unstubAllGlobals())

  const answer = (status: number, body: unknown) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(body), { status }))
    )

  it('reads error.data.code, keeps the message, marks it refused', async () => {
    const { loadOverview } = await import('./crm')
    answer(200, {
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32603, message: SERVER_RU, data: { code: 'no_bots' } },
    })
    const r = await loadOverview()
    expect(r).toMatchObject({
      reachable: false,
      data: null,
      error: SERVER_RU,
      code: 'no_bots',
      refused: true,
    })
  })

  it('an older server with no data.code is `refused`', async () => {
    const { loadOverview } = await import('./crm')
    answer(200, {
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32603, message: 'x' },
    })
    expect(await loadOverview()).toMatchObject({ code: 'refused', error: 'x' })
  })

  it('HTTP, empty, network and unreadable answers have their own codes', async () => {
    const { loadOverview } = await import('./crm')
    answer(500, {})
    expect(await loadOverview()).toMatchObject({
      code: 'http_500',
      error: 'HTTP 500',
    })
    answer(200, { jsonrpc: '2.0', id: 1, result: { content: [] } })
    expect(await loadOverview()).toMatchObject({ code: 'empty' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      })
    )
    expect(await loadOverview()).toMatchObject({
      code: 'network',
      error: 'Failed to fetch',
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>', { status: 200 }))
    )
    expect(await loadOverview()).toMatchObject({ code: 'bad_reply' })
  })
})
