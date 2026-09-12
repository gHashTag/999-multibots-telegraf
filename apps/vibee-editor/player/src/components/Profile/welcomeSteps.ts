/*
 * THE WELCOME ROAD, AS A TABLE.
 *
 * Owner, 2026-09-09: "on the profile screen we need a welcome onboarding
 * that, step by step, opens the value of the product and leads to payment;
 * after payment we help enter the Telegram password to set up the digital
 * twin; after that a slide for SOUL.md, because the company is built on it".
 *
 * Six named steps in the owner's order (value -> club -> Telegram -> SOUL ->
 * done). Where the road starts is decided from server facts, not from a flag
 * in localStorage: a member who already paid is not shown the paywall again,
 * a connected person is not asked for the phone again, and somebody with a
 * SOUL is not asked to write one. The facts come from three atoms the page
 * already keeps; this module only turns them into a step.
 *
 * Nothing is skipped and nothing is postponed (owner, 2026-09-09, evening:
 * "every step is mandatory, we do not move on until the step is done"). The
 * only way forward is the step itself; the only way out is Telegram's own
 * back button. Where the road starts is still decided from facts, so a
 * person who already did a step is not asked to do it twice.
 */
export type WelcomeStep = 'value' | 'how' | 'club' | 'connect' | 'soul' | 'done'

export const WELCOME_STEPS: readonly WelcomeStep[] = [
  'value',
  'how',
  'club',
  'connect',
  'soul',
  'done',
]

export interface WelcomeFacts {
  /** Club membership active right now (server: /api/club/status). */
  club: boolean
  /** Personal Telegram connected (server: /api/tg/connect/status). */
  connected: boolean
  /** A non-empty SOUL.md exists (agent tool soul_get). */
  soul: boolean
}

export function welcomeStart(facts: WelcomeFacts): WelcomeStep {
  if (!facts.club) return 'value'
  if (!facts.connected) return 'connect'
  if (!facts.soul) return 'soul'
  return 'done'
}

/** 1-based position for the "step N of 6" line. */
export function welcomeIndex(step: WelcomeStep): number {
  return WELCOME_STEPS.indexOf(step) + 1
}

export function welcomeNext(step: WelcomeStep): WelcomeStep {
  const i = WELCOME_STEPS.indexOf(step)
  return WELCOME_STEPS[Math.min(i + 1, WELCOME_STEPS.length - 1)]
}

export function welcomePrev(step: WelcomeStep): WelcomeStep {
  const i = WELCOME_STEPS.indexOf(step)
  return WELCOME_STEPS[Math.max(i - 1, 0)]
}

/**
 * Compose a SOUL.md from the four answers of the SOUL slide. Headings mirror
 * SOUL_TEMPLATE in SoulEditor.tsx so the full editor shows the same shape.
 * Empty answers keep the heading with the template hint, so nothing the
 * person did not say is invented for them.
 */
export function composeSoul(answers: {
  who: string
  sell: string
  voice: string
  forbidden: string
}): string {
  const block = (title: string, body: string, hint: string) =>
    `## ${title}\n${body.trim() || hint}\n`
  return [
    '# Мой SOUL', // cyrillic-ok: SOUL.md is written in the owner's language
    '',
    block('Кто я', answers.who, '(пока не заполнено)'), // cyrillic-ok: SOUL.md heading
    block('Чем зарабатываю', answers.sell, '(пока не заполнено)'), // cyrillic-ok: SOUL.md heading
    block('Голос', answers.voice, '(пока не заполнено)'), // cyrillic-ok: SOUL.md heading
    block('Что запрещено', answers.forbidden, '(пока не заполнено)'), // cyrillic-ok: SOUL.md heading
  ].join('\n')
}

/** A SOUL is worth saving when at least one answer says something. */
export function soulHasSubstance(answers: {
  who: string
  sell: string
  voice: string
  forbidden: string
}): boolean {
  return Object.values(answers).some(v => v.trim().length > 0)
}

/*
 * THE FAST ROAD (owner, 2026-09-12: "set up the onboarding so that entering
 * the game is quick"). Two things made the road long for a person who was
 * simply invited: the SOUL slide opened with four empty boxes and a dead
 * button, and the last card sent them to the profile, not to the game.
 *
 * Nothing became optional. The SOUL slide now opens with the first answer
 * already written from the Telegram profile the person arrived with -- their
 * name and handle -- so the button is live at once and the rest can be
 * refined later in the SOUL tab. The last card leads into the hive.
 */
export interface SoulSeedSource {
  first_name?: string
  last_name?: string
  username?: string
}

export function soulSeed(user: SoulSeedSource | null | undefined): {
  who: string
  sell: string
  voice: string
  forbidden: string
} {
  const name = [user?.first_name, user?.last_name]
    .map(x => String(x ?? '').trim())
    .filter(Boolean)
    .join(' ')
  const handle = String(user?.username ?? '').trim()
  const who = [name, handle ? `@${handle}` : '']
    .filter(Boolean)
    .join(' ')
    .trim()
  return { who, sell: '', voice: '', forbidden: '' }
}

/** Where the last card of the road sends a person: the game. */
export const WELCOME_EXIT_ROUTE = '/hive'

