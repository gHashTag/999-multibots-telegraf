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
 * EVIDENCE, NOT NAMES -- the same stance as job-hunters.ts. A name, a
 * username or a bio is a claim a person made about themselves, and the
 * ingest stores no bio at all (reading one is a Telegram call per person).
 * What a person WROTE is evidence: a language, a repository, a compiler, a
 * board. Two different groups of signs are the bar; one is "unknown", and
 * unknown is never filed as "not a programmer". "Not" is reserved for the
 * person's own words that they are not one.
 */
import * as SPEC from '../spec/course-outreach.gen'

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
} = SPEC

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
export function verdict(groups: number, negated: boolean): Verdict {
  if (negated) return 'not'
  if (groups >= SPEC.PROGRAMMER_BAR) return 'programmer'
  return 'unknown'
}

/** spec channel: a DM dialog the CRM holds is the only channel. */
export type Channel = 'telegram' | 'none'
export function channelOf(dmMessages: number): Channel {
  return dmMessages > 0 ? 'telegram' : 'none'
}

export type PitchState =
  | 'ok'
  | 'opted-out'
  | 'dropped'
  | 'refused'
  | 'not-programmer'
  | 'no-channel'
  | 'pitched-no-reply'

/** spec pitch_state: who may get a draft, in the spec's order of reasons. */
export function pitchState(f: {
  programmer: boolean
  hasChannel: boolean
  optedOut: boolean
  dropped: boolean
  refused: boolean
  pitched: boolean
  replied: boolean
}): PitchState {
  if (f.optedOut) return 'opted-out'
  if (f.dropped) return 'dropped'
  if (f.refused) return 'refused'
  if (!f.programmer) return 'not-programmer'
  if (!f.hasChannel) return 'no-channel'
  if (f.pitched && !f.replied) return 'pitched-no-reply'
  return 'ok'
}

/** spec number_ok: the only numbers a draft may say about the course. */
export function numberOk(n: number): boolean {
  return (
    n === SPEC.COURSE_LESSONS ||
    n === SPEC.WIDGETS_PER_LESSON ||
    n === SPEC.LAB_LESSONS
  )
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

/** spec draft_problem, over counts the host takes from the text. */
export function draftProblem(f: {
  chars: number
  courseLinks: number
  hashLinks: number
  strayNumbers: number
  hype: number
  namesWhy: boolean
}): DraftProblem {
  if (f.chars < SPEC.DRAFT_MIN_CHARS) return 'too-short'
  if (f.chars > SPEC.DRAFT_MAX_CHARS) return 'too-long'
  if (f.hashLinks > 0) return 'hash-link'
  if (f.courseLinks === 0) return 'no-link'
  if (f.strayNumbers > 0) return 'number'
  if (f.hype > 0) return 'hype'
  if (!f.namesWhy) return 'not-personal'
  return ''
}

/** spec batch_ok: one card carries one to BATCH_MAX drafts. */
export function batchOk(n: number): boolean {
  return n >= 1 && n <= SPEC.BATCH_MAX
}

/** spec may_send: THE GATE -- only the owner's Allow sends a batch. */
export function maySend(answer: unknown): boolean {
  return answer === 'allowed'
}

/** spec share_link_ok: a shared link never carries a #/ route. */
export function shareLinkOk(hasHashRoute: boolean): boolean {
  return !hasHashRoute
}

const HASH_ROUTE = /https?:\/\/[^\s#]*#\//gi

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
export function draftCounts(
  text: string,
  why: readonly string[]
): Parameters<typeof draftProblem>[0] {
  const raw = String(text ?? '')
  const courseLinks = raw.split(SPEC.COURSE_URL).length - 1
  const hashLinks = (raw.match(HASH_ROUTE) ?? []).length
  const prose = raw.replace(/https?:\/\/\S+/g, ' ')
  const numbers =
    prose.match(/(?<![\p{L}\p{N}_.,])\d+(?:[.,]\d+)?(?![\p{L}\p{N}_])/gu) ?? []
  const strayNumbers = numbers.filter(
    n => !numberOk(Number(n.replace(',', '.')))
  ).length
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

/** One message as classification needs it: who wrote it and the words. */
export interface WrittenBy {
  lead: string
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
  quotes: string[]
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
 * Only the other side's words come in (the SQL takes NOT "out"): the
 * owner's "you are a developer, right?" is a question, not evidence.
 */
export function classify(messages: readonly WrittenBy[]): Classified[] {
  type Row = {
    signs: Map<SignGroup, string>
    quotes: string[]
    negated: boolean
  }
  const by = new Map<string, Row>()
  for (const m of messages) {
    const id = String(m?.lead ?? '').trim()
    if (!/^\d{3,20}$/.test(id)) continue
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
          row.quotes.push(quoteOf(m.text, s.word))
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
