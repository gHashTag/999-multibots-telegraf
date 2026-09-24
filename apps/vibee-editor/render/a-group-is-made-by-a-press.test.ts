import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * A GROUP MADE FROM HIS ACCOUNT CARRIES HIS NAME, AND CANNOT BE UN-MADE.
 *
 * Owner, 2026-09-24: "create groups by the target audience of the bots."
 * Deleting a group does not unsee it: everyone who was invited saw the
 * owner open a room. So this is a card he presses, like every act that
 * leaves the machine and reaches other people -- and the room is created
 * EMPTY, because one press must not stand for twenty invitations.
 */
const OWNER = '900000091'

const card = (extra: Record<string, unknown> = {}) =>
  ({
    id: 'card-group-1',
    telegramId: OWNER,
    action: 'create-group',
    target: 'Боты: наниматели',
    what: 'Боты: наниматели',
    createdAt: Date.now(),
    ...extra,
  }) as never

/** A client that remembers the raw request instead of reaching Telegram. */
function fakeClient() {
  const sent: Array<Record<string, unknown>> = []
  vi.doMock('./src/agent/telegram-tools', async importOriginal => {
    const actual =
      await importOriginal<typeof import('./src/agent/telegram-tools')>()
    return {
      ...actual,
      client: async () => ({
        invoke: async (req: unknown) => {
          sent.push({
            kind: (req as { className?: string })?.className ?? 'unknown',
            ...(req as Record<string, unknown>),
          })
          return { chats: [{ id: 777 }] }
        },
        getDialogs: async () => [],
        disconnect: async () => undefined,
      }),
    }
  })
  return sent
}

describe('a group is made by a press, never by a sentence', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doUnmock('./src/agent/telegram-tools')
  })

  it('the press creates a MEGAGROUP with the title from the card', async () => {
    const sent = fakeClient()
    const { execute } = await import('./src/agent/tg-proposals')
    const r = await execute(card(), { telegramId: OWNER, pool: null as never })
    expect(r).toMatchObject({ done: true })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      title: 'Боты: наниматели',
      megagroup: true,
    })
    // Not a broadcast channel: the audience is meant to talk back.
    expect(sent[0].broadcast).toBeFalsy()
  })

  it('a card with no title is refused, and no session is opened', async () => {
    const sent = fakeClient()
    const { execute } = await import('./src/agent/tg-proposals')
    const r = await execute(card({ what: '   ', target: '   ' }), {
      telegramId: OWNER,
      pool: null as never,
    })
    expect(r).toMatchObject({ done: false })
    expect((r as { why: string }).why).toContain('названия')
    expect(sent, 'a refused card reached Telegram').toEqual([])
  })

  it('a title Telegram would refuse is refused HERE, before the press acts', async () => {
    /*
     * Telegram caps a title at 128 characters. Refusing here means the card
     * never promises the person something the press cannot do -- the worst
     * outcome of that pair being "I pressed it and nothing happened".
     */
    const sent = fakeClient()
    const { execute } = await import('./src/agent/tg-proposals')
    const long = 'я'.repeat(129)
    const r = await execute(card({ what: long, target: long }), {
      telegramId: OWNER,
      pool: null as never,
    })
    expect(r).toMatchObject({ done: false })
    expect((r as { why: string }).why).toContain('128')
    expect(sent).toEqual([])
  })

  it('nobody is added: creating and inviting are two presses', async () => {
    const sent = fakeClient()
    const { execute } = await import('./src/agent/tg-proposals')
    await execute(card(), { telegramId: OWNER, pool: null as never })
    // The request carries no users at all. A press that both opened a room
    // and pulled contacts into it would be one press for twenty decisions.
    expect(sent[0].users).toBeFalsy()
  })

  it('the action is one the queue may accept', async () => {
    const { EXECUTABLE_ACTIONS } = await import('./src/agent/tg-proposals')
    /*
     * Derived from the executor table, never restated: a tool that queues a
     * draft nothing can carry out leaves the person pressing a button that
     * answers "not made yet".
     */
    expect(EXECUTABLE_ACTIONS.has('create-group')).toBe(true)
  })
})
