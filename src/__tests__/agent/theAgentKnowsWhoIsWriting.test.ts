/**
 * THE AGENT IS TOLD WHO IT IS WRITING TO.
 *
 * Owner, 2026-09-20: "the tone of voice is wrong -- make the agent know
 * everything Telegram openly gives about the person". It knew a telegram id
 * and nothing else, so it wrote to a first-time visitor and to a paying
 * customer of a year in exactly the same voice.
 *
 * What is pinned here is the whole path, because each half is useless alone:
 * the card is built from what Telegram gives, it degrades instead of throwing,
 * an unknown person produces NOTHING rather than a row of blanks, and the line
 * actually travels in the request body.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  cardFromUpdate,
  personCard,
  describeForPrompt,
} from '@/services/telegramPersonCard'

vi.mock('@/utils/logger', () => ({
  logger: {
    info: () => undefined,
    warn: () => undefined,
    debug: () => undefined,
    error: () => undefined,
  },
}))

describe('what Telegram openly says about the person', () => {
  it('takes from the update what arrived with the message', () => {
    const card = cardFromUpdate({
      id: 900000142,
      first_name: 'Rehearsal',
      username: 'someone',
      language_code: 'ru',
      is_premium: true,
    })
    expect(card).toEqual({
      telegramId: '900000142',
      firstName: 'Rehearsal',
      username: 'someone',
      languageCode: 'ru',
      isPremium: true,
    })
  })

  /*
   * ABSENT, NOT BLANK. A field nobody filled in must be missing from the card
   * -- a prompt listing "last name: unknown" teaches the model it knows a last
   * name, and the thing it knows is nothing.
   */
  it('leaves out what nobody said, instead of filling it in', () => {
    const card = cardFromUpdate({ id: 900000143 })
    expect(Object.keys(card)).toEqual(['telegramId'])
    expect(describeForPrompt(card)).toBe('')
  })

  /*
   * A LOCKED-DOWN PROFILE IS NOT AN ERROR. getChat fails for a person who
   * hides theirs, and that must cost them nothing: the fields from the update
   * arrived with the message and survive whatever the network says.
   */
  it('survives a profile that refuses to be read', async () => {
    const card = await personCard(
      {
        getChat: vi.fn(async () => {
          throw new Error('Bad Request: user not found')
        }),
        getUserProfilePhotos: vi.fn(async () => {
          throw new Error('Forbidden')
        }),
      } as never,
      { id: 900000144, first_name: 'Quiet' }
    )
    expect(card.firstName).toBe('Quiet')
    expect(card.bio).toBeUndefined()
    expect(card.hasPhoto).toBeUndefined()
  })

  it('reads the bio and whether there is a face, when they are shown', async () => {
    const card = await personCard(
      {
        getChat: vi.fn(async () => ({ bio: 'фотограф' })), // cyrillic-ok: fixture text
        getUserProfilePhotos: vi.fn(async () => ({ total_count: 3 })),
      } as never,
      { id: 900000145, first_name: 'Open', language_code: 'en' }
    )
    expect(card.bio).toBe('фотограф') // cyrillic-ok: fixture text
    expect(card.hasPhoto).toBe(true)
    const line = describeForPrompt(card)
    expect(line).toContain('Open')
    expect(line).toContain('en')
    expect(line).toContain('фотограф') // cyrillic-ok: fixture text
  })
})

/**
 * THE LINE TRAVELS. The render places it; the bot is the only one that can see
 * it, so a line that is built and never sent is the same as no line at all.
 */
describe('the line reaches the agent', () => {
  afterEach(() => vi.unstubAllGlobals())

  const bodiesOf = () => {
    const bodies: any[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: any) => {
        if (String(url).includes('/api/agent/history'))
          return { ok: true, status: 200, json: async () => ({ messages: [] }) }
        bodies.push(JSON.parse(String(init?.body ?? '{}')))
        return {
          ok: true,
          status: 200,
          body: null,
          text: async () => '',
          json: async () => ({}),
        }
      })
    )
    return bodies
  }

  it('sends person_note when there is something to say, and omits it otherwise', async () => {
    process.env.RENDER_API_KEY = 'k-for-tests' // secret-guard-ok: invented for this test
    const { спроситьАгента } = await import('@/services/trinityAgent') // cyrillic-ok: pre-existing identifier
    const bodies = bodiesOf()
    await /* cyrillic-ok */ спроситьАгента('900000146', 'привет', {
      personNote: 'Собеседник: Open, @open.', // cyrillic-ok: prompt text
    }).catch(() => undefined)
    await /* cyrillic-ok */ спроситьАгента('900000146', 'привет').catch(
      () => undefined
    )
    const chat = bodies.filter(b => Array.isArray(b.messages))
    expect(chat).toHaveLength(2)
    expect(chat[0].person_note).toContain('Open')
    expect('person_note' in chat[1]).toBe(false)
  })
})
