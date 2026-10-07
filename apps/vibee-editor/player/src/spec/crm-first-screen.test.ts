/**
 * The tests of crm-first-screen.t27, run against the code that carries it:
 * src/lib/crmPhone.ts (the rules), the page's sheets (the widths a media
 * query cannot import) and `tri shot` (Telegram's insets on the fold line).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as SPEC from './crm-first-screen.gen'
import {
  CRM_PHONE_QUERY,
  autoFolds,
  countShown,
  isPhoneWidth,
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

  it('AUTO folds only on a phone, only read, only off', () => {
    expect(autoFolds(true, true, false)).toBe(true)
    expect(autoFolds(true, true, true)).toBe(false)
    expect(autoFolds(true, false, false)).toBe(false)
    expect(autoFolds(false, true, false)).toBe(false)
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

  it('tri shot draws the fold line from this spec, not from its own numbers', () => {
    const shot = readFileSync(
      join(SRC, '..', '..', '..', '..', 'bin', 'helpers', 'shot.mjs'),
      'utf8'
    )
    expect(shot).toContain("'src/spec/crm-first-screen.gen.ts'")
    expect(shot).toMatch(/FIRST\.TG_DEVICE_TOP_PX \+ FIRST\.TG_BUTTONS_TOP_PX/)
    expect(shot).toContain('FIRST.TG_HOME_BOTTOM_PX')
    // The CRM's load state is held to Telegram's line, Prepare included.
    expect(shot).toContain('foldInsets: TELEGRAM')
    expect(shot).toContain("['.crm__list .crm__prepare', FIRST.PILLS_MIN_PX]")
    expect(shot).not.toMatch(/\b(105|59|46|34)\b.*foldInsets/)
  })
})
