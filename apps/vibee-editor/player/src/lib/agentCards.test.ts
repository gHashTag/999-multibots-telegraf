import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseCards,
  answerFor,
  cardStates,
  APPROVE,
  DECLINE,
  MAX_CARDS,
} from './agentCards'

/*
 * Owner, 2026-09-22: steering the agent should be approving or declining
 * its cards. These pin the marker, the words a press sends, and the state
 * read back from the conversation.
 */
describe('cards in an answer', () => {
  it('draws each marker as a card and removes it from the text', () => {
    const got = parseCards(
      'Two ways.\n\n[[card: Skip the address | press Skip]]\n[[card: Save it]]'
    )
    expect(got.text).toBe('Two ways.')
    expect(got.cards).toEqual([
      { kind: 'card', title: 'Skip the address', detail: 'press Skip' },
      { kind: 'card', title: 'Save it', detail: '' },
    ])
  })

  it('hides a marker still arriving while the answer streams', () => {
    expect(parseCards('Ready.\n[[card: Ski').text).toBe('Ready.')
    expect(parseCards('Ready.\n[[ste').text).toBe('Ready.')
    expect(parseCards('Ready.\n[[').text).toBe('Ready.')
  })

  it('no duplicates, and at most MAX_CARDS', () => {
    const many = Array.from(
      { length: 9 },
      (_, i) => `[[card: c${i % 7}]]`
    ).join(' ')
    expect(parseCards(many).cards).toHaveLength(Math.min(7, MAX_CARDS))
  })

  it('tells alternatives from the steps of a plan', () => {
    const got = parseCards(
      '[[step: Open the mail]] [[step: Reply to Anna | a short thank-you]] [[card: Or wait]]'
    )
    expect(got.cards.map(c => c.kind)).toEqual(['step', 'step', 'card'])
  })

  it('leaves ordinary brackets and the bot act: markers alone', () => {
    expect(parseCards('see [[Top up|act:topup]] and [1]').cards).toEqual([])
  })
})

describe('a press and what it becomes', () => {
  const cards = [
    { kind: 'card' as const, title: 'Skip the address', detail: '' },
    { kind: 'card' as const, title: 'Open the mail', detail: '' },
  ]

  it('is sent as the person own words, one line per card', () => {
    expect(answerFor(cards, true)).toBe(
      `${APPROVE}Skip the address\n${APPROVE}Open the mail`
    )
    expect(answerFor([cards[0]], false)).toBe(`${DECLINE}Skip the address`)
  })

  it('the state is read from what the person said after the answer', () => {
    expect(cardStates(cards, [])).toEqual(['open', 'open'])
    expect(cardStates(cards, [`${APPROVE}Skip the address`])).toEqual([
      'approved',
      'open',
    ])
    expect(cardStates(cards, ['hi', answerFor([cards[1]], false)])).toEqual([
      'open',
      'declined',
    ])
    expect(cardStates(cards, [answerFor(cards, true)])).toEqual([
      'approved',
      'approved',
    ])
  })

  it('the words match what the agent is told to expect (render chat.ts)', () => {
    const prompt = readFileSync(
      join(__dirname, '../../../render/src/agent/chat.ts'),
      'utf8'
    )
    expect(prompt).toContain(APPROVE)
    expect(prompt).toContain(DECLINE)
    expect(prompt).toContain('[[card: ')
    expect(prompt).toContain('[[step: ')
  })
})
