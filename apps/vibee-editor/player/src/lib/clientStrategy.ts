/**
 * WHAT TO DO NEXT WITH THIS PERSON, DERIVED FROM FACTS.
 *
 * The card beside a client conversation used to list facts and leave the
 * owner to turn them into a move. The moves are not a mystery -- the seller's
 * own rules say them (crm-memory-tools `how_to_read`, the sweep briefs): an
 * answer before a sale, the portrait first, nothing offered to somebody who
 * said no, a quiet person gets one soft touch and not a campaign. This module
 * writes those rules down once, as a pure function, so the card can show the
 * next move and hand it to the agent in one press.
 *
 * NOTHING HERE SENDS ANYTHING. A move is a question for the agent in THIS
 * conversation; the agent proposes, the owner confirms. The screen never
 * writes to a client by itself.
 *
 * Pure, no React, no fetch: tested in clientStrategy.test.ts.
 */

export type Temperature = 'hot' | 'warm' | 'cold' | 'unknown'

export interface StrategyInput {
  stage: string | null
  waitingOnUs: boolean | null
  lastInbound: string | null
  lastOutbound: string | null
  signals: string[]
  intentScore: number | null
  balanceTokens: number | null
  portrait: { given: boolean; drawing: boolean; ready: boolean } | null
  assistantOff: boolean
  hasSoul: boolean
  hasProfile: boolean
  planTotal: number | null
  planDone: number | null
}

export interface Move {
  /** Stable id: the dictionary key is `crm.move.<id>` and `.ask`. */
  id: MoveId
  /** `urgent` is drawn first and loud; `normal` is a suggestion. */
  tone: 'urgent' | 'normal' | 'stop'
}

export type MoveId =
  | 'ownerOnly'
  | 'refused'
  | 'answer'
  | 'objection'
  | 'close'
  | 'portraitSend'
  | 'portraitGive'
  | 'discovery'
  | 'topUp'
  | 'nextPlanItem'
  | 'buildPlan'
  | 'nudge'
  | 'winback'
  | 'later'
  | 'writeSoul'
  | 'firstTouch'

const DAY = 24 * 60 * 60 * 1000

/** Whole days between an ISO moment and now; null when unparseable. */
export function daysSince(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((now - t) / DAY))
}

/**
 * Hot / warm / cold from the buying words the server already found. An
 * objection cools whatever else was said; nothing said at all is `unknown`,
 * not `cold` -- silence is not a verdict.
 */
export function temperatureOf(
  intentScore: number | null,
  signals: string[]
): Temperature {
  if (intentScore === null && signals.length === 0) return 'unknown'
  const score = intentScore ?? 0
  if (signals.includes('objection') && score <= 1) return 'cold'
  if (score >= 4 || (signals.includes('buy') && signals.includes('price')))
    return 'hot'
  if (score >= 2) return 'warm'
  return 'cold'
}

/**
 * The ordered moves, most important first, at most three. The ORDER is the
 * strategy, and it is not negotiable by a nicer-looking button:
 *
 *  1. They switched the assistant off, or said no -> stop. Nothing else.
 *  2. They are waiting for us -> answer first, sell after.
 *  3. Buying words -> close; an objection -> work the objection.
 *  4. The gift (portrait) before any offer.
 *  5. Then the slower moves: discovery, plan, top-up, a soft nudge.
 */
export function nextMoves(
  x: StrategyInput,
  now = Date.now(),
  experience: MoveExperience | null = null
): Move[] {
  if (x.assistantOff) return [{ id: 'ownerOnly', tone: 'stop' }]
  if (x.stage === 'refused') return [{ id: 'refused', tone: 'stop' }]

  const moves: Move[] = []
  const add = (id: MoveId, tone: Move['tone'] = 'normal') => {
    if (!moves.some(m => m.id === id)) moves.push({ id, tone })
  }

  const temp = temperatureOf(x.intentScore, x.signals)
  const theirQuiet = daysSince(x.lastInbound, now)
  const ourQuiet = daysSince(x.lastOutbound, now)
  const paid = x.stage === 'client' || x.stage === 'winback'

  if (x.waitingOnUs) add('answer', 'urgent')
  if (x.signals.includes('objection')) add('objection')
  if (temp === 'hot' && !paid) add('close', x.waitingOnUs ? 'normal' : 'urgent')

  if (x.portrait?.ready && !x.portrait.given) add('portraitSend', 'urgent')
  else if (x.portrait && !x.portrait.given && !x.portrait.drawing)
    add('portraitGive')

  if (x.stage === 'later') add('later')
  if (x.stage === 'winback') add('winback')

  if (paid && x.balanceTokens !== null && x.balanceTokens < 50) add('topUp')
  if (x.planTotal && x.planDone !== null && x.planDone < x.planTotal)
    add('nextPlanItem')
  else if (paid && !x.planTotal) add('buildPlan')

  if (!x.hasProfile && !paid) add('discovery')

  // We wrote last and they have been quiet: one soft touch, not a campaign.
  if (
    !x.waitingOnUs &&
    ourQuiet !== null &&
    ourQuiet >= 3 &&
    (theirQuiet === null || theirQuiet >= ourQuiet)
  )
    add('nudge')

  if (x.stage === 'new' && x.lastOutbound === null) add('firstTouch')
  if (!x.hasSoul) add('writeSoul')

  return rankByExperience(moves, experience).slice(0, 3)
}

