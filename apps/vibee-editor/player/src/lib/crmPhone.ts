/**
 * THE CRM ON A PHONE: WHERE THE WORK TAB SPENDS ITS FIRST SCREEN.
 *
 * The numbers and rules are the spec's (crm-first-screen.t27, vendored with
 * its `t27c gen-ts` output in src/spec); this module only carries them to
 * the page, and src/spec/crm-first-screen.test.ts runs every test of the
 * spec against these very functions.
 *
 * Measured with `tri shot crm` at 390x844, 07.10.2026: the first person
 * waiting for an answer ended at 926 px and their Prepare at 1065 px, under
 * a tab bar that starts at 787 -- and Telegram in fullscreen keeps 105 px on
 * top and 34 below on top of that.
 */
import * as SPEC from '../spec/crm-first-screen.gen'

/** The page's own phone width (Crm.css lays the rows out for it too). */
export const CRM_PHONE_QUERY = `(max-width: ${SPEC.PHONE_MAX_PX}px)`

/** The spec's is_phone. */
export function isPhoneWidth(width: number): boolean {
  return width <= SPEC.PHONE_MAX_PX
}

/** The spec's pills: the funnel draws pills where two rows of them fit. */
export function pillsAt(width: number): boolean {
  return width >= SPEC.PILLS_MIN_PX && width <= SPEC.PHONE_MAX_PX
}

/**
 * The spec's auto_folds: THE AUTO SWITCH, OFF, IS ONE LINE ON A PHONE.
 *
 * The biggest thing above the first person was this panel, about 220 px:
 * a state line, two scope chips, the switch and a hint -- for a switch that
 * was OFF, the state in which nothing leaves without the owner's press.
 *
 * So the panel is sized by what the switch is doing, not by what it could
 * do. Off, on a phone, it folds to its name and the word "off", one press
 * from the whole panel. On, it is never folded: that is the state that
 * writes to people by itself, and its stop button stays in plain sight.
 * A switch whose state could not be read is not folded either: it says so
 * at full size (AutoPanel: AN UNREADABLE SWITCH SAYS SO).
 *
 * The scope is chosen before the switch is turned on, so the folded line
 * carries no "turn on": a press there would send to everyone unseen.
 */
export function autoFolds(
  phone: boolean,
  reachable: boolean,
  on: boolean
): boolean {
  return phone && reachable && !on
}

/** The three kinds of waiting a count line can name. */
export type WaitingKind = 'ours' | 'due' | 'theirs'

/** The spec's count_shown: a kind of waiting is named when somebody is in it. */
export function countShown(n: number): boolean {
  return n > 0
}

/**
 * THE COUNT LINE NAMES ONLY WHAT HAS SOMEBODY. "time to return: 0" cost the
 * English line its second row above the first person; a zero is not news.
 * All zero is no line at all.
 */
export function waitingCounts(
  ours: number,
  due: number,
  theirs: number
): Array<[WaitingKind, number]> {
  const all: Array<[WaitingKind, number]> = [
    ['ours', ours],
    ['due', due],
    ['theirs', theirs],
  ]
  return all.filter(([, n]) => countShown(n))
}

/** A block of the work tab whose place depends on the width. */
export type WorkBlock = (typeof SPEC.ORDER_WIDE)[number]

/**
 * The spec's ORDER_PHONE / ORDER_WIDE. On a phone the people waiting come
 * before the funnel (owner, 07.10.2026: the counts are read at a glance and
 * keep, the first person's Prepare does not); the AUTO line stays above
 * them, folded while off, its stop in sight while on.
 */
export function workOrder(phone: boolean): readonly WorkBlock[] {
  return phone ? SPEC.ORDER_PHONE : SPEC.ORDER_WIDE
}

/** The spec's waiting_before_funnel, read off the order itself. */
export function waitingBeforeFunnel(phone: boolean): boolean {
  const order = workOrder(phone)
  return order.indexOf('waiting') < order.indexOf('funnel')
}

/** The spec's tg_top: what Telegram keeps on top in fullscreen. */
export function telegramTop(): number {
  return SPEC.TG_DEVICE_TOP_PX + SPEC.TG_BUTTONS_TOP_PX
}

/**
 * The spec's tg_line: where Telegram's first screen ends, in page pixels,
 * given where the bars fixed to the bottom begin. `tri shot` draws the
 * same line in the page from the same numbers (bin/helpers/shot.mjs).
 */
export function telegramLine(barsTop: number): number {
  return barsTop - SPEC.TG_HOME_BOTTOM_PX - telegramTop()
}

/** The spec's on_first_screen. */
export function onFirstScreen(end: number, barsTop: number): boolean {
  return end <= telegramLine(barsTop)
}
