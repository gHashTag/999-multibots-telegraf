import { afterEach, describe, expect, it } from 'vitest'
import {
  CONNECT_LINK,
  SOCIAL_TOOLS,
  approvalText,
  draftOf,
  setSocialDepsForTests,
  todoOf,
  type SocialDeps,
  type SocialStatus,
} from './social-tools'
import { OWNER_TELEGRAM_ID } from './telegram-tools'
import { TOOLS } from './tools'

/*
 * THE SOCIAL DESK. Nothing here reaches a network: `publish` and `status`
 * are fakes, and the permission card is a list of answers.
 */

const OWNER = OWNER_TELEGRAM_ID
const ctx = (id = OWNER) => ({ telegramId: id, pool: {} as any })
const tool = (name: string) => SOCIAL_TOOLS.find(t => t.name === name)!
const post = tool('social_post')
const status = tool('social_status')

const ARTICLE = {
  title: 'The seed moved it',
  link: 'https://t27.ai/blog/the-seed-moved-it',
  summary: 'Pins moved it more.',
}

const texts = (p: { title: string; summary: string }) => ({
  threads: `T:${p.title}`,
  facebook: `F:${p.title}`,
  linkedin: `L:${p.title}`,
  x: `X:${p.title}`,
})

function connected(...nets: string[]): SocialStatus {
  return {
    apps: { threads: true, facebook: true, linkedin: true, x: true },
    networks: nets.map(n => ({ network: n, usable: true })),
  }
}

/** The fakes, and what they saw. */
function fakes(states: string[], st: SocialStatus, answeredBy = OWNER) {
  const seen = {
    asked: [] as string[],
    published: [] as Array<{ title: string; only: readonly string[] }>,
  }
  const d: Partial<SocialDeps> = {
    ask: async (_c, what) => {
      seen.asked.push(what)
      return `card-${seen.asked.length}`
    },
    answer: async () => {
      const state = states.length > 1 ? states.shift()! : states[0]
      return { state, telegramId: answeredBy }
    },
    sleep: async () => {},
    texts: texts as never,
    status: async () => st,
    publish: async (_c, p, only) => {
      seen.published.push({ title: p.title, only })
      return Object.fromEntries(only.map(n => [n, 'ok']))
    },
  }
  setSocialDepsForTests(d)
  return seen
}

afterEach(() => setSocialDepsForTests(null))

describe('the social desk is in the shared registry', () => {
  it('both tools are in TOOLS, once each (chat and /mcp see them)', () => {
    for (const name of ['social_status', 'social_post']) {
      expect(TOOLS.filter(t => t.name === name)).toHaveLength(1)
    }
  })
})

describe('only the owner', () => {
  it.each(['social_status', 'social_post'])(
    '%s refuses anyone else',
    async n => {
      fakes(['allowed'], connected('x'))
      await expect(tool(n).handler(ARTICLE, ctx('42'))).rejects.toThrow()
      await expect(
        tool(n).handler(ARTICLE, undefined as never)
      ).rejects.toThrow()
    }
  )
})

describe('draftOf checks the post before anything is shown', () => {
  it('defaults to all four networks', () => {
    expect(draftOf(ARTICLE).networks).toEqual([
      'threads',
      'facebook',
      'linkedin',
      'x',
    ])
  })

  it('lowercases and de-duplicates the networks', () => {
    expect(
      draftOf({ ...ARTICLE, networks: ['X', 'x', 'LinkedIn'] }).networks
    ).toEqual(['x', 'linkedin'])
  })

  it.each([
    [{ ...ARTICLE, title: '' }, /title/],
    [{ ...ARTICLE, title: 'a'.repeat(301) }, /title/],
    [{ ...ARTICLE, summary: '' }, /summary/],
    [{ ...ARTICLE, summary: 'a'.repeat(1501) }, /summary/],
    [{ ...ARTICLE, link: 'http://t27.ai' }, /link/],
    [{ ...ARTICLE, link: 'javascript:alert(1)' }, /link/],
    [{ ...ARTICLE, image_url: 'file:///etc/passwd' }, /image_url/],
    [{ ...ARTICLE, networks: ['myspace'] }, /unknown network/],
    [{ ...ARTICLE, networks: [] }, /empty/],
    [{ ...ARTICLE, networks: 'x' }, /array/],
  ])('refuses %j', (args, why) => {
    expect(() => draftOf(args as never)).toThrow(why)
  })

  it('a missing picture is empty, so Instagram is skipped', () => {
    expect(draftOf(ARTICLE).post.cardUrl).toBe('')
  })
})

