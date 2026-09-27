import { describe, expect, it } from 'vitest'
import {
  cardButtons,
  defaultGroupCaption,
  groupCardText,
  offerGroupCard,
  storyTurn,
  type CardPort,
  type GroupCardOffer,
} from './story-card'
import { liveCardPort } from './story-deps'
import { forgetProposals, issueFor, pendingFor, remember } from './tg-proposals'
import type { AgentTool } from './tools'

/**
 * A FINISHED REEL'S CARD FOR THE CLIENT'S GROUP.
 *
 * Pinned: it never displaces a card the seller has not answered (a waiting
 * CRM card may carry a paid picture); the secret comes out once, under the
 * job's own turn; the card carries the same tgp:ok / tgp:no buttons the bot
 * answers for every other card; the draft is made AS THE SELLER on the bot
 * surface, so the press goes the one confirmed way.
 */
const SELLER = '900000001'
const OFFER: GroupCardOffer = {
  jobId: 7,
  owner: SELLER,
  chat: '-900000061',
  groupTitle: 'VIP',
  url: 'https://bucket.example/reel.mp4',
  caption: 'Лена, ваш рилс!',
  name: 'Лена',
  topic: 'Ваза',
  withVideo: false,
}

function port(over: Partial<CardPort> = {}) {
  const posts: any[] = []
  const drafts: any[] = []
  const p: CardPort = {
    queueFree: () => true,
    draft: async (owner, turn, send) => (
      drafts.push({ owner, turn, send }),
      { id: 'abc123abc123' }
    ),
    issue: () => ({ id: 'abc123abc123', secret: 's'.repeat(32) }),
    post: async (chat, text, buttons, video) => (
      posts.push({ chat, text, buttons, video }),
      true
    ),
    ...over,
  }
  return { p, posts, drafts }
}

describe('the group card', () => {
  it('shows one card in the seller chat with the send and cancel buttons', async () => {
    const { p, posts, drafts } = port()
    expect(await offerGroupCard(p, OFFER)).toBe('shown')
    expect(drafts).toEqual([
      {
        owner: SELLER,
        turn: storyTurn(7),
        send: { chat: OFFER.chat, url: OFFER.url, caption: OFFER.caption },
      },
    ])
    expect(posts).toHaveLength(1)
    expect(posts[0].chat).toBe(SELLER)
    expect(posts[0].video).toBeUndefined()
    const data = posts[0].buttons.flat().map((b: any) => b.callback_data)
    expect(data).toEqual([
      `tgp:ok:abc123abc123:${'s'.repeat(32)}`,
      `tgp:no:abc123abc123:${'s'.repeat(32)}`,
    ])
    // Telegram's 64-byte callback budget.
    for (const d of data) expect(Buffer.byteLength(d)).toBeLessThanOrEqual(64)
    expect(posts[0].text).toContain('«VIP»')
    expect(posts[0].text).toContain('увидят все участники')
    expect(posts[0].text).toContain(OFFER.caption)
  })

  it('attaches the video only where it is not in the chat yet', async () => {
    const { p, posts } = port()
    await offerGroupCard(p, { ...OFFER, withVideo: true })
    expect(posts[0].video).toBe(OFFER.url)
  })

  it('never displaces a card the seller has not answered: waits, drafting nothing', async () => {
    const { p, posts, drafts } = port({ queueFree: () => false })
    expect(await offerGroupCard(p, OFFER)).toBe('busy')
    expect(drafts).toHaveLength(0)
    expect(posts).toHaveLength(0)
  })

  it('a draft refused (the client said stop, no session) shows nothing', async () => {
    const { p, posts } = port({ draft: async () => null })
    expect(await offerGroupCard(p, OFFER)).toBe('failed')
    expect(posts).toHaveLength(0)
  })

  it('a secret issued for some other draft is not put on this card', async () => {
    const { p, posts } = port({
      issue: () => ({ id: 'other0other0', secret: 'x'.repeat(32) }),
    })
    expect(await offerGroupCard(p, OFFER)).toBe('failed')
    expect(posts).toHaveLength(0)
  })

  it('to her DM the card asks about a gift, not a group, and the button says so', async () => {
    const { p, posts } = port()
    await offerGroupCard(p, {
      ...OFFER,
      chat: '900000077',
      dm: true,
      groupTitle: null,
    })
    expect(posts[0].text).toContain('в личку')
    expect(posts[0].text).not.toContain('все участники')
    expect(posts[0].buttons[0][0].text).toBe('✅ Отправить')
  })

  it('the default caption names her, says whose face and voice, and links her page', () => {
    const c = defaultGroupCaption(
      'Лена',
      'Ваза',
      'https://t.me/b?start=app_story'
    )
    expect(c).toContain('Лена')
    expect(c).toContain('«Ваза»')
    expect(c).toContain('https://t.me/b?start=app_story')
    expect(defaultGroupCaption('', 'Ваза', '')).not.toContain('undefined')
  })

  it('the card text stays under the caption limit', () => {
    const long = { ...OFFER, caption: 'x'.repeat(3000) }
    expect(groupCardText(long).length).toBeLessThanOrEqual(1000)
    expect(cardButtons('a', 'b')).toHaveLength(1)
  })
})

describe('the live port', () => {
  it('drafts tg_send_video AS THE SELLER on the bot surface, under the job turn, as a gift', async () => {
    const calls: any[] = []
    const tool: AgentTool = {
      name: 'tg_send_video',
      description: '',
      parameters: {},
      handler: async (args: unknown, ctx: unknown) => (
        calls.push({ args, ctx }),
        { proposal: true, id: 'abc123abc123' }
      ),
    } as never
    const live = liveCardPort({ query: async () => ({ rows: [] }) }, name =>
      name === 'tg_send_video' ? tool : undefined
    )
    const d = await live.draft(SELLER, storyTurn(7), {
      chat: OFFER.chat,
      url: OFFER.url,
      caption: OFFER.caption,
    })
    expect(d).toEqual({ id: 'abc123abc123' })
    expect(calls[0].args).toEqual({
      chat: OFFER.chat,
      url: OFFER.url,
      caption: OFFER.caption,
      gift: true,
    })
    expect(calls[0].ctx).toMatchObject({
      telegramId: SELLER,
      surface: 'bot',
      turn: 'story:7',
    })
  })

  it('the queue is free only when nothing at all is pending for the seller', () => {
    forgetProposals()
    const live = liveCardPort(
      { query: async () => ({ rows: [] }) },
      () => undefined
    )
    expect(live.queueFree(SELLER)).toBe(true)
    remember({
      id: 'pend0pend0pe',
      telegramId: SELLER,
      action: 'send',
      target: '900000077',
      what: 'hi',
      turn: 't1',
    } as never)
    expect(pendingFor(SELLER)).not.toBeNull()
    expect(live.queueFree(SELLER)).toBe(false)
    // The secret of THAT draft stays with its own turn.
    expect(live.issue(SELLER, storyTurn(7))).toBeNull()
    expect(issueFor(SELLER, 't1')).not.toBeNull()
    forgetProposals()
  })
})
