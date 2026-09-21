/**
 * THE AGENT TREE CARRIES NO PERSON (#2712).
 *
 * This repository is public. Until #2712, `src/agent/clients/` held three real
 * client dossiers -- a real telegram_id each, and the owner's private notes
 * about money, law and past incidents -- and four tools defaulted to one real
 * person's id, which reached every provider and /mcp tools/list through their
 * parameter descriptions. Packages now live in the render's database.
 *
 * The guards that keep it that way:
 *
 *   1. No file under src/agent contains a Telegram-like id -- a standalone run
 *      of 6-10 digits, or a -100... chat id -- unless it is an invented
 *      9000000xx fixture or a number listed below with what it is.
 *   2. No file under src/agent names a Telegram account -- an @handle or a
 *      t.me/<name> link -- unless it is a bot, a product channel, an invented
 *      example or a placeholder word, listed below with what it is.
 *   3. clients/ holds the synthetic example and nothing else, byte for byte.
 *      The realistic re-leak is not a dossier restored word for word but one
 *      with its id swapped and a few keys renamed; a pinned file set and a
 *      closed key set catch that, a list of forbidden keys does not.
 *
 * The allow-lists take only what is not a person. A person's id or handle,
 * even the operator's, does not belong in this tree: the operator's fallback
 * lives in src/platform-owner.ts. The one exception is PENDING_OWNER_DECISION
 * below -- named, capped, and shaped so that nothing else fits through it.
 */
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

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

/**
 * The only person ids the tree may still hold, each file with the exact
 * number of lines and the exact shape of those lines. Not an allow-list of
 * values: no id is written here, NOT_A_PERSON stays free of people, and a
 * line with a handle or a note beside the id does not fit the shape.
 *
 * club-guests.ts: the owner's club guests, added by #2744 after this guard
 * was written. Moving them changes who gets into the club -- CLUB_GUESTS is
 * empty on the render service, so deleting them puts two invited guests back
 * behind the paywall -- and that is the owner's call, not this change's. The
 * way out needs no code: put the ids into CLUB_GUESTS on the render service,
 * delete the two lines, then delete this entry. The count is exact, so the
 * entry cannot outlive the lines it excuses.
 */
const PENDING_OWNER_DECISION: Record<
  string,
  { lines: number; shape: RegExp; why: string }
