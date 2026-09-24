/**
 * WHICH OF THE PERSON'S CONTACTS ARE RECRUITERS -- BY WHAT THEY WROTE.
 *
 * Owner, 2026-09-24: "the job agent must know every hunter in my contacts."
 *
 * THE TEMPTING VERSION IS THE WRONG ONE. A name, a username or a bio can be
 * read in a millisecond and says nothing: "HR" in a display name is a claim
 * the person made about themselves, and a recruiter who writes from a
 * personal account has none of it. Guessing from names would also mean this
 * file deciding things about real people from their names, which is exactly
 * the kind of judgement it must not make.
 *
 * So the evidence is what was WRITTEN in the dialog: an invitation, a
 * vacancy, a rate, an interview. Two languages, because the person's
 * contacts write in both, and a single word is never enough -- "position"
 * and "роль" occur in ordinary conversation constantly.
 *
 * Everything here is pure. The network part (reading dialogs) lives in the
 * tool; the decision lives here, where it can be tested without a session
 * and without anybody's real messages.
 */

/** One message as this file needs it: who wrote it, when, and the text. */
export interface HunterMessage {
  /** The contact's telegram id, as a string. Never a name. */
  from: string
  /** Seconds since the epoch, as Telegram gives them. */
  at: number
  text: string
  /** True when the OWNER wrote it -- his own words are not evidence. */
  mine?: boolean
}

/**
 * The words that mean somebody is hiring, in the two languages the person's
 * contacts use.
 *
 * Grouped, and a group counts ONCE: "вакансия ... вакансия ... вакансия" is
 * one person saying one thing three times, not three reasons to believe.
 * Two DIFFERENT groups are the bar -- measured against the failure it is
 * shaped for: "какая у тебя ставка?" alone is a friend asking about money.
 */
export const HUNTER_SIGNS: ReadonlyArray<{
  group: string
  words: readonly string[]
}> = [
  {
    group: 'vacancy',
    words: ['вакансия', 'вакансии', 'вакансию', 'vacancy', 'job opening'],
  },
  {
    group: 'hiring',
    words: [
      'ищем',
      'ищу разработчика',
      'hiring',
      "we're looking for",
      'we are looking for',
    ],
  },
  {
    group: 'resume',
    words: ['резюме', 'cv', 'портфолио', 'resume'],
  },
  {
    group: 'interview',
    words: ['собеседование', 'интервью', 'interview', 'созвон по вакансии'],
  },
  {
    group: 'offer',
    words: ['оффер', 'offer', 'предложение о работе', 'job offer'],
  },
  {
    group: 'rate',
    words: [
      'ставка',
      'вилка',
      'зарплат',
      'salary',
      'rate per hour',
      'compensation',
    ],
  },
  {
    group: 'recruiter',
    words: [
      'рекрутер',
      'recruiter',
      'talent acquisition',
      'хедхантер',
      'headhunter',
    ],
  },
]

/** How many DIFFERENT groups must appear before a contact is called a hunter. */
export const HUNTER_BAR = 2

export interface Hunter {
  /** The contact's telegram id. An id, never a name. */
  id: string
  /** Which groups of words were found, sorted, so the answer is checkable. */
  signs: string[]
  /** When they last wrote, seconds since the epoch. */
  lastAt: number
  /** How many of their messages were read to decide this. */
  messages: number
}

/** Lowercased once; the words are matched as substrings, so forms count. */
function signsIn(text: string): string[] {
  const t = String(text ?? '').toLowerCase()
  if (!t) return []
  const found: string[] = []
  for (const s of HUNTER_SIGNS)
    if (s.words.some(w => t.includes(w))) found.push(s.group)
  return found
}

/**
 * Who, among these messages, is hiring. Pure.
 *
 * The owner's own messages are skipped: a person who wrote "я ищу работу" to
 * ten friends would otherwise turn all ten into recruiters.
 */
export function huntersFrom(messages: readonly HunterMessage[]): Hunter[] {
  const by = new Map<
    string,
    { signs: Set<string>; lastAt: number; n: number }
  >()
  for (const m of messages) {
    if (m?.mine) continue
    const id = String(m?.from ?? '').trim()
    if (!id) continue
    const row = by.get(id) ?? { signs: new Set<string>(), lastAt: 0, n: 0 }
    row.n += 1
    row.lastAt = Math.max(row.lastAt, Number(m.at) || 0)
    for (const s of signsIn(m.text)) row.signs.add(s)
    by.set(id, row)
  }
  return [...by.entries()]
    .filter(([, r]) => r.signs.size >= HUNTER_BAR)
    .map(([id, r]) => ({
      id,
      signs: [...r.signs].sort(),
      lastAt: r.lastAt,
      messages: r.n,
    }))
    .sort((a, b) => b.lastAt - a.lastAt)
}
