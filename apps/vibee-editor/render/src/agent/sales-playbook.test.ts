import { describe, expect, it } from 'vitest'
import { byUrgency, nextStep, type SalesInput } from './sales-playbook'

/**
 * THE SALES ALGORITHM, CASE BY CASE.
 *
 * Every case below is one the business actually produced this week or last,
 * and two of them are the failures that caused this file to exist:
 * a promise made out loud with nothing to remember it, and a person left
 * waiting for three days while the system prepared something to sell them.
 */

const NOW = new Date('2026-09-23T12:00:00.000Z')

const input = (over: Partial<SalesInput>): SalesInput => ({
  stage: 'talking',
  lastFrom: 'us',
  hoursSinceLast: 1,
  now: NOW,
  ...over,
})

describe('what to do next with one person', () => {
  it('answers the person who is waiting before anything else', () => {
    // Анна, 2026-09-23 06:25: "мой баланс вернулся?" -- an answer is the only
    // move that exists while somebody is waiting.
    const step = nextStep(input({ lastFrom: 'them', hoursSinceLast: 3 }))
    expect(step.move).toBe('answer_now')
    expect(step.urgency).toBe('now')
  })

  it('calls a day of silence on our side overdue, not "today"', () => {
    const step = nextStep(input({ lastFrom: 'them', hoursSinceLast: 72 }))
    expect(step.move).toBe('answer_now')
    expect(step.urgency).toBe('overdue')
    expect(step.why).toContain('3 дн.')
  })

  it('keeps a promise before it offers anything', () => {
    /*
     * Гая to Анна, today 07:29: "да вернем" -- about a balance. A promise with
     * no date is due the moment it is made, and it outranks every move that
     * would sell something instead.
     */
    const step = nextStep(
      input({
        stage: 'talking',
        sawValue: true,
        lastFrom: 'us',
        hoursSinceLast: 1,
        owed: { what: 'вернуть баланс', saidAt: '2026-09-23T07:29:00.000Z' },
      })
    )
    expect(step.move).toBe('keep_promise')
    expect(step.urgency).toBe('overdue')
    expect(step.why).toContain('вернуть баланс')
  })

  it('a promise with a future date is today’s work, not late', () => {
    const step = nextStep(
      input({
        owed: { what: 'прислать ролик', dueAt: '2026-09-24T10:00:00.000Z' },
      })
    )
    expect(step.move).toBe('keep_promise')
    expect(step.urgency).toBe('today')
  })

  it('never writes to somebody who refused, whatever else is true', () => {
    // Even with an unanswered message from them and a promise outstanding:
    // a refusal is the one state this algorithm does not argue with.
    const step = nextStep(
      input({
        stage: 'refused',
        lastFrom: 'them',
        hoursSinceLast: 2,
        owed: { what: 'что угодно' },
      })
    )
    expect(step.move).toBe('leave_alone')
    expect(step.urgency).toBe('hold')
  })

  it('holds until the date somebody asked for', () => {
    const step = nextStep(
      input({ stage: 'later', laterUntil: '2026-10-01T00:00:00.000Z' })
    )
    expect(step.move).toBe('wait_until')
    expect(step.urgency).toBe('hold')
  })

  it('comes back exactly when that date has passed', () => {
    const step = nextStep(
      input({ stage: 'later', laterUntil: '2026-09-20T00:00:00.000Z' })
    )
    expect(step.move).toBe('follow_up')
    expect(step.intent).toContain('без нового предложения')
  })

  it('serves the person who paid instead of selling to them', () => {
    const step = nextStep(input({ stage: 'client', hoursSinceLast: 100 }))
    expect(step.move).toBe('serve')
  })

  it('offers only when the conversation is warm and they have seen it work', () => {
    const warm = nextStep(
      input({ stage: 'talking', sawValue: true, hoursSinceLast: 4 })
    )
    expect(warm.move).toBe('offer')

    // The same conversation without a result they have seen is not an offer
    // yet -- it is a follow-up at best.
    const cold = nextStep(
      input({ stage: 'talking', sawValue: false, hoursSinceLast: 60 })
    )
    expect(cold.move).toBe('follow_up')
  })

  it('nudges once after two days and stops pitching after two weeks', () => {
    expect(nextStep(input({ hoursSinceLast: 24 * 3 })).move).toBe('follow_up')
    const gone = nextStep(input({ hoursSinceLast: 24 * 20 }))
    expect(gone.move).toBe('winback_ask')
    expect(gone.intent).toContain('Дальше не писать')
  })

  it('leaves the ball with them right after we answered', () => {
    const step = nextStep(input({ lastFrom: 'us', hoursSinceLast: 2 }))
    expect(step.move).toBe('wait_until')
    expect(step.urgency).toBe('hold')
  })

  it('opens a conversation that never happened', () => {
    const step = nextStep(
      input({ stage: 'new', lastFrom: null, hoursSinceLast: null })
    )
    expect(step.move).toBe('first_touch')
  })

  it('asks what changed instead of pitching a returning payer', () => {
    const step = nextStep(input({ stage: 'winback', hoursSinceLast: 24 * 30 }))
    expect(step.move).toBe('winback_ask')
    expect(step.intent).toContain('не предлагать')
  })

  it('sorts a queue so what is late is read first', () => {
    const queue = [
      {
        id: 'c',
        step: nextStep(
          input({ stage: 'new', lastFrom: null, hoursSinceLast: null })
        ),
      },
      { id: 'a', step: nextStep(input({ owed: { what: 'баланс' } })) },
      {
        id: 'b',
        step: nextStep(input({ lastFrom: 'them', hoursSinceLast: 2 })),
      },
    ]
    expect(queue.sort(byUrgency).map(q => q.id)).toEqual(['a', 'b', 'c'])
  })
})
