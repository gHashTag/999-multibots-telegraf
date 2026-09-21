/**
 * THE AGENT TREE CARRIES NO PERSON (#2712).
 *
 * This repository is public. Until #2712, `src/agent/clients/` held three real
 * client dossiers -- a real telegram_id each, and the owner's private notes
 * about money, law and past incidents -- and four tools defaulted to one real
 * person's id, which reached every provider and /mcp tools/list through their
 * parameter descriptions. Packages now live in the render's database.
 *
 * Two guards keep it that way:
 *
 *   1. No file under src/agent contains a Telegram-like id -- a standalone run
 *      of 6-10 digits, or a -100... chat id -- unless it is an invented
 *      9000000xx fixture or a number listed below with what it is.
 *   2. No package under clients/ carries the keys that hold private notes.
 *
 * The allow-list takes only numbers that are not a person. A person's id,
 * even the operator's, does not belong in this tree: the operator's fallback
 * lives in src/platform-owner.ts.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const AGENT = join(__dirname, 'src', 'agent')
const CLIENTS = join(AGENT, 'clients')

/** User and basic-group ids (6-10 digits), and supergroup/channel ids. */
const TELEGRAM_LIKE = /(?<![0-9A-Za-z.])(-100\d{9,10}|\d{6,10})(?![0-9A-Za-z])/g
/** The invented range every fixture in this repository uses. */
const INVENTED = /^9000000\d\d$/

/** Numbers that look like ids and are not a person -- each with what it is. */
const NOT_A_PERSON: Record<string, string> = {
  '777000':
    "Telegram's service-notifications account (login codes): a system peer",
  '333000': 'a Telegram system peer the dialog filter skips (SERVICE_IDS)',
  '1087968824': "Telegram's GroupAnonymousBot: a system peer",
  '136817688': "Telegram's Channel_Bot: a system peer",
  '100000': 'the measured one-off Stars invoice ceiling (token-packs.ts)',
  '150000': 'the first refused one-off Stars amount (token-packs.ts)',
  '2592000': 'thirty days in seconds, the subscription period (token-packs.ts)',
  '200000': 'a line ceiling for one read (crm-tools.ts)',
  '86400000': 'one day in milliseconds',
  '250304': 'a model version date, cogview-4-250304 (pricing.ts)',
}

/** Keys whose values are the owner's private notes about a person. */
const PRIVATE_KEYS = [
  'open_money_question',
  'legal_note',
  'incidents',
  'relationship',
  'seller_notes',
]

function filesUnder(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...filesUnder(p))
    else out.push(p)
  }
  return out
}

/** Every id-shaped number in a text that is neither invented nor explained. */
function personLikeIds(text: string): string[] {
  const found: string[] = []
  for (const m of text.matchAll(TELEGRAM_LIKE)) {
    const v = m[1]
    if (INVENTED.test(v) || v in NOT_A_PERSON) continue
    found.push(v)
  }
  return found
}

function keysDeep(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) for (const x of v) keysDeep(x, out)
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) {
      out.push(k)
      keysDeep(x, out)
    }
  return out
}

describe('the scanner is not blind', () => {
  it('finds user, group and channel ids, and passes invented ids, timestamps and phone-length numbers', () => {
    expect(personLikeIds(`const X = '123456789'`)).toEqual(['123456789'])
    expect(personLikeIds('chat -1001234567890 here')).toEqual([
      '-1001234567890',
    ])
    expect(personLikeIds('group -987654321')).toEqual(['987654321'])
    expect(personLikeIds('id=5123456 and (7123456789)')).toEqual([
      '5123456',
      '7123456789',
    ])
    // Invented, a 13-digit millisecond timestamp in a file name, an 11-digit
    // phone placeholder, a hash fragment, a decimal, a known system peer.
    expect(
      personLikeIds(
        "'900000001' /1789924235674-x.png +79991234567 a1b2c3d4 0.1234567 777000"
      )
    ).toEqual([])
  })

  it('walks the whole agent tree, not an empty directory', () => {
    const files = filesUnder(AGENT).map(f => relative(AGENT, f))
    expect(files.length).toBeGreaterThan(50)
    expect(files).toContain('crm-client-setup-tool.ts')
    expect(files).toContain(join('clients', 'example', 'profile.json'))
  })

  it('every allow-listed number says what it is', () => {
    for (const [n, why] of Object.entries(NOT_A_PERSON)) {
      expect(n).toMatch(/^\d{6,10}$/)
      expect(why.length).toBeGreaterThan(10)
    }
  })
})

describe('no person in src/agent', () => {
  it('no file carries a Telegram id outside the invented 9000000xx range', () => {
    const offenders: string[] = []
    for (const f of filesUnder(AGENT)) {
      const lines = readFileSync(f, 'utf8').split('\n')
      lines.forEach((line, i) => {
        // Report where, never the number itself: the report is public too.
        if (personLikeIds(line).length)
          offenders.push(`${relative(AGENT, f)}:${i + 1}`)
      })
    }
    expect(offenders).toEqual([])
  })

  it('no package under clients/ carries the keys that hold private notes', () => {
    const profiles = filesUnder(CLIENTS).filter(f => f.endsWith('.json'))
    expect(profiles.length).toBeGreaterThan(0)
    for (const f of profiles) {
      const keys = keysDeep(JSON.parse(readFileSync(f, 'utf8')))
      for (const k of PRIVATE_KEYS)
        expect(keys, `${relative(AGENT, f)} carries ${k}`).not.toContain(k)
    }
  })

  it('every bundled package names an invented person', () => {
    for (const dir of readdirSync(CLIENTS)) {
      const profile = JSON.parse(
        readFileSync(join(CLIENTS, dir, 'profile.json'), 'utf8')
      )
      expect(String(profile.telegram_id)).toMatch(INVENTED)
    }
  })
})
