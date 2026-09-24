/**
 * THE FIRST FIVE MINUTES OF A NEW CLUB MEMBER, IN THE ROOM EVERYBODY READS.
 *
 * Owner, 2026-09-24: "start the onboarding, and make a plan for new club
 * members so that everything is convenient at the start -- through the common
 * group, show your mega usefulness".
 *
 * ── THE ONE DECISION THIS FILE MAKES ───────────────────────────────────────
 *
 * A new member is shown a RESULT, not an explanation. Every onboarding that
 * begins "here is what I can do" is read as an advertisement and closed; the
 * one that begins with a thing made FOR THEM, in front of the others, is the
 * argument. So the sequence is: one question, one gift, one plan -- and the
 * order matters, because the gift is what buys the attention the plan needs.
 *
 * ── ONE QUESTION, NOT A FORM ───────────────────────────────────────────────
 *
 * The only thing asked is a single sentence about their own work. It is the
 * seed of their SOUL, it is the minimum the seller needs, and it is something
 * a person answers on a phone while walking. A form with five fields at the
 * door is how a club gets members who never finish joining.
 *
 * ── WHAT THE ROOM SEES ─────────────────────────────────────────────────────
 *
 * The room sees the welcome, the question and the portrait: those are the
 * proof that this place does things. It does NOT see the plan -- a plan is
 * built from what the person told the assistant, and the club shares SOULs,
 * not private notes (groupDayPlan.ts sharedSafe). The plan goes to their own
 * chat, and the room is told only that it went.
 */

export type OnboardingStep = 'greet' | 'gift' | 'plan' | 'done'

export interface MemberState {
  /** Telegram id of the new member. */
  id: string
  /** Their own sentence about their work, once they have written it. */
  soul?: string | null
  /** Has a portrait already been prepared for them? */
  gifted?: boolean
  /** Has their first private plan been sent? */
  planned?: boolean
}

/**
 * What to do next for this member, or 'done'.
 *
 * Pure, and ordered by what the person has given us rather than by a clock:
 * a member who answers in three days is at the same step they were on, not
 * behind a schedule they never agreed to.
 */
export function nextStep(m: MemberState): OnboardingStep {
  if (!String(m?.soul ?? '').trim()) return 'greet'
  if (!m.gifted) return 'gift'
  if (!m.planned) return 'plan'
  return 'done'
}

/** The welcome, with the one question. Their name, nothing about them. */
export function greeting(name?: string | null): string {
  const who = String(name ?? '').trim()
  return (
    (who ? `${who}, добро пожаловать. ` : 'Добро пожаловать. ') + // cyrillic-ok: user-facing
    'Здесь помогают делом, а не советами.\n\n' + // cyrillic-ok: user-facing
    'Напишите ОДНОЙ фразой, чем занимаетесь — и я сразу сделаю вам ' + // cyrillic-ok: user-facing
    'вертикальный портрет для аватара и обложек, за счёт клуба. ' + // cyrillic-ok: user-facing
    'Дальше соберу ваш план и пришлю его вам лично.' // cyrillic-ok: user-facing
  )
}

/**
 * What the room is told when the private plan has gone out.
 *
 * Names the person and the fact, never the contents: the plan is built from
 * what they told the assistant, and that is not the room's to read.
 */
export function planSentNote(name?: string | null): string {
  const who = String(name ?? '').trim() || 'Новый участник' // cyrillic-ok: user-facing
  return `${who} — план на первую неделю ушёл в личные сообщения.` // cyrillic-ok: user-facing
}

/**
 * The brief for the gift, made only from THEIR OWN sentence.
 *
 * Returns null when they have not written one: a portrait composed from what
 * we guessed about a person is the one failure this whole flow cannot afford
 * in front of the room.
 */
export function giftBriefFrom(soul?: string | null): string | null {
  const said = String(soul ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (said.length < 8) return null
  return (
    `вертикальный портрет 9:16 из ЕГО лица для аватара и обложек; ` + // cyrillic-ok: brief for the agent
    `контекст его словами: «${said.slice(0, 200)}»; ` + // cyrillic-ok: brief for the agent
    `без надписей и логотипов, лицо в центральной трети кадра` // cyrillic-ok: brief for the agent
  )
}
