import { describe, expect, it } from 'vitest'
import {
  briefFor,
  dayPlan,
  lineFor,
  QUIET_DAYS,
  sharedSafe,
} from '@/services/groupDayPlan'

/*
 * THE DAY'S PLAN FOR EVERYBODY IN THE ROOM, ONCE A DAY.
 *
 * Owner, 2026-09-24: push them to set the profile up fully, write a plan for
 * the day for everyone, and -- since we hold each person's SOUL and their CRM
 * tasks -- help them run the day productively. And: "this is a social
 * business network, on this relation to one another".
 *
 * Which is why the sharpest test here is not about the words but about the
 * room: a plan that reads one person's file out to the others would be the
 * leak the group rule exists to prevent, arriving by the front door.
 */
const NOW = 1_700_000_000
const ago = (days: number) => NOW - days * 86400

describe('what the plan may say out loud', () => {
  it('names what is missing, concretely, not "set up your profile"', () => {
    // hasProfile: false -- SOMEBODY LOOKED and there is no profile. The
    // fixture used to leave it out, which made the test pass on a field
    // nobody had answered: see "unknown is not no" below.
    const l = lineFor(
      { id: '900000051', name: 'Пилот', hasProfile: false },
      NOW
    )
    expect(l).toContain('Пилот')
    expect(l).toContain('фото')
    // A nudge names the step that closes it, or it is noise.
    // The guard here reads a regex literal as code, so the two halves of the
    // ask are checked as plain strings instead.
    expect(l!.includes('фраза') || l!.includes('фото')).toBe(true)
  })

  it('says nothing about a person who has been quiet for a fortnight', () => {
    expect(
      lineFor(
        { id: '900000052', hasProfile: false, lastAt: ago(QUIET_DAYS + 1) },
        NOW
      )
    ).toBeNull()
    expect(
      lineFor({ id: '900000052', hasProfile: false, lastAt: ago(1) }, NOW)
    ).toBeTruthy()
  })

  it('stays QUIET when nothing is missing -- silence is not sent', () => {
    /*
     * The rule the hive report earned: a daily post with nothing in it
     * teaches the room to ignore the channel, and the one morning that
     * mattered is ignored with it.
     */
    const ready = [
      { id: '900000051', hasProfile: true, connected: true, lastAt: ago(1) },
      { id: '900000052', hasProfile: true, connected: true, lastAt: ago(2) },
    ]
    expect(dayPlan({ people: ready, now: NOW })).toBeNull()
  })

  it('leaves out the owner and the bots it was told to skip', () => {
    const post = dayPlan({
      people: [
        { id: '144022504', hasProfile: false },
        { id: '900000051', name: 'Пилот', hasProfile: false },
      ],
      now: NOW,
      skip: ['144022504'],
    })
    expect(post).toContain('Пилот')
    expect(post).not.toContain('144022504')
  })
})

describe('the brief the agent writes from', () => {
  it('carries only people we actually hold something about', () => {
    const people = [
      { id: '900000051', name: 'A', hasProfile: true, soul: 'учитель' },
      { id: '900000052', name: 'B', hasProfile: true },
      { id: '900000053', name: 'C', soul: 'есть текст, профиля нет' },
      { id: '900000054', name: 'D', hasProfile: true, tasks: ['снять ролик'] },
    ]
    expect(briefFor(people, NOW).map(b => b.id)).toEqual([
      '900000051',
      '900000054',
    ])
  })

  it('is empty when we hold nothing, so nothing is invented', () => {
    // A plan for a person we know nothing about is invention, and invention
    // in front of the room is worse than a quiet morning.
    expect(briefFor([{ id: '900000052', hasProfile: true }], NOW)).toEqual([])
  })

  it('cuts what it carries, so one long soul cannot become the prompt', () => {
    const [b] = briefFor(
      [
        {
          id: '900000051',
          hasProfile: true,
          soul: 'я'.repeat(900),
          tasks: Array.from({ length: 9 }, (_, i) => `задача ${i}`),
        },
      ],
      NOW
    )
    expect(b.soul!.length).toBeLessThanOrEqual(600)
    expect(b.tasks).toHaveLength(5)
  })
})

describe('a club room where the other members are reading', () => {
  it('shares their SOUL and nothing they told the assistant', () => {
    /*
     * The daily plan must not read one client's file out to the rest. What a
     * person told us -- their soul, their goal, what they are stuck on -- is
     * not ours to put in front of the others.
     */
    const brief = {
      id: '900000051',
      name: 'Пилот',
      soul: 'запускаю канал про подготовку к экзаменам',
      tasks: ['долг 300 токенов', 'боится камеры'],
    }
    const split = sharedSafe(brief)
    /*
     * Owner, the same night: "SOUL is for the members of our club". So the
     * SOUL travels -- the others can only help if they know what a person is
     * working on -- and what the person told the ASSISTANT does not.
     */
    expect(split.shared.soul).toContain('экзаменам')
    const asText = JSON.stringify(split.shared)
    expect(asText).not.toContain('боится')
    expect(asText).not.toContain('долг')
    // And the material is not lost: it goes to that person, in their own chat.
    expect(split.private.tasks).toHaveLength(2)
  })
})

describe('unknown is not "no", and here it is said about somebody in public', () => {
  /*
   * THE DEFECT THAT NEVER FIRED BECAUSE NOTHING CALLED THIS.
   *
   * `lineFor` asked `if (!p.hasProfile)`, which reads a field NOBODY FILLED
   * as the statement "they have no profile" -- printed in a room where their
   * colleagues are reading. The module has no caller, so it never happened;
   * the first caller unable to answer one of these fields would have made it
   * happen on the first morning, to a real person, in front of the others.
   *
   * Three states: true, false, and nobody looked. Only `false` is a claim.
   */
  it('a person nobody looked up produces no line at all', () => {
    expect(
      lineFor({ id: '900000053', name: 'Никто не смотрел' }, NOW)
    ).toBeNull()
  })

  it('and no post: a room full of unknowns stays quiet', () => {
    expect(
      dayPlan({
        people: [{ id: '900000053' }, { id: '900000054', name: 'Тоже' }],
        now: NOW,
      })
    ).toBeNull()
  })

  it('"not connected" is only said to somebody we KNOW has a profile', () => {
    // Unknown profile + unknown connection: nothing is claimed.
    expect(lineFor({ id: '900000055', connected: false }, NOW)).toBeNull()
    // Known profile, known missing connection: that is a fact, and it is said.
    const l = lineFor(
      {
        id: '900000055',
        name: 'Есть профиль',
        hasProfile: true,
        connected: false,
      },
      NOW
    )
    expect(l).toBeTruthy()
    expect(l).toContain('приложение')
  })

  it('a false answer is still an answer: it speaks', () => {
    // The negative control for all of the above -- if the check were simply
    // "say nothing ever", these guards would pass while the feature was gone.
    expect(
      lineFor({ id: '900000056', name: 'Нет профиля', hasProfile: false }, NOW)
    ).toBeTruthy()
  })
})