/**
 * WHAT THIS OWNER'S CLIENTS DID AFTER EACH MOVE (render crm-move-stats.ts).
 *
 * The rules above say WHICH moves are allowed; experience only says which of
 * the allowed ones to try first. So an `urgent` or `stop` move never moves --
 * "answer first" cannot be out-voted by statistics -- and only the `normal`
 * slots are reordered among themselves, by score, once a move has been used
 * MIN_MOVE_USES times. Fewer uses than that is an anecdote, and keeps its
 * rule order (score 0), so a proven loser sinks below an untried move.
 */
export interface MoveStat {
  used: number
  replied: number
  bought: number
  refused: number
  score: number
}
export type MoveExperience = Record<string, MoveStat>

export const MIN_MOVE_USES = 3

/** The score a move is ranked by: 0 until it has been tried enough. */
export function provenScore(
  experience: MoveExperience | null,
  id: string
): number {
  const s = experience?.[id]
  return s && s.used >= MIN_MOVE_USES ? s.score : 0
}

export function rankByExperience(
  moves: Move[],
  experience: MoveExperience | null
): Move[] {
  if (!experience) return moves
  const slots = moves
    .map((m, i) => (m.tone === 'normal' ? i : -1))
    .filter(i => i >= 0)
  const ranked = slots
    .map(i => moves[i])
    .map((m, order) => ({ m, order, score: provenScore(experience, m.id) }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(r => r.m)
  const out = [...moves]
  slots.forEach((slot, k) => (out[slot] = ranked[k]))
  return out
}

/**
 * The package keys a seller must see before writing, in the order that
 * matters (mirrors PROMPT_PRIORITY on the server: the name they are NOT and
 * the things never to say come first). `how_to_work_with_` is a prefix.
 */
const HIGHLIGHT_KEYS = [
  'forbidden',
  'forbidden_claims',
  'open_money_question',
  'how_to_work_with_',
  'not_name',
  'role',
  'business',
  'relationship',
  'open_work',
  'approved_cta',
  'cta',
]

/** Keys whose content is a warning, drawn in the warning colour. */
export const WARNING_KEYS = new Set([
  'forbidden',
  'forbidden_claims',
  'open_money_question',
  'not_name',
])

export interface Highlight {
  key: string
  text: string
  warning: boolean
}

/** A value of an unknown shape, flattened to one readable line. */
function flatten(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return v.map(flatten).filter(Boolean).join(' · ')
  if (typeof v === 'object')
    return Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => {
        const s = flatten(x)
        return s ? `${k}: ${s}` : ''
      })
      .filter(Boolean)
      .join(' · ')
  return ''
}

/**
 * What of a free-form client package goes on the card: the known keys first,
 * in priority order, each cut to `max` characters. Unknown keys stay on the
 * client's own screen; the card is for the few that change the next message.
 */
export function profileHighlights(
  profile: Record<string, unknown> | null,
  limit = 5,
  max = 220
): Highlight[] {
  if (!profile) return []
  const out: Highlight[] = []
  for (const want of HIGHLIGHT_KEYS) {
    const keys = want.endsWith('_')
      ? Object.keys(profile).filter(k => k.startsWith(want))
      : want in profile
        ? [want]
        : []
    for (const key of keys) {
      const text = flatten(profile[key])
      if (!text) continue
      out.push({
        key,
        text: text.length > max ? `${text.slice(0, max - 1)}…` : text,
        warning: WARNING_KEYS.has(key),
      })
      if (out.length >= limit) return out
    }
  }
  return out
}