> = {
  'club-guests.ts': {
    lines: 2,
    shape: /^ {2}'\d{6,10}', \/\/ an invited guest, by id \(#2744\)$/,
    why: 'club guests by id, #2744; where they live is the owner decision (#2712)',
  },
}

/**
 * A Telegram username: 5-32 characters, a letter first. Written as @name or
 * as a t.me/name link. Not an e-mail (d***@gmail.com), not an npm scope
 * (@typescript-eslint/..., @remotion/player).
 */
const HANDLE_LIKE =
  /(?:(?<![A-Za-z0-9_.@/*-])@|(?<![A-Za-z0-9_.])t\.me\/)([A-Za-z][A-Za-z0-9_]{4,31})(?![A-Za-z0-9_/-]|\.[A-Za-z]{2,})/g

/** Handles that are not a person -- lower case, each with what it is. */
const NOT_A_PERSON_HANDLE: Record<string, string> = {
  leela_chakra_ai_bot: 'the Leela Chakra game bot, a product (leela-canon.ts)',
  leelachakraapp: "the Leela Chakra game's public channel, a product",
  neuro_blogger_bot:
    'a bot of the platform farm, an alias example (bot-farm.ts)',
  t27ai_bot: "the platform's own cashier bot, a product",
  example_client: 'the invented handle of the synthetic clients/example',
  pilot_client: 'an invented recipient in a doc comment (crm-offer, proposals)',
  ourcommunity: 'an invented public channel in a doc comment (crm-offer-tool)',
  someone: 'a placeholder word in a prompt-injection example',
  username: 'a placeholder word ("@username")',
  usernames: 'a placeholder word ("@usernames")',
  handle: 'a placeholder word ("@handle")',
  joinchat: "Telegram's invite-link path (t.me/joinchat/...), not an account",
}

/** JSDoc and TSDoc tags: annotations, never an account. */
const DOC_TAGS = new Set([
  'deprecated',
  'param',
  'returns',
  'example',
  'throws',
  'internal',
  'override',
  'default',
  'remarks',
])

/**
 * Keys whose values were the owner's private notes about a person in the
 * deleted packages. Kept as a named list so the closed key set below can
 * never be widened with one of them.
 */
const PRIVATE_KEYS = [
  'open_money_question',
  'legal_note',
  'incidents',
  'relationship',
  'seller_notes',
  'how_to_work_with_her',
  'how_to_work_with_him',
  'open_work',
]

/**
 * Every key a bundled profile may use: exactly the keys of the synthetic
 * example. A package restored under a swapped id carries keys that are not
 * here, and fails by name.
 */
const PROFILE_KEYS = new Set([
  'telegram_id',
  'handle',
  'name',
  'not_name',
  'role',
  'status',
  'skill_prefix',
  'identity_rules',
  'business',
  'product',
  'surfaces',
  'languages',
  'audience_hypotheses',
  'discovery_questions',
  'how_to_work_with_them',
  'forbidden',
  'approved_cta',
  'text',
  'button',
  'content_plan',
  'goal',
  'intent',
  'template_id',
  'items',
  'title',
  'note',
])

/**
 * The bundled package, byte for byte (sha256, LF line endings). An edit to
 * the synthetic example is fine -- it describes nobody -- and costs one new
 * hash here, written by someone who looked at the file. A SOUL.md or skill
 * that grew a real handle, a "## legal_note" section or a quoted message
 * does not get in by accident.
 */
const BUNDLED: Record<string, string> = {
  'example/SOUL.md':
    'ebe65fa06d252be6143353b3b6953d41cfbd07976e45eca369b6685218c9a875',
  'example/profile.json':
    'cef765b9265b21778a56bf9f81e08955f87dfa932f9558716e980e21fb4004fc',
  'example/skills/example-first-answer.md':
    '3975bfb655af5d88d6bdbf040617853c58b2ce30123bc074d1c12304e6a969f4',
  'example/skills/example-post-drafting.md':
    '8570dcea8011745d3e769af2420aa6f72a6e3e498bc8a00968ede71a65b8e425',
}

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

/** Every handle in a text that is not a bot, a product or a placeholder. */
function personLikeHandles(text: string): string[] {
  const found: string[] = []
  for (const m of text.matchAll(HANDLE_LIKE)) {
    const v = m[1].toLowerCase()
    if (v in NOT_A_PERSON_HANDLE || DOC_TAGS.has(v)) continue
    found.push(m[1])
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

const posix = (p: string) => p.split(sep).join('/')
const sha256 = (f: string) =>
  createHash('sha256')
    .update(readFileSync(f, 'utf8').replace(/\r\n/g, '\n'))
    .digest('hex')

/** Where `find` hits, as file:line -- never the value: the report is public too. */
function linesWith(find: (line: string) => string[]): Map<string, number[]> {
  const hits = new Map<string, number[]>()
  for (const f of filesUnder(AGENT)) {
    const rel = posix(relative(AGENT, f))
    readFileSync(f, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (!find(line).length) return
        hits.set(rel, [...(hits.get(rel) ?? []), i + 1])
      })
  }
  return hits
}

describe('the scanners are not blind', () => {
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

  it('finds @handles and t.me links, and passes bots, e-mails, npm scopes and doc tags', () => {
    expect(personLikeHandles('the duet with @Some_Person all landed')).toEqual([
      'Some_Person',
    ])
    expect(personLikeHandles('card to @anyone_real);')).toEqual(['anyone_real'])
    expect(personLikeHandles("'Гостья (@a_real_name), '")).toEqual([
      'a_real_name',
    ])
    expect(personLikeHandles('write to https://t.me/a_real_name now')).toEqual([
      'a_real_name',
    ])
    expect(personLikeHandles('## @a_real_name\n')).toEqual(['a_real_name'])
    expect(
      personLikeHandles(
        'bot @leela_chakra_ai_bot, channel @LeelaChakraApp, d***@gmail.com, ' +
          '// eslint-disable @typescript-eslint/no-var-requires, ' +
          "import '@remotion/player', * @deprecated, t.me/joinchat/AbC, @abc"
      )
    ).toEqual([])
  })

  it('walks the whole agent tree, not an empty directory', () => {
    const files = filesUnder(AGENT).map(f => posix(relative(AGENT, f)))
    expect(files.length).toBeGreaterThan(50)
    expect(files).toContain('crm-client-setup-tool.ts')
    expect(files).toContain('clients/example/profile.json')
    expect(files).toContain('clients/example/SOUL.md')
  })

  it('every allow-listed number and handle says what it is', () => {
    for (const [n, why] of Object.entries(NOT_A_PERSON)) {
      expect(n).toMatch(/^\d{6,10}$/)
      expect(why.length).toBeGreaterThan(10)
    }
    for (const [h, why] of Object.entries(NOT_A_PERSON_HANDLE)) {
      expect(h).toMatch(/^[a-z][a-z0-9_]{4,31}$/)
      expect(why.length).toBeGreaterThan(10)
    }
    for (const [f, rule] of Object.entries(PENDING_OWNER_DECISION)) {
      expect(f).toMatch(/\.ts$/)
      expect(rule.lines).toBeGreaterThan(0)
      expect(rule.why).toMatch(/#\d+/)
    }
  })

  it('the closed key set can never be widened with a private key', () => {
    for (const k of PRIVATE_KEYS) expect(PROFILE_KEYS.has(k)).toBe(false)
  })
})

describe('no person in src/agent', () => {
  it('no file carries a Telegram id outside the invented 9000000xx range', () => {
    const offenders: string[] = []
    for (const [file, lines] of linesWith(personLikeIds)) {
      const pending = PENDING_OWNER_DECISION[file]
      if (pending) continue
      for (const n of lines) offenders.push(`${file}:${n}`)
    }
    expect(offenders).toEqual([])
  })

  it('a file pending the owner decision holds exactly its count, in its shape, and nothing else', () => {
    const hits = linesWith(personLikeIds)
    for (const [file, rule] of Object.entries(PENDING_OWNER_DECISION)) {
      expect(
        existsSync(join(AGENT, file)),
        `${file} is gone: delete its entry`
      ).toBe(true)
      const lines = hits.get(file) ?? []
      const text = readFileSync(join(AGENT, file), 'utf8').split('\n')
      const misshapen = lines.filter(n => !rule.shape.test(text[n - 1]))
      expect(misshapen.map(n => `${file}:${n}`)).toEqual([])
      // Exact, not "at most": when the owner moves the ids, this entry must go.
      expect(
        lines.length,
        `${file}: ${lines.length} id lines; the entry says ${rule.lines}`
      ).toBe(rule.lines)
    }
  })

  it('no file names a Telegram account that is not a bot, a product or a placeholder', () => {
    const offenders: string[] = []
    for (const [file, lines] of linesWith(personLikeHandles))
      for (const n of lines) offenders.push(`${file}:${n}`)
    expect(offenders).toEqual([])
  })
})

describe('clients/ is the synthetic example and nothing else', () => {
  it('holds exactly the pinned files, byte for byte', () => {
    const files = filesUnder(CLIENTS)
      .map(f => posix(relative(CLIENTS, f)))
      .sort()
    expect(files).toEqual(Object.keys(BUNDLED).sort())
    for (const [f, hash] of Object.entries(BUNDLED))
      expect(sha256(join(CLIENTS, f)), `${f} changed`).toBe(hash)
  })

  it('every bundled profile uses only the keys of the synthetic example', () => {
    const profiles = filesUnder(CLIENTS).filter(f => f.endsWith('.json'))
    expect(profiles.length).toBeGreaterThan(0)
    for (const f of profiles) {
      const keys = keysDeep(JSON.parse(readFileSync(f, 'utf8')))
      const foreign = [...new Set(keys)].filter(k => !PROFILE_KEYS.has(k))
      expect(foreign, `${posix(relative(AGENT, f))} carries`).toEqual([])
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
