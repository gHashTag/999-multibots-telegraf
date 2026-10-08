/**
 * The tests of crm-first-screen.t27, run against the code that carries it:
 * src/lib/crmPhone.ts (the rules) and the page's sheets (the widths a media
 * query cannot import). `tri shot` reading Telegram's insets from this
 * spec is held by src/__tests__/tools/shotFoldFromCrmSpec.test.ts at the
 * repository root: the player's image is built from apps/vibee-editor, and
 * a test here that opened bin/ would die there with ENOENT
 * (testGateExclude.test.ts caught exactly that, 07.10.2026).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as SPEC from './crm-first-screen.gen'
import {
  CRM_PHONE_QUERY,
  autoLine,
  countShown,
  isPhoneWidth,
  lineAction,
  lineStops,
  onFirstScreen,
  pillsAt,
  telegramLine,
  telegramTop,
  waitingBeforeFunnel,
  waitingCounts,
  workOrder,
} from '../lib/crmPhone'

const SRC = join(__dirname, '..')
const css = (rel: string) =>
  readFileSync(join(SRC, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('crm-first-screen.t27, against the host', () => {
  it("a phone is the page's own phone width", () => {
    expect(isPhoneWidth(320)).toBe(true)
    expect(isPhoneWidth(390)).toBe(true)
    expect(isPhoneWidth(480)).toBe(true)
    expect(isPhoneWidth(481)).toBe(false)
    expect(CRM_PHONE_QUERY).toBe(`(max-width: ${SPEC.PHONE_MAX_PX}px)`)
  })

  it('the funnel draws pills only where they save a row', () => {
    expect(pillsAt(360)).toBe(true)
    expect(pillsAt(390)).toBe(true)
    expect(pillsAt(480)).toBe(true)
    expect(pillsAt(359)).toBe(false)
    expect(pillsAt(320)).toBe(false)
    expect(pillsAt(481)).toBe(false)
  })

  it('AUTO is one line on a phone once read, off or on', () => {
    expect(autoLine(true, true)).toBe(true)
    expect(autoLine(true, false)).toBe(false)
    expect(autoLine(false, true)).toBe(false)
    expect(autoLine(false, false)).toBe(false)
  })

  it('a press on the AUTO line can only make things safer', () => {
    expect(lineAction(true)).toBe(SPEC.ACTION_STOP)
    expect(lineAction(false)).toBe(SPEC.ACTION_NONE)
    expect(lineAction(true)).not.toBe(SPEC.ACTION_START)
    expect(lineAction(false)).not.toBe(SPEC.ACTION_START)
    expect(lineStops(true)).toBe(true)
    expect(lineStops(false)).toBe(false)
  })

  it('a count of zero is not printed', () => {
    expect(countShown(0)).toBe(false)
    expect(countShown(1)).toBe(true)
    expect(countShown(12)).toBe(true)
    expect(waitingCounts(2, 0, 1)).toEqual([
      ['ours', 2],
      ['theirs', 1],
    ])
    expect(waitingCounts(0, 0, 0)).toEqual([])
  })

  it('on a phone the people waiting come before the funnel', () => {
    expect(waitingBeforeFunnel(true)).toBe(true)
    expect(waitingBeforeFunnel(false)).toBe(false)
    expect(workOrder(true)).toEqual(SPEC.ORDER_PHONE)
    expect(workOrder(false)).toEqual(SPEC.ORDER_WIDE)
    // The AUTO line stays above the people on a phone: its stop in sight.
    expect(workOrder(true).indexOf('auto')).toBeLessThan(
      workOrder(true).indexOf('waiting')
    )
  })

  it("Telegram's first screen at 390x844 ends at 648 px", () => {
    expect(telegramTop()).toBe(105)
    expect(telegramLine(787)).toBe(648)
    expect(onFirstScreen(648, 787)).toBe(true)
    expect(onFirstScreen(649, 787)).toBe(false)
  })
})

describe('what cannot import the numbers says the same numbers', () => {
  it("the page's phone rules are written for the spec's phone width", () => {
    expect(css('pages/Crm.css')).toContain(
      `@media (max-width: ${SPEC.PHONE_MAX_PX}px)`
    )
  })

  it("the funnel pills block is the spec's width band", () => {
    expect(css('components/Crm/FunnelStrip.css')).toContain(
      `@media (min-width: ${SPEC.PILLS_MIN_PX}px) and (max-width: ${SPEC.PHONE_MAX_PX}px)`
    )
  })
})
