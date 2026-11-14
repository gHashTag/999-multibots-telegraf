/**
 * WHO AMONG THE OWNER'S CONTACTS IS A PROGRAMMER -- BY WHAT THEY WROTE --
 * AND WHAT A MESSAGE ABOUT THE COURSE MAY SAY TO THEM.
 *
 * Owner, 2026-10-09: "the agent should find every programmer in my contacts,
 * add them to the CRM and start telling all of them about this course on
 * every social network". The course is "From zero to a chip": 27 lessons,
 * one working widget each, then a lab of 3 (SOUL.md section 7).
 *
 * The rules and numbers live in the spec of record:
 * gHashTag/t27 specs/automation/course-outreach.t27 (vendored in ../spec).
 * This file is the host's half that can be tested without a session and
 * without anybody's real messages: the sign words, the verdict, the checks
 * on a draft. The tool (course-outreach-tool.ts) reads and writes.
 *
 * EVIDENCE, NOT NAMES -- the same stance as job-hunters.ts. A name or a
 * username is not evidence. What a person WROTE is: in a DM, in a shared
 * group, and (spec v2) in his own profile bio (crm-bios.ts reads it) or his
 * own LinkedIn headline / X bio (course-outreach-networks.ts). A language, a
 * repository, a compiler, a board. Two different groups of signs are the bar,
 * whatever the source; one is "unknown", and unknown is never filed as "not a
 * programmer". "Not" is reserved for the person's own words that they are
 * not one.
 */
import * as SPEC from '../spec/course-outreach.gen'
// Every fn of the spec runs from its compiled body (scripts/t27-logic.mjs;
// a str crosses the wasm boundary since #3941). This file writes no rule of
// its own: it types a str answer as the words the spec returns, and fits the
// text's counts to the spec's integer types.
import * as L from '../spec/course-outreach.logic'
/*
 * may_send: THE GATE -- only the owner's Allow sends a batch. own_words: his
 * DMs, a shared group, his own bio, his own headline (the owner's words about
 * him, his name and his username are not evidence). round_go: only a network
 * browser_logins calls signed in is opened. card_max / card_ok: a Telegram
 * card holds a batch; a network card holds one message. (v3)
 * network_day_cap / network_week_cap / network_may_send: how many messages a
 * network takes in a UTC day and in the last CAP_WEEK_DAYS days; a network
 * with no known caps has cap 0 and never sends.
 */
export {
  cardMax,
  cardOk,
  maySend,
  networkDayCap,
  networkMaySend,
  networkWeekCap,
  ownWords,
  roundGo,
} from '../spec/course-outreach.logic'

export const {
  COURSE_URL,
  COURSE_LESSONS,
  LAB_LESSONS,
  WIDGETS_PER_LESSON,
  CAMPAIGN,
  TAG,
  PROGRAMMER_BAR,
  HISTORY_ROWS,
  EVIDENCE_QUOTES,
  EVIDENCE_CHARS,
  DRAFT_MIN_CHARS,
  DRAFT_MAX_CHARS,
  BATCH_MAX,
  PENDING_TTL_MS,
  SEND_WAIT_MS,
  BIO_SOURCE,
  NETWORK_READ_MAX,
  NETWORK_SCROLLS,
  NETWORK_CARD_MAX,
  CAP_WEEK_DAYS,
} = SPEC

/** Where a piece of a person's text came from. */
export type Source = 'dm' | 'group' | 'bio' | 'headline' | 'owner' | 'name'

/** The networks the browser round reads, beside Telegram. */
export type Net = 'linkedin' | 'x'
export const NETS: readonly Net[] = ['linkedin', 'x']

/**
 * A lead id: a Telegram user id, or a network person as `linkedin:<slug>` /
 * `x:<handle>` (they are kept out of crm_people, whose ids are Telegram's).
 */
export function leadOk(id: string): boolean {
  return /^(?:\d{3,20}|linkedin:[A-Za-z0-9%_-]{1,100}|x:[A-Za-z0-9_]{1,15})$/.test(
    id
  )
}

/** The network of a lead id, or null for a Telegram one. Pure. */
export function netOf(lead: string): Net | null {
  const m = /^(linkedin|x):/.exec(String(lead ?? ''))
  return m ? (m[1] as Net) : null
}

/** spec network_verdict: a page that did not read, or read nobody, is unknown. */
export type NetVerdict = 'unknown' | 'none' | 'found'
export const networkVerdict = L.networkVerdict as (
  readOk: boolean,
  people: number,
  programmers: number
) => NetVerdict

/** spec network_channel: a LinkedIn connection, or an X person who follows him. */
export type NetChannel = Net | 'none'
export const networkChannel = L.networkChannel as (
  network: string,
  connection: boolean,
  followsOwner: boolean
) => NetChannel

