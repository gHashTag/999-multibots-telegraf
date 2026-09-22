/*
 * THE EXPLANATION MUST NOT DISAGREE WITH THE SCREEN IT EXPLAINS.
 *
 * A badge that says "waiting for the club status" while the profile is on
 * screen is worse than no badge: it would send the next hour after a fault
 * that is not there -- which is exactly the hour this module was written to
 * give back (owner, 2026-09-22, asking for a mark admins can see saying why
 * he does not land on the screen he expects).
 *
 * So the first test here is not about wording. It walks every combination of
 * the facts and checks the verdict against `profileScreen` and
 * `welcomeStart` themselves: a new gate rule, or a new step, fails here
 * rather than shipping a confident wrong sentence.
 */
import { describe, it, expect } from 'vitest'
import { profileScreen } from './profileGate'
import { welcomeStart } from './welcomeSteps'
import { canStillPay, screenVerdict, type VerdictInput } from './screenVerdict'

const TRIBOOL: (boolean | null)[] = [true, false, null]

function everyCase(): VerdictInput[] {
  const cases: VerdictInput[] = []
  for (const loading of [false, true])
    for (const own of [true, false])
      for (const connected of TRIBOOL)
        for (const club of TRIBOOL)
          for (const soul of TRIBOOL)
            for (const voice of [true, false, undefined])
              for (const onRoad of [false, true])
                cases.push({
                  loading,
                  own,
                  connected,
                  club,
                  soul,
                  voice,
                  onRoad,
                })
  return cases
}

describe('the verdict agrees with the gate', () => {
  const cases = everyCase()

  it('covers the whole fact space', () => {
    expect(cases.length).toBe(2 * 2 * 3 * 3 * 3 * 3 * 2)
  })

  it('reports the screen the gate actually chose', () => {
    for (const c of cases) {
      expect(screenVerdict(c).screen).toBe(
        profileScreen({
          loading: c.loading,
          own: c.own,
          connected: c.connected,
          club: c.club,
          soul: c.soul,
          onRoad: c.onRoad,
        })
      )
    }
  })

  it('reports the step the road actually opens on, and none otherwise', () => {
    for (const c of cases) {
      const v = screenVerdict(c)
      if (v.screen !== 'welcome') {
        expect(v.step).toBeNull()
        continue
      }
      expect(v.step).toBe(
        welcomeStart({
          club: c.club === true,
          connected: c.connected === true,
          soul: c.soul === true,
          voice: c.voice,
        })
      )
    }
  })

  it('always names a deciding fact and says something', () => {
    for (const c of cases) {
      const v = screenVerdict(c)
      expect(v.reason.trim().length).toBeGreaterThan(0)
      expect(v.rows).toHaveLength(4)
      // 'none' is reserved for the screen where nothing is in the way.
      if (v.decidedBy === 'none') expect(v.screen).toBe('profile')
    }
  })
})

describe('the sentence the owner needed', () => {
  /*
   * This is the whole complaint, reduced to one assertion: a guest pass
   * makes the club active, the road therefore skips the paywall, and until
   * now nothing on the screen said so.
   */
  it('says a free pass is why the payment step is skipped', () => {
    const v = screenVerdict({
      loading: false,
      own: true,
      connected: true,
      club: true,
      paid: false,
      granted: 'guest',
      soul: true,
      voice: true,
    })
    const clubRow = v.rows.find(r => r.label === 'клуб') // cyrillic-ok: the row's own label
    expect(clubRow?.state).toBe('yes')
    expect(clubRow?.note).toContain('без оплаты')
    expect(clubRow?.note).toContain('пропущен')
  })

  it('does not blame a pass when the month was paid for', () => {
    const v = screenVerdict({
      loading: false,
      own: true,
      connected: true,
      club: true,
      paid: true,
      granted: null,
      soul: true,
      voice: true,
    })
    expect(v.rows.find(r => r.label === 'клуб')?.note).toBe('оплачен') // cyrillic-ok: the row's own label
  })

  it('distinguishes a fact that is false from one that has not arrived', () => {
    const waiting = screenVerdict({
      loading: false,
      own: true,
      connected: null,
      club: null,
      soul: null,
    })
    expect(waiting.screen).toBe('skeleton')
    expect(waiting.rows.every(r => r.state !== 'yes')).toBe(true)
    expect(waiting.rows[0].state).toBe('unknown')
    expect(waiting.rows[0].note).toBeTruthy()
  })
})

describe('whether the till is still open to this person', () => {
  it('takes money from a granted person who asks', () => {
    for (const granted of ['owner', 'keeper', 'guest'] as const) {
      expect(canStillPay({ club: true, paid: false, granted })).toBe(true)
    }
  })

  it('takes money from somebody with no club at all', () => {
    expect(canStillPay({ club: false, paid: false, granted: null })).toBe(true)
  })

  it('does not sell a month that is already paid for', () => {
    expect(canStillPay({ club: true, paid: true, granted: null })).toBe(false)
    // A bot owner who also paid is still not sold a second month.
    expect(canStillPay({ club: true, paid: true, granted: 'owner' })).toBe(
      false
    )
  })
})
