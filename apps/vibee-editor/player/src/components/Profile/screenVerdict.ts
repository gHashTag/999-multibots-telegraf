/*
 * WHY THIS PERSON IS ON THIS SCREEN AND NOT THE ONE THEY EXPECTED.
 *
 * Owner, 2026-09-22: he could not get through payment in @vibee_agent, and
 * asked for a mark admins can see saying why he does not land on the screen
 * he expects. He was
 * right that something stopped him and wrong about what: nothing had broken.
 * The day before, his second account was put on the club guest list, so the
 * server answers `active: true, granted: 'guest'` -- and an active club is
 * exactly the fact `welcomeStart` uses to SKIP the paywall. The road did
 * what it was told; the reason was invisible, so it looked like a fault.
 *
 * That invisibility is the defect this module fixes. The road is decided
 * from four server facts, each arriving on its own schedule, and when one of
 * them says something unexpected the screen simply changes with no account
 * of itself. An admin is then left guessing at a distributed state they
 * cannot see -- which is how the last hour was spent.
 *
 * NOT A SECOND COPY OF THE RULE. This calls `profileScreen` and
 * `welcomeStart` rather than restating their conditions: a verdict that
 * disagreed with the gate would be worse than no verdict at all. It adds one
 * thing those two do not return -- WHICH fact decided -- and a test pins
 * that naming to the functions themselves, so a new step or a new gate rule
 * cannot leave the explanation quietly out of date.
 *
 * The text is Russian: it is read on a phone by the owner, not by a compiler.
 */
import { profileScreen, type ProfileScreen } from './profileGate'
import {
  welcomeStart,
  type WelcomeFacts,
  type WelcomeStep,
} from './welcomeSteps'
import type { ClubGrant } from '@/atoms/club'

/** A fact is true, false, or has not arrived yet. All three matter here. */
export type FactState = 'yes' | 'no' | 'unknown'

export interface VerdictInput {
  loading: boolean
  own: boolean
  connected: boolean | null
  /** Club open right now, by payment OR by pass; null = not asked yet. */
  club: boolean | null
  /** A paid month is live. A pass is not a payment. */
  paid?: boolean
  /** Why it is open without a charge, when it is. */
  granted?: ClubGrant
  soul: boolean | null
  voice?: boolean
  onRoad?: boolean
  devBypass?: boolean
}

export interface VerdictRow {
  /** The fact's name, as the owner would say it. */
  label: string // cyrillic-ok: shown on the badge
  state: FactState
  /** What this particular answer means, when it is not obvious. */
  note?: string // cyrillic-ok: shown on the badge
}

export interface ScreenVerdict {
  screen: ProfileScreen
  /** The step of the road, when the road is the screen. */
  step: WelcomeStep | null
  /** The fact that decided, by the key names of VerdictInput. */
  decidedBy:
    | 'loading'
    | 'own'
    | 'devBypass'
    | 'connected'
    | 'club'
    | 'soul'
    | 'voice'
    | 'onRoad'
    | 'none'
  /** One sentence: what the screen is and what chose it. */
  reason: string // cyrillic-ok: shown on the badge
  rows: VerdictRow[]
}

const GRANT_RU: Record<Exclude<ClubGrant, null>, string> = {
  owner: 'владелец бота', // cyrillic-ok: badge text
  keeper: 'хранитель', // cyrillic-ok: badge text
  guest: 'гость по приглашению', // cyrillic-ok: badge text
}

function state(value: boolean | null | undefined): FactState {
  if (value === null || value === undefined) return 'unknown'
  return value ? 'yes' : 'no'
}

/** Which step the road opens on, and what that step is waiting for. */
const STEP_BLOCKER: Record<WelcomeStep, ScreenVerdict['decidedBy']> = {
  value: 'club',
  how: 'club',
  club: 'club',
  connect: 'connected',
  soul: 'soul',
  voice: 'voice',
  done: 'onRoad',
}

