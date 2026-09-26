/**
 * THE NEXT STORY REEL IN ONE PRESS: t.me/<bot>?start=reel.
 *
 * Owner, 2026-09-26: "make it so she can get a new one with one press". The
 * reel is made by the render in the background; /start only asks for it and
 * answers at once. The trap this repeats is the paywall's -- a payload nothing
 * read looks, from outside, like a person who changed their mind -- so the
 * parser, the call and the wiring are pinned here.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { askNextStory, reelIntent, storyReply } from '@/services/storyReel'
import { topupIntent, lookIntent } from '@/navigation/registerCommands'

describe('the story-reel deep link is recognised', () => {
  it('reads reel, in any case, and nothing else', () => {
    expect(reelIntent('reel')).toBe(true)
    expect(reelIntent('Reel')).toBe(true)
    for (const other of [
      'reels',
      'reel_1',
      'look_1',
      'topup',
      'club',
      '900000012',
      'reel ',
      '',
      undefined,
    ]) {
      expect(reelIntent(other), `claimed ${String(other)}`).toBe(false)
    }
  })

  it('takes no other parser’s payload, and no other parser takes it', () => {
    expect(topupIntent('reel')).toBeNull()
    expect(lookIntent('reel')).toBeNull()
  })

  it('/start dispatches it: the branch and the call are in the handler', () => {
    const src = readFileSync(
      join(__dirname, '../../navigation/registerCommands.ts'),
      'utf8'
    )
    expect(src).toMatch(/reelIntent\(startParam\)[\s\S]{0,300}wantsReel = true/)
    expect(src).toMatch(
      /else if \(wantsReel\)[\s\S]{0,300}askNextStory\([\s\S]{0,200}storyReply/
    )
  })
})

describe('the press asks the render as the person, over the server key', () => {
  it('names her id and the bot she pressed in, and returns the answer', async () => {
    const seen: Array<{ url: string; init: RequestInit }> = []
    const answer = await askNextStory('900000077', 'example_bot', {
      base: 'https://render.example',
      key: 'k',
      fetchImpl: (async (url: string, init: RequestInit) => {
        seen.push({ url, init })
        return new Response(
          JSON.stringify({ started: true, topic: 'Ваза в интерьере' }),
          { status: 200 }
        )
      }) as never,
    })
    expect(answer).toEqual({ started: true, topic: 'Ваза в интерьере' })
    expect(seen[0].url).toBe(
      'https://render.example/api/story/next?telegram_id=900000077'
    )
    expect((seen[0].init.headers as Record<string, string>)['X-Api-Key']).toBe(
      'k'
    )
    expect(JSON.parse(String(seen[0].init.body))).toEqual({
      bot: 'example_bot',
    })
  })

  it('never throws: a render that did not answer is said in words', async () => {
    const answer = await askNextStory('900000077', 'example_bot', {
      key: 'k',
      fetchImpl: (async () => {
        throw new Error('ECONNRESET')
      }) as never,
    })
    expect(answer.started).toBe(false)
    expect(storyReply(answer)).toMatch('не ответил')
  })

  it('without the server key asks nothing', async () => {
    let called = false
    const answer = await askNextStory('900000077', 'example_bot', {
      key: '',
      fetchImpl: (async () => {
        called = true
        return new Response('{}')
      }) as never,
    })
    expect(called).toBe(false)
    expect(answer.started).toBe(false)
  })

  it('tells her it is being made, and when it did not start, why', () => {
    expect(storyReply({ started: true, topic: 'Ваза' })).toMatch(
      'Делаю рилс «Ваза»'
    )
    expect(
      storyReply({ started: false, why: 'для рилса не хватает: голос' })
    ).toMatch('не хватает: голос')
  })
})