export type SignGroup =
  | 'role'
  | 'language'
  | 'practice'
  | 'code_host'
  | 'hardware'

/**
 * The sign words. Latin entries are whole words (a plural or a verb ending
 * allowed), so "rust" does not fire on "trust"; Cyrillic entries are stems,
 * matched from a word start, so every case form counts. A group counts once
 * however many of its words appear.
 */
export const PROGRAMMER_SIGNS: ReadonlyArray<{
  group: SignGroup
  words: readonly string[]
}> = [
  {
    group: 'role',
    words: [
      'developer',
      'programmer',
      'software engineer',
      'backend',
      'frontend',
      'fullstack',
      'full-stack',
      'devops',
      'tech lead',
      'программист', // cyrillic-ok: a sign word people write
      'разработчик', // cyrillic-ok: a sign word people write
      'бэкенд', // cyrillic-ok: a sign word people write
      'бекенд', // cyrillic-ok: a sign word people write
      'фронтенд', // cyrillic-ok: a sign word people write
      'фулстек', // cyrillic-ok: a sign word people write
      'девопс', // cyrillic-ok: a sign word people write
      'тимлид', // cyrillic-ok: a sign word people write
    ],
  },
  {
    group: 'language',
    words: [
      'python',
      'javascript',
      'typescript',
      'golang',
      'rust',
      'kotlin',
      'swift',
      'c++',
      'c#',
      'java',
      'scala',
      'haskell',
      'elixir',
      'solidity',
      'zig',
      'php',
      'питон', // cyrillic-ok: a sign word people write
      'пайтон', // cyrillic-ok: a sign word people write
      'джаваскрипт', // cyrillic-ok: a sign word people write
    ],
  },
  {
    group: 'practice',
    words: [
      'pull request',
      'merge request',
      'code review',
      'commit',
      'repository',
      'repo',
      'deploy',
      'compiler',
      'refactor',
      'debug',
      'unit test',
      'коммит', // cyrillic-ok: a sign word people write
      'репозитор', // cyrillic-ok: a sign word people write
      'деплой', // cyrillic-ok: a sign word people write
      'компилятор', // cyrillic-ok: a sign word people write
      'рефактор', // cyrillic-ok: a sign word people write
      'дебаг', // cyrillic-ok: a sign word people write
      'пулл-реквест', // cyrillic-ok: a sign word people write
      'пул реквест', // cyrillic-ok: a sign word people write
      'код-ревью', // cyrillic-ok: a sign word people write
      'юнит-тест', // cyrillic-ok: a sign word people write
    ],
  },
  {
    group: 'code_host',
    words: [
      'github',
      'gitlab',
      'bitbucket',
      'codeberg',
      'stackoverflow',
      'leetcode',
      'codeforces',
      'гитхаб', // cyrillic-ok: a sign word people write
    ],
  },
  {
    group: 'hardware',
    words: [
      'fpga',
      'verilog',
      'vhdl',
      'risc-v',
      'asic',
      'stm32',
      'esp32',
      'arduino',
      'firmware',
      'плис', // cyrillic-ok: a sign word people write
      'микроконтроллер', // cyrillic-ok: a sign word people write
      'ардуино', // cyrillic-ok: a sign word people write
      'эмбеддед', // cyrillic-ok: a sign word people write
    ],
  },
]

/**
 * A person's own word that they are not a programmer. First person only:
 * "он не программист" is about somebody else.
 */
export const NOT_PROGRAMMER_PHRASES: readonly string[] = [
  'я не программист', // cyrillic-ok: a phrase people write
  'я не разработчик', // cyrillic-ok: a phrase people write
  'я не айтишник', // cyrillic-ok: a phrase people write
  'я далек от программирования', // cyrillic-ok: a phrase people write
  "i'm not a programmer",
  'i am not a programmer',
  "i'm not a developer",
  'i am not a developer',
]

/** Adjectives instead of numbers (SOUL.md section 7): refused in a draft. */
export const HYPE_WORDS: readonly string[] = [
  'best',
  'unique',
  'revolutionary',
  'amazing',
  'incredible',
  'world-class',
  'game-changer',
  'ultimate',
  'лучш', // cyrillic-ok: a stem the draft check refuses
  'уникальн', // cyrillic-ok: a stem the draft check refuses
  'революцион', // cyrillic-ok: a stem the draft check refuses
  'невероятн', // cyrillic-ok: a stem the draft check refuses
  'потрясающ', // cyrillic-ok: a stem the draft check refuses
]

/** Lowercased, with the one letter people write two ways folded. */
export function norm(text: unknown): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е') // cyrillic-ok: the one letter people write two ways
}

