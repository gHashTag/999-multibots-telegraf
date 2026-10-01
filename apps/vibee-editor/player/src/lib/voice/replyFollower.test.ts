import { describe, expect, it } from 'vitest'
import type { Message } from '@/atoms/agentChat'
import { ReplyFollower } from './replyFollower'

const user = (id: string, text: string): Message => ({ id, role: 'user', text })
const agent = (id: string, text: string, stopped = false): Message => ({
  id,
  role: 'assistant',
  text,
  stopped,
})

describe('ReplyFollower', () => {
  const before = [
    user('u1', 'hi'),
    agent('a1', 'An old answer that must never be spoken again.'),
  ]

  it('speaks only the new answer, each sentence once, as it grows', () => {
    const f = new ReplyFollower(before)
    const asked = [...before, user('u2', 'what time is it?')]
    expect(
      f.update([...asked, agent('a2', 'It is almost noon')], true)
    ).toEqual([])
    expect(
      f.update(
        [...asked, agent('a2', 'It is almost noon here. And the sun')],
        true
      )
    ).toEqual(['It is almost noon here.'])
    expect(
      f.update(
        [...asked, agent('a2', 'It is almost noon here. And the sun is out.')],
        false
      )
    ).toEqual(['And the sun is out.'])
    expect(f.finished).toBe(true)
    expect(
      f.update(
        [...asked, agent('a2', 'It is almost noon here. And more.')],
        false
      )
    ).toEqual([])
  })

  it('a stopped answer ends without its tail', () => {
    const f = new ReplyFollower(before)
    const out = f.update(
      [
        ...before,
        agent('a2', 'The first long sentence of it. And the tail', true),
      ],
      false
    )
    expect(out).toEqual([])
    expect(f.finished).toBe(true)
  })

  it('nothing answering and no reply means none is coming', () => {
    const f = new ReplyFollower(before)
    expect(f.update(before, true)).toEqual([])
    expect(f.finished).toBe(false)
    expect(f.update(before, false)).toEqual([])
    expect(f.finished).toBe(true)
  })

  it('never speaks a card marker, and hands the cards over at the end', () => {
    const f = new ReplyFollower(before)
    const grow = (text: string, answering: boolean) =>
      f.update([...before, agent('a2', text)], answering)
    const heard: string[] = []
    heard.push(
      ...grow('I can do it two ways right now.\n[[card: Make a re', true)
    )
    heard.push(
      ...grow(
        'I can do it two ways right now.\n[[card: Make a reel | cut it from the photos]]\n[[card: Write a post | three paragraphs]]',
        false
      )
    )
    expect(heard.join(' ')).toBe('I can do it two ways right now.')
    expect(heard.join(' ')).not.toMatch(/card|\[\[|reel/i)
    expect(f.cards.map(c => c.title)).toEqual(['Make a reel', 'Write a post'])
  })

  it('offers no cards until the answer is finished', () => {
    const f = new ReplyFollower(before)
    f.update(
      [...before, agent('a2', 'Two ways to go about it. [[card: A | a]] ')],
      true
    )
    expect(f.cards).toEqual([])
  })
})
