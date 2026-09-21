import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  cleanName,
  forgetName,
  nameFromChat,
  NAME_MAX,
  NAME_TTL_MS,
  telegramName,
} from './src/browser/telegram-name'
import { rewriteLoginBody, swapLoginQuery } from './src/browser/live-pipe'
import {
  DEFAULT_DISPLAY_NAME,
  LOGIN_PLACEHOLDER,
} from './src/browser/live-proxy'

/**
 * THE WINDOW KNOWS WHO IS IN IT, BY THE NAME THEY GO BY IN TELEGRAM.
 *
 * The person is signed in by Telegram already; what the window lacked was
 * their name. It goes into the pod login on the server side, beside the
 * password, and nowhere the page or a log could carry it.
 */

const PERSON = '900000001'
const TOKEN = 'bot-token-x'
const SWAPPED = 'swapped-in'

function answering(body: unknown, seen: string[] = []) {
  return (async (url: string) => {
    seen.push(String(url))
    return { json: async () => body } as Response
  }) as unknown as typeof fetch
}

beforeEach(() => forgetName())

describe('the name comes from Telegram', () => {
  it('asks getChat for this person and takes the first name', async () => {
    const seen: string[] = []
    const name = await telegramName(
      PERSON,
      TOKEN,
      answering(
        { ok: true, result: { first_name: 'Aurora', username: 'aurora_x' } },
        seen
      )
    )
    expect(name).toBe('Aurora')
    expect(seen[0]).toContain(`/getChat?chat_id=${PERSON}`)
  })

  it('falls back to the username when there is no first name', () => {
    expect(nameFromChat({ ok: true, result: { username: 'aurora_x' } })).toBe(
      'aurora_x'
    )
  })

  it('takes nothing from an answer that is not ok', () => {
    expect(nameFromChat({ ok: false, result: { first_name: 'Nope' } })).toBe(
      null
    )
    expect(nameFromChat(null)).toBe(null)
  })

  it('asks once, then remembers -- a reload does not ask again', async () => {
    const seen: string[] = []
    const fetcher = answering({ ok: true, result: { first_name: 'A' } }, seen)
    await telegramName(PERSON, TOKEN, fetcher, 0)
    await telegramName(PERSON, TOKEN, fetcher, NAME_TTL_MS)
    expect(seen).toHaveLength(1)
    await telegramName(PERSON, TOKEN, fetcher, NAME_TTL_MS + 1)
    expect(seen).toHaveLength(2)
  })

  it('NEVER THROWS, and a failure costs the name, not the window', async () => {
    const broken = (async () => {
      throw new Error('timeout')
    }) as unknown as typeof fetch
    expect(await telegramName(PERSON, TOKEN, broken)).toBe(null)
  })

  it('does not remember a slow Telegram as "no name"', async () => {
    const seen: string[] = []
    const broken = (async (url: string) => {
      seen.push(url)
      throw new Error('timeout')
    }) as unknown as typeof fetch
    await telegramName(PERSON, TOKEN, broken)
    await telegramName(PERSON, TOKEN, broken)
    expect(seen).toHaveLength(2)
  })

  it('asks nobody without a token', async () => {
    const seen: string[] = []
    expect(await telegramName(PERSON, '', answering({}, seen))).toBe(null)
    expect(seen).toHaveLength(0)
  })
})

describe('what neko may show', () => {
  it('strips control characters and collapses whitespace', () => {
    expect(cleanName('  Au\u0000ro\nra \t X  ')).toBe('Aurora X')
  })

  it('removes the invisible direction marks that flip a line', () => {
    expect(cleanName('\u202eAurora')).toBe('Aurora')
  })

  it('cuts long names at a character, not in half of one', () => {
    const long = '\u{1F600}'.repeat(NAME_MAX + 5)
    const cut = cleanName(long)!
    expect(Array.from(cut)).toHaveLength(NAME_MAX)
    expect(cut).toBe('\u{1F600}'.repeat(NAME_MAX))
  })

  it('treats empty and non-text as no name', () => {
    expect(cleanName('   ')).toBe(null)
    expect(cleanName(42)).toBe(null)
  })
})

describe('the name goes in where the password goes in', () => {
  const ours = `/ws?password=${LOGIN_PLACEHOLDER}&username=${DEFAULT_DISPLAY_NAME}`

  it('puts the name into OUR socket login', () => {
    const out = new URLSearchParams(
      swapLoginQuery(ours, SWAPPED, 'Aurora').split('?')[1]
    )
    expect(out.get('password')).toBe(SWAPPED)
    expect(out.get('username')).toBe('Aurora')
  })

  it('keeps the page own name when there is none', () => {
    const out = new URLSearchParams(swapLoginQuery(ours, SWAPPED).split('?')[1])
    expect(out.get('username')).toBe(DEFAULT_DISPLAY_NAME)
  })

  it('touches no login that is not ours', () => {
    const typed = '/ws?password=typed-by-hand&username=someone'
    expect(swapLoginQuery(typed, SWAPPED, 'Aurora')).toBe(typed)
  })

  it('does the same in the REST login body', () => {
    const body = JSON.stringify({
      username: DEFAULT_DISPLAY_NAME,
      password: LOGIN_PLACEHOLDER,
    })
    expect(JSON.parse(rewriteLoginBody(body, SWAPPED, 'Aurora'))).toEqual({
      username: 'Aurora',
      password: SWAPPED,
    })
    expect(JSON.parse(rewriteLoginBody(body, SWAPPED)).username).toBe(
      DEFAULT_DISPLAY_NAME
    )
    const typed = JSON.stringify({ username: 'x', password: 'typed' })
    expect(rewriteLoginBody(typed, SWAPPED, 'Aurora')).toBe(typed)
  })
})

/**
 * THE WIRING, READ AS TEXT. The proxy target is listed field by field in
 * render-server.ts, and twice before a field added here was silently
 * dropped there -- the unit tests above all passed while production never
 * saw the value. This is structural, so it is checked structurally.
 */
describe('the server hands the name to the pipe', () => {
  const source = readFileSync(join(__dirname, 'render-server.ts'), 'utf8')

  function callBlock(name: string): string {
    const at = source.indexOf(`${name}(\n`)
    expect(at, `${name} call not found`).toBeGreaterThan(-1)
    return source.slice(at, source.indexOf('\n        req,', at))
  }

  it('on the socket, which is the login neko actually uses', () => {
    const block = callBlock('pipeUpgrade')
    expect(block).toMatch(
      /displayName:[\s\S]*telegramName\(decision\.telegramId\)/
    )
  })

  it('on the REST login too', () => {
    const block = callBlock('pipeHttp')
    expect(block).toMatch(
      /displayName:[\s\S]*telegramName\(decision\.telegramId\)/
    )
  })
})