const LATIN = /^[a-z0-9 .+#-]+$/
const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
const compiled = new Map<string, RegExp>()

/**
 * The pattern for one sign word. Lookarounds, never `\b`: `\b` is an ASCII
 * boundary and silently matches nothing around a Cyrillic word (AGENTS.md 5).
 */
function patternOf(word: string): RegExp {
  const hit = compiled.get(word)
  if (hit) return hit
  const w = norm(word)
  const tail = /[a-z0-9]$/.test(w) ? '(?:s|es|ed|ing)?(?![\\p{L}\\p{N}_])' : ''
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}_])${escape(w)}${LATIN.test(w) ? tail : ''}`,
    'u'
  )
  compiled.set(word, re)
  return re
}

/** Does the text carry this word, by the rules above? Pure. */
export function hasWord(text: string, word: string): boolean {
  return patternOf(word).test(norm(text))
}

/** The sign groups a text carries, and the words that carried them. Pure. */
export function signsIn(
  text: string
): Array<{ group: SignGroup; word: string }> {
  const t = norm(text)
  if (!t) return []
  const out: Array<{ group: SignGroup; word: string }> = []
  for (const s of PROGRAMMER_SIGNS) {
    const word = s.words.find(w => patternOf(w).test(t))
    if (word) out.push({ group: s.group, word })
  }
  return out
}

/** Did the person write that they are not a programmer? Pure. */
export function negatedIn(text: string): boolean {
  const t = norm(text)
  return NOT_PROGRAMMER_PHRASES.some(p => t.includes(norm(p)))
}

/**
 * Every sign word and negation phrase as ILIKE patterns, so the DATABASE
 * returns only candidate rows (the job-hunters recipe): each with a
 * Capitalised twin, because ILIKE folds non-ASCII case only under a UTF-8
 * collation. The host decides after, by the rules above. Pure.
 */
export function candidatePatterns(): string[] {
  const esc = (w: string) => w.replace(/[\\%_]/g, m => `\\${m}`)
  const out = new Set<string>()
  const words = [
    ...PROGRAMMER_SIGNS.flatMap(s => s.words),
    ...NOT_PROGRAMMER_PHRASES,
  ]
  for (const w of words) {
    out.add(`%${esc(w)}%`)
    out.add(`%${esc(w.charAt(0).toUpperCase() + w.slice(1))}%`)
  }
  return [...out]
}

/** spec verdict: his own "not" first, then the bar, else unknown. */
export type Verdict = 'programmer' | 'not' | 'unknown'
export const verdict = L.verdict as (
  groups: number,
  negated: boolean
) => Verdict

/** spec channel: a DM dialog the CRM holds is the only channel. */
export type Channel = 'telegram' | 'none'
export const channelOf = L.channel as (dmMessages: number) => Channel

export type PitchState =
  | 'ok'
  | 'opted-out'
  | 'dropped'
  | 'refused'
  | 'not-programmer'
  | 'no-channel'
  | 'pitched-no-reply'

/** The facts spec pitch_state judges, by name. */
export interface PitchFacts {
  programmer: boolean
  hasChannel: boolean
  optedOut: boolean
  dropped: boolean
  refused: boolean
  pitched: boolean
  replied: boolean
}

/** spec pitch_state: who may get a draft, in the spec's order of reasons. */
// t27-plumbing: names pitch_state's seven bools; the compiled body decides
export function pitchStateOf(f: PitchFacts): PitchState {
  return L.pitchState(
    f.programmer,
    f.hasChannel,
    f.optedOut,
    f.dropped,
    f.refused,
    f.pitched,
    f.replied
  ) as PitchState
}

export type DraftProblem =
  | ''
  | 'too-short'
  | 'too-long'
  | 'hash-link'
  | 'no-link'
  | 'number'
  | 'hype'
  | 'not-personal'

/** The counts spec draft_problem judges, taken from a draft's text. */
export interface DraftCounts {
  chars: number
  courseLinks: number
  hashLinks: number
  strayNumbers: number
  hype: number
  namesWhy: boolean
}

/**
 * spec draft_problem, over the counts the host takes from the text. A count
 * past the spec's u16 / u8 is fitted to its ceiling, not thrown: every such
 * count is already past what the spec allows (DRAFT_MAX_CHARS, or a single
 * hash link, stray number or hype word), and the ceiling stays past it.
 */
// t27-plumbing: fits the text's counts to draft_problem's u16/u8; the compiled body decides
export function draftProblemOf(c: DraftCounts): DraftProblem {
  const u8 = (n: number) => Math.min(n, 0xff)
  return L.draftProblem(
    Math.min(c.chars, 0xffff),
    u8(c.courseLinks),
    u8(c.hashLinks),
    u8(c.strayNumbers),
    u8(c.hype),
    c.namesWhy
  ) as DraftProblem
}

const HASH_ROUTE = /https?:\/\/[^\s#]*#\//gi

/**
 * spec number_ok over a number as the text wrote it. A number the spec's u32
 * cannot hold (a fraction, or past its ceiling) is none of the course's
 * numbers: it is stray, not a thrown RangeError out of the compiled body.
 */
// t27-plumbing: fits the text's number to the spec's u32; number_ok decides
function courseNumber(written: string): boolean {
  const n = Number(written.replace(',', '.'))
  return Number.isInteger(n) && n >= 0 && n <= 0xffffffff && L.numberOk(n)
}

/** Whether a link is a #/ route a crawler reads as the home page. Pure. */
export function hasHashRoute(link: string): boolean {
  return new RegExp(HASH_ROUTE.source, 'i').test(String(link ?? ''))
}

/**
 * The counts draft_problem judges, taken from the text. Pure.
 *
 * Numbers inside links and letter-attached ones (t27, t27c, stm32) are not
 * claims; every other standalone number must be one the course page makes.
 * `why` is what the person wrote (their sign words): a draft that names
 * none of it is a broadcast, not a personal message.
 */
export function draftCounts(text: string, why: readonly string[]): DraftCounts {
  const raw = String(text ?? '')
  const courseLinks = raw.split(SPEC.COURSE_URL).length - 1
  const hashLinks = (raw.match(HASH_ROUTE) ?? []).length
  const prose = raw.replace(/https?:\/\/\S+/g, ' ')
  const numbers =
    prose.match(/(?<![\p{L}\p{N}_.,])\d+(?:[.,]\d+)?(?![\p{L}\p{N}_])/gu) ?? []
  const strayNumbers = numbers.filter(n => !courseNumber(n)).length
  const hype = HYPE_WORDS.filter(w => hasWord(prose, w)).length
  const t = norm(prose)
  const namesWhy = why.some(w => w && t.includes(norm(w)))
  return {
    chars: raw.trim().length,
    courseLinks,
    hashLinks,
    strayNumbers,
    hype,
    namesWhy,
  }
}

/** One piece of text as classification needs it: who, where, the words. */
export interface WrittenBy {
  lead: string
  text: string
  /** Where it was written; a DM when not said. Not own words: skipped. */
  source?: Source
}

/** A short quote of a person's own words, and where he wrote it. */
export interface Quote {
  source: Source
  text: string
}

export interface Classified {
  id: string
  verdict: Verdict
  /** Sign groups found, sorted, each counted once. */
  signs: SignGroup[]
  /** The words that carried them -- what a draft must name to be personal. */
  words: string[]
  /** Short quotes of their own words, data written by another person. */
  quotes: Quote[]
}

/** A short window of the text around the first sign word. Pure. */
function quoteOf(text: string, word: string): string {
  const flat = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  const at = Math.max(0, norm(flat).indexOf(norm(word)))
  const start = Math.max(0, at - Math.floor(SPEC.EVIDENCE_CHARS / 3))
  const piece = flat.slice(start, start + SPEC.EVIDENCE_CHARS)
  return (
    (start > 0 ? '…' : '') +
    piece +
    (start + SPEC.EVIDENCE_CHARS < flat.length ? '…' : '')
  )
}

/**
 * Every person whose own words were read, with a verdict. Pure.
 *
 * Only the other side's words count (spec own_words): the SQL takes NOT
 * "out", and a piece marked as the owner's, or as a name, is skipped here
 * too -- the owner's "you are a developer, right?" is a question, not
 * evidence. His own bio and headline count like his messages.
 */
export function classify(messages: readonly WrittenBy[]): Classified[] {
  type Row = {
    signs: Map<SignGroup, string>
    quotes: Quote[]
    negated: boolean
  }
  const by = new Map<string, Row>()
  for (const m of messages) {
    const id = String(m?.lead ?? '').trim()
    if (!leadOk(id)) continue
    const source: Source = m.source ?? 'dm'
    if (!L.ownWords(source)) continue
    const row: Row = by.get(id) ?? {
      signs: new Map<SignGroup, string>(),
      quotes: [],
      negated: false,
    }
    if (negatedIn(m.text)) row.negated = true
    for (const s of signsIn(m.text)) {
      if (!row.signs.has(s.group)) {
        row.signs.set(s.group, s.word)
        if (row.quotes.length < SPEC.EVIDENCE_QUOTES)
          row.quotes.push({ source, text: quoteOf(m.text, s.word) })
      }
    }
    by.set(id, row)
  }
  return [...by.entries()].map(([id, r]) => ({
    id,
    verdict: verdict(r.signs.size, r.negated),
    signs: [...r.signs.keys()].sort(),
    words: [...new Set(r.signs.values())].sort(),
    quotes: r.quotes,
  }))
}