const STEP_RU: Record<WelcomeStep, string> = {
  value: 'ценность', // cyrillic-ok: badge text
  how: 'как это работает', // cyrillic-ok: badge text
  club: 'оплата клуба', // cyrillic-ok: badge text
  connect: 'вход по телефону', // cyrillic-ok: badge text
  soul: 'SOUL.md',
  voice: 'голос', // cyrillic-ok: badge text
  done: 'готово', // cyrillic-ok: badge text
}

export function screenVerdict(input: VerdictInput): ScreenVerdict {
  const screen = profileScreen({
    loading: input.loading,
    own: input.own,
    connected: input.connected,
    club: input.club,
    soul: input.soul,
    onRoad: input.onRoad,
    devBypass: input.devBypass,
  })

  const facts: WelcomeFacts = {
    club: input.club === true,
    connected: input.connected === true,
    soul: input.soul === true,
    voice: input.voice,
  }
  const step = screen === 'welcome' ? welcomeStart(facts) : null

  const grant = input.granted ?? null
  const rows: VerdictRow[] = [
    {
      label: 'вход по телефону', // cyrillic-ok: badge text
      state: state(input.connected),
      note: input.connected === null ? 'ответ ещё не пришёл' : undefined, // cyrillic-ok: badge text
    },
    {
      label: 'клуб', // cyrillic-ok: badge text
      state: state(input.club),
      note:
        input.club === null
          ? 'ответ ещё не пришёл' // cyrillic-ok: badge text
          : grant
            ? // The sentence he needed an hour ago.
              `открыт без оплаты: ${GRANT_RU[grant]} — шаг оплаты поэтому пропущен` // cyrillic-ok: badge text
            : input.paid
              ? 'оплачен' // cyrillic-ok: badge text
              : undefined,
    },
    {
      label: 'SOUL.md',
      state: state(input.soul),
      note: input.soul === null ? 'ещё не спрашивали' : undefined, // cyrillic-ok: badge text
    },
    {
      label: 'голос', // cyrillic-ok: badge text
      state: state(input.voice),
      note:
        input.voice === undefined
          ? 'не спрашивали — шаг не откроется' // cyrillic-ok: badge text
          : undefined,
    },
  ]

  let decidedBy: ScreenVerdict['decidedBy'] = 'none'
  let reason = 'все условия выполнены — открыт профиль' // cyrillic-ok: badge text

  if (input.loading) {
    decidedBy = 'loading'
    reason = 'профиль ещё грузится' // cyrillic-ok: badge text
  } else if (!input.own) {
    decidedBy = 'own'
    reason = 'это чужой профиль — дорога не показывается' // cyrillic-ok: badge text
  } else if (input.devBypass) {
    decidedBy = 'devBypass'
    reason = 'включён флаг разработчика «свой» — гейт обойдён' // cyrillic-ok: badge text
  } else if (input.connected === null) {
    decidedBy = 'connected'
    reason = 'скелет: статус входа по телефону ещё не пришёл' // cyrillic-ok: badge text
  } else if (input.club === null) {
    decidedBy = 'club'
    reason = 'скелет: статус клуба ещё не пришёл' // cyrillic-ok: badge text
  } else if (step) {
    decidedBy = STEP_BLOCKER[step]
    reason =
      step === 'done'
        ? 'дорога уже на экране и держится до конца' // cyrillic-ok: badge text
        : `дорога открыта на шаге «${STEP_RU[step]}»` // cyrillic-ok: badge text
  }

  return { screen, step, decidedBy, reason, rows }
}

/**
 * Can this person still be sold a month? A pass is not a purchase, so a
 * granted admin may open the paywall on purpose to test the till -- which is
 * the whole reason the button below the badge exists.
 */
export function canStillPay(input: {
  club: boolean | null
  paid?: boolean
  granted?: ClubGrant
}): boolean {
  if (input.paid) return false
  return input.club === false || !!input.granted
}