describe("the owner's card", () => {
  it("carries each chosen network's own text, and Facebook's link", () => {
    const card = approvalText(
      { post: { ...draftOf(ARTICLE).post }, networks: ['facebook', 'x'] },
      texts as never
    )
    expect(card).toContain('F:The seed moved it\n' + ARTICLE.link)
    expect(card).toContain('X:The seed moved it')
    expect(card).not.toContain('T:')
    expect(card).not.toContain('Instagram')
  })

  it('names Instagram only when Facebook goes with a picture', () => {
    const d = draftOf({ ...ARTICLE, image_url: 'https://t27.ai/card.jpg' })
    expect(approvalText(d, texts as never)).toContain('https://t27.ai/card.jpg')
  })

  it('is clipped to fit one Telegram message', () => {
    const long = { ...ARTICLE, summary: 'a'.repeat(1500) }
    const big = (p: any) => ({
      threads: p.summary,
      facebook: p.summary,
      linkedin: p.summary,
      x: p.summary,
    })
    expect(approvalText(draftOf(long), big as never).length).toBeLessThan(3300)
  })
})

describe('what is left before the first post', () => {
  it('names each state, and never claims an unknown network is fine', () => {
    const todo = todoOf({
      apps: { threads: true, facebook: true, linkedin: false, x: true },
      networks: [
        { network: 'threads', usable: true },
        { network: 'facebook', usable: false },
      ],
    })
    expect(todo.threads).toMatch(/connected/)
    expect(todo.facebook).toMatch(/expired/)
    expect(todo.facebook).toContain(CONNECT_LINK)
    expect(todo.linkedin).toMatch(/tri meta put/)
    expect(todo.x).toMatch(/not connected/)
  })

  it('social_status returns the todo and the link', async () => {
    fakes([], connected('x'))
    const r: any = await status.handler({}, ctx())
    expect(r.connect).toBe(CONNECT_LINK)
    expect(r.todo.x).toMatch(/connected/)
    expect(r.todo.threads).toMatch(/not connected/)
  })
})

describe('prepare, then the tap, then exactly one post', () => {
  it('nothing connected: blocked, and the owner is not asked', async () => {
    const seen = fakes(['allowed'], connected())
    const r: any = await post.handler(ARTICLE, ctx())
    expect(r.posted).toBe(false)
    expect(r.blocked).toBeTruthy()
    expect(r.connect).toBe(CONNECT_LINK)
    expect(seen.asked).toHaveLength(0)
    expect(seen.published).toHaveLength(0)
  })

  it('the first call only asks; the unconnected networks are skipped', async () => {
    const seen = fakes(['allowed'], connected('x', 'linkedin'))
    const r: any = await post.handler(ARTICLE, ctx())
    expect(r.posted).toBe(false)
    expect(r.approval).toBe('card-1')
    expect(r.networks).toEqual(['linkedin', 'x'])
    expect(Object.keys(r.skipped).sort()).toEqual(['facebook', 'threads'])
    expect(seen.asked[0]).toContain('X:The seed moved it')
    expect(seen.asked[0]).not.toContain('T:')
    expect(seen.published).toHaveLength(0)
  })

  it('posts after Allow, once, to the stored networks only', async () => {
    const seen = fakes(['pending', 'allowed'], connected('x', 'threads'))
    const { approval }: any = await post.handler(
      { ...ARTICLE, networks: ['x'] },
      ctx()
    )
    const r: any = await post.handler({ approval }, ctx())
    expect(r.posted).toBe(true)
    expect(seen.published).toEqual([{ title: ARTICLE.title, only: ['x'] }])
    // The card is spent: the same id cannot post twice.
    const again: any = await post.handler({ approval }, ctx())
    expect(again.posted).toBe(false)
    expect(again.refused).toMatch(/no prepared post/)
    expect(seen.published).toHaveLength(1)
  })

  it('a denied card posts nothing and is spent', async () => {
    const seen = fakes(['denied'], connected('x'))
    const { approval }: any = await post.handler(ARTICLE, ctx())
    const r: any = await post.handler({ approval }, ctx())
    expect(r.refused).toMatch(/did not allow/)
    expect(seen.published).toHaveLength(0)
  })

  it('a card answered by someone else posts nothing', async () => {
    const seen = fakes(['allowed'], connected('x'), '42')
    const { approval }: any = await post.handler(ARTICLE, ctx())
    const r: any = await post.handler({ approval }, ctx())
    expect(r.refused).toMatch(/someone else/)
    expect(seen.published).toHaveLength(0)
  })

  it('an unknown card id posts nothing', async () => {
    const seen = fakes(['allowed'], connected('x'))
    const r: any = await post.handler({ approval: 'card-999' }, ctx())
    expect(r.refused).toMatch(/no prepared post/)
    expect(seen.published).toHaveLength(0)
  })
})
