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
 * Skipping is allowed on the two story steps and nowhere else: the paywall,
 * the login and the SOUL are the product, the story is only the reason.
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

/** Only the story may be skipped; every other step is the product itself. */
export function welcomeCanSkip(step: WelcomeStep): boolean {
  return step === 'value' || step === 'how'
}

/**
 * Whether the person is allowed to leave the road for the profile without
 * finishing it. A brand-new person (not connected) is not: the profile does
 * not work without the phone login (owner, 2026-09-09). A person who is
 * already connected has passed the mandatory step and may say "later" to the
 * club or to the SOUL; the road returns next session.
 */
export function welcomeCanLeave(facts: WelcomeFacts): boolean {
  return facts.connected
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
