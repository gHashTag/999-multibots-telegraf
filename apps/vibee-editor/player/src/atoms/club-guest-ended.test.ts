/**
 * AN INVITATION THAT RAN OUT IS SAID ABOVE THE PRICE (2026-09-22).
 *
 * The render answers /api/club/status with `guest_ended` when a person's
 * guest pass (CLUB_GUESTS `id@YYYY-MM-DD`) has ended and nothing else lets
 * them in. The paywall must then say "your invitation ended on <date>" next
 * to the offer -- in UTC, the zone the server set it in -- and must never say
 * it to a member.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { clubDay, guestEndedDate } from './club'
import { translations } from './language'

const ENDED = '2026-09-29T00:00:00.000Z'

describe('the date of an ended invitation', () => {
  it('is the day the server set, in either language', () => {
    expect(guestEndedDate({ active: false, guest_ended: ENDED }, 'en')).toBe(
      '29 September 2026'
    )
    expect(guestEndedDate({ active: false, guest_ended: ENDED }, 'ru')).toMatch(
      /^29 сентября 2026/ // cyrillic-ok: the Russian month under test
    )
  })

  it('is never shown to a member, to nobody in particular, or without a date', () => {
    expect(
      guestEndedDate({ active: true, guest_ended: ENDED }, 'en')
    ).toBeNull()
    expect(guestEndedDate(null, 'en')).toBeNull()
    expect(
      guestEndedDate({ active: false, guest_ended: null }, 'en')
    ).toBeNull()
    expect(clubDay('not a date', 'en')).toBeNull()
  })

  it('does not slip a day in a western time zone: midnight UTC stays the 29th', () => {
    // 00:00 UTC on the 29th is still the 28th in every American zone.
    expect(clubDay('2026-09-29T00:00:00.000Z', 'en')).toBe('29 September 2026')
  })
})

describe('the paywall says it', () => {
  const dict = translations as unknown as Record<string, Record<string, string>>

  it('has the line in both languages, with the date slot', () => {
    expect(dict.en['welcome.club.guestEnded']).toContain('{date}')
    expect(dict.ru['welcome.club.guestEnded']).toContain('{date}')
  })

  it('the club step renders that line from the status (source contract: no DOM harness here)', () => {
    const src = readFileSync(
      join(__dirname, '../components/Profile/WelcomeOnboarding.tsx'),
      'utf8'
    )
    expect(src).toContain('guestEndedDate(status, lang)')
    expect(src).toMatch(
      /t\('welcome\.club\.guestEnded', \{ date: guestEnded \}\)/
    )
  })
})
