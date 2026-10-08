/**
 * Spec bot-neuro-office.t27 (gHashTag/t27#7884), every test block run against
 * the bot's code in navigation/topics/office.ts -- whose rules ARE the spec's
 * generated functions -- then the behaviour: /office opens only at an admin's
 * word in a forum the bot manages and makes the whole team's channels; a
 * member named first is answered in an office and nowhere else; a channel
 * speaks as its member; a room carries no pay buttons.
 */
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import * as SPEC from './bot-neuro-office.gen'
import { TAB_KEYS } from './bot-topic-tabs.gen'
import {
  MEMBER_NAMES,
  answersInRoom,
  channelSpeaker,
  mayOpenOffice,
  memberNamedFirst,
  namedInOffice,
  officeChannelKind,
  payButtonsIn,
  hears,
  heardChars,
  namesSpeaker,
  speakerChars,
  speakerName,
  speakerLine,
  hearInOffice,
  mayCatchUp,
  catchUp,
  catchupAsk,
  CATCHUP_PARTS_TEXT,
  handsOff,
  handoffIn,
  handOffInOffice,
  registerOfficeCommand,
} from '@/navigation/topics/office'
import { setTopicTabsDbForTests } from '@/navigation/topics/tabs'
import {
  mayClose,
  mayTrack,
  ownerSource,
  taskChars,
} from '@/navigation/topics/officeTasks'

describe('spec bot-neuro-office.t27', () => {
  it("an office opens only in a forum, with the bot managing topics, at an admin's word", () => {
    expect(mayOpenOffice(true, true, true)).toBe(true)
    expect(mayOpenOffice(false, true, true)).toBe(false)
    expect(mayOpenOffice(true, false, true)).toBe(false)
    expect(mayOpenOffice(true, true, false)).toBe(false)
    expect(SPEC.OFFICE_TEAM_SIZE).toBe(6)
  })

  it("among people an agent answers only when spoken to; a member's name counts in an office only", () => {
    expect(answersInRoom(true, false, false, false, false)).toBe(true)
    expect(answersInRoom(false, true, false, false, false)).toBe(true)
    expect(answersInRoom(false, false, true, false, false)).toBe(true)
    expect(answersInRoom(false, false, false, true, true)).toBe(true)
    expect(answersInRoom(false, false, false, false, true)).toBe(false)
    expect(answersInRoom(false, false, false, true, false)).toBe(false)
    expect(answersInRoom(false, false, false, false, false)).toBe(false)
  })

  it('a channel speaks as its member, anywhere else as the Agent', () => {
    expect(channelSpeaker(true, 4)).toBe(4)
    expect(channelSpeaker(false, 4)).toBe(0)
    expect(channelSpeaker(true, 0)).toBe(0)
  })

  it('no pay buttons in a room', () => {
    expect(SPEC.ROOM_PAY_BUTTONS).toBe(false)
    expect(payButtonsIn(true)).toBe(false)
    expect(payButtonsIn(false)).toBe(true)
  })

  it('in an office the agent hears what people say to each other, and only that', () => {
    expect(SPEC.HEARS_PEOPLE).toBe(true)
    expect(hears(true, false, false, false)).toBe(true)
    expect(hears(false, false, false, false)).toBe(false)
    expect(hears(true, true, false, false)).toBe(false)
    expect(hears(true, false, true, false)).toBe(false)
    expect(hears(true, false, false, true)).toBe(false)
  })

  it('a heard line is kept up to a thousand characters', () => {
    expect(SPEC.HEARD_MAX_CHARS).toBe(1000)
    expect(heardChars(999)).toBe(999)
    expect(heardChars(1000)).toBe(1000)
    expect(heardChars(1001)).toBe(1000)
    expect(heardChars(0)).toBe(0)
  })

  it("a person's line in a room names who said it; a private chat names nobody", () => {
    expect(namesSpeaker(true)).toBe(true)
    expect(namesSpeaker(false)).toBe(false)
    expect(SPEC.SPEAKER_NAME_MAX_CHARS).toBe(64)
    expect(speakerChars(64)).toBe(64)
    expect(speakerChars(65)).toBe(64)
    expect(speakerChars(3)).toBe(3)
    // the host's own line and name
    const anna = { id: 7, first_name: 'Anna', last_name: 'K' }
    expect(speakerLine(anna, 'hi', true)).toBe('Anna K: hi')
    expect(speakerLine(anna, 'hi', false)).toBe('hi')
    expect([
      ...speakerName({ id: 1, first_name: 'x'.repeat(90) }),
    ]).toHaveLength(64)
  })

  it('a catch-up is asked only in an office, and names decisions, open questions and owners', () => {
    expect(SPEC.CATCHUP_ONLY_IN_OFFICE).toBe(true)
    expect(mayCatchUp(true)).toBe(true)
    expect(mayCatchUp(false)).toBe(false)
    expect(SPEC.CATCHUP_PARTS).toBe(3)
    // the host's own ask names exactly the spec's parts, numbered, in both languages
    expect(CATCHUP_PARTS_TEXT).toHaveLength(SPEC.CATCHUP_PARTS)
    for (const isRu of [true, false]) {
      const ask = catchupAsk(isRu)
      for (let i = 1; i <= SPEC.CATCHUP_PARTS; i++)
        expect(ask).toContain(`${i}) `)
      expect(ask).not.toContain(`${SPEC.CATCHUP_PARTS + 1}) `)
    }
  })

  it('an agent hands a task to a colleague once, in an office, never to itself', () => {
    expect(SPEC.HANDOFF_DEPTH_MAX).toBe(1)
    expect(handsOff(true, 0, true, false)).toBe(true)
    expect(handsOff(true, 1, true, false)).toBe(false)
    expect(handsOff(false, 0, true, false)).toBe(false)
    expect(handsOff(true, 0, false, false)).toBe(false)
    expect(handsOff(true, 0, true, true)).toBe(false)
    expect(SPEC.HANDOFF_IN_PERSONS_NAME).toBe(true)
  })

  it('the office keeps tasks with an owner, and only owner, author or admin closes one', () => {
    // the behaviour (the commands, the database) is in
    // src/__tests__/navigation/officeTasks.test.ts
    expect(mayTrack(true)).toBe(true)
    expect(mayTrack(false)).toBe(false)
    expect(SPEC.TASK_TEXT_MAX_CHARS).toBe(300)
    expect(taskChars(300)).toBe(300)
    expect(taskChars(301)).toBe(300)
    expect(ownerSource(true, true)).toBe(SPEC.OWNER_FROM_REPLY)
    expect(ownerSource(false, true)).toBe(SPEC.OWNER_FROM_MENTION)
    expect(ownerSource(false, false)).toBe(SPEC.OWNER_FROM_SENDER)
    expect(mayClose(true, false, false)).toBe(true)
    expect(mayClose(false, true, false)).toBe(true)
    expect(mayClose(false, false, true)).toBe(true)
    expect(mayClose(false, false, false)).toBe(false)
    expect(SPEC.OPEN_TASKS_SHOWN_MAX).toBe(20)
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(5)
    expect(TAB_KEYS).toHaveLength(SPEC.OFFICE_TEAM_SIZE)
  })
})

describe('the office in a group', () => {
  const OFFICE_ID = -1001234567890
  const rows = [
    { thread_id: 11, kind: 'agent', title: 'a', created_at: new Date() },
    { thread_id: 15, kind: 'wallet', title: 'w', created_at: new Date() },
  ]
  const db = (list: any[]) => ({
    query: async (sql: string) =>
      /^\s*SELECT/.test(sql) ? { rows: list } : { rows: [] },
  })
  const say = (text: string, thread?: number, bot = 'office_bot'): any => ({
    chat: { id: OFFICE_ID, type: 'supergroup' },
    botInfo: { username: bot, id: 42 },
    message: { text, ...(thread ? { message_thread_id: thread } : {}) },
  })

  it('a member named first, and only first, is heard', () => {
    expect(memberNamedFirst('Казначей, сколько?')).toBe(4) // cyrillic-ok: a person's words under test
    expect(memberNamedFirst('@navigator open hh')).toBe(2)
    expect(memberNamedFirst('спроси казначея')).toBe(6) // cyrillic-ok: a person's words under test
  })

  it('in an office a named member is spoken to; in another group it is not', async () => {
    setTopicTabsDbForTests(db(rows) as any)
    expect(await namedInOffice(say('Казначей, сколько?', 11, 'o1'))).toBe(true) // cyrillic-ok: a person's words under test
    expect(await namedInOffice(say('люди болтают', 11, 'o2'))).toBe(false) // cyrillic-ok: a person's words under test
    setTopicTabsDbForTests(db([]) as any)
    expect(await namedInOffice(say('Казначей, сколько?', 11, 'o3'))).toBe(false) // cyrillic-ok: a person's words under test
  })

  it("a channel speaks as its member; the office's other threads as the Agent; no office, no member", async () => {
    setTopicTabsDbForTests(db(rows) as any)
    expect(await officeChannelKind(say('x', 15, 'o4'))).toBe('wallet')
    expect(await officeChannelKind(say('x', 99, 'o5'))).toBe('agent')
    setTopicTabsDbForTests(db([]) as any)
    expect(await officeChannelKind(say('x', 15, 'o6'))).toBeUndefined()
  })

  describe('/office', () => {
    let made: any[]
    beforeEach(() => {
      made = []
      const store: any[] = []
      setTopicTabsDbForTests({
        query: async (sql: string, p: any[] = []) => {
          const q = sql.trim()
          if (q.startsWith('SELECT'))
            return { rows: store.map(r => ({ ...r })) }
          if (q.startsWith('INSERT')) {
            if (store.some(r => r.kind === p[3])) return { rows: [] }
            store.push({
              thread_id: p[2],
              kind: p[3],
              title: p[4],
              created_at: new Date(),
            })
            return { rows: [{ thread_id: p[2] }] }
          }
          if (q.startsWith('UPDATE')) {
            const r = store.find(x => x.thread_id === p[2])
            if (r) r.thread_id = p[3]
            return { rows: r ? [{ thread_id: p[3] }] : [] }
          }
          return { rows: [] }
        },
      } as any)
    })
    const run = async (opts: {
      forum?: boolean
      botAdmin?: boolean
      senderAdmin?: boolean
    }) => {
      let handler: any
      registerOfficeCommand({
        command: (name: string, h: any) => {
          if (name === 'office') handler = h
        },
      } as any)
      const replies: string[] = []
      let next = 300
      await handler({
        chat: {
          id: OFFICE_ID,
          type: 'supergroup',
          is_forum: opts.forum !== false,
        },
        from: { id: 7, language_code: 'ru' },
        botInfo: {
          username: `office_${Math.random().toString(36).slice(2, 8)}`,
          id: 42,
        },
        state: {},
        reply: async (t: string) => replies.push(t),
        telegram: {
          getChatMember: async (_: number, id: number) =>
            id === 42
              ? opts.botAdmin === false
                ? { status: 'member' }
                : { status: 'administrator', can_manage_topics: true }
              : {
                  status:
                    opts.senderAdmin === false ? 'member' : 'administrator',
                },
          callApi: async (method: string, payload: any) => {
            if (method === 'createForumTopic') {
              made.push(payload.name)
              return { message_thread_id: next++ }
            }
            return true
          },
        },
      })
      return replies
    }

    it('opens at an admin’s word and makes the whole team', async () => {
      const replies = await run({})
      expect(made).toHaveLength(SPEC.OFFICE_TEAM_SIZE)
      expect(replies.at(-1)).toMatch(/Нейроофис открыт/) // cyrillic-ok: user-facing copy under test
    })

    it('says what is missing and makes nothing otherwise', async () => {
      for (const opts of [
        { forum: false },
        { botAdmin: false },
        { senderAdmin: false },
      ]) {
        made = []
        const replies = await run(opts)
        expect(made).toHaveLength(0)
        expect(replies.at(-1)).toMatch(/пока не открыть/) // cyrillic-ok: user-facing copy under test
      }
    })
  })
})

describe('the office hears the room (v2)', () => {
  const ROOM = -1001234567891
  const rows = [
    { thread_id: 11, kind: 'agent', title: 'a', created_at: new Date() },
  ]
  const db = (list: any[]) => ({
    query: async (sql: string) =>
      /^\s*SELECT/.test(sql) ? { rows: list } : { rows: [] },
  })
  let n = 0
  const line = (text: any, from: any = { id: 5, first_name: 'Anna' }): any => ({
    chat: { id: ROOM, type: 'supergroup' },
    botInfo: { username: `hear_bot_${n++}`, id: 42 },
    from,
    message: { text, message_thread_id: 11 },
  })
  const recorder = () => {
    const calls: any[][] = []
    const record = async (...args: any[]) => {
      calls.push(args)
    }
    return { calls, record }
  }

  it("a person's line in an office is kept in the room's memory, named, never answered", async () => {
    setTopicTabsDbForTests(db(rows) as any)
    const r = recorder()
    expect(await hearInOffice(line('we ship on Friday'), r.record)).toBe(true)
    expect(r.calls).toEqual([
      [
        '5',
        [{ role: 'user', content: 'Anna: we ship on Friday' }],
        'bot',
        { room: String(ROOM) },
      ],
    ])
  })

  it('a group that is no office, a bot, a command, an empty line: nothing is heard', async () => {
    const r = recorder()
    setTopicTabsDbForTests(db([]) as any)
    expect(await hearInOffice(line('we ship on Friday'), r.record)).toBe(false)
    setTopicTabsDbForTests(db(rows) as any)
    expect(
      await hearInOffice(
        line('beep', { id: 9, is_bot: true, first_name: 'B' }),
        r.record
      )
    ).toBe(false)
    expect(await hearInOffice(line('/team'), r.record)).toBe(false)
    expect(await hearInOffice(line('   '), r.record)).toBe(false)
    expect(await hearInOffice(line(undefined), r.record)).toBe(false)
    const dm = { ...line('hi'), chat: { id: 5, type: 'private' } }
    expect(await hearInOffice(dm, r.record)).toBe(false)
    expect(r.calls).toEqual([])
  })

  it("a bot's line or a command costs no database read", async () => {
    let selects = 0
    setTopicTabsDbForTests({
      query: async (sql: string) => {
        if (/^\s*SELECT/.test(sql)) selects++
        return { rows: /^\s*SELECT/.test(sql) ? rows : [] }
      },
    } as any)
    const r = recorder()
    await hearInOffice(
      line('beep', { id: 9, is_bot: true, first_name: 'B' }),
      r.record
    )
    await hearInOffice(line('/office'), r.record)
    expect(selects).toBe(0)
    await hearInOffice(line('people talk'), r.record)
    expect(selects).toBe(1)
  })

  it('a long line is cut to the spec bound; a failed write never throws', async () => {
    setTopicTabsDbForTests(db(rows) as any)
    const r = recorder()
    await hearInOffice(line('y'.repeat(1500)), r.record)
    const content = r.calls[0][1][0].content as string
    expect(content).toBe(`Anna: ${'y'.repeat(SPEC.HEARD_MAX_CHARS)}`)
    const failing = async () => {
      throw new Error('render down')
    }
    expect(await hearInOffice(line('still fine'), failing)).toBe(false)
  })

  it('a person without a first name is named by @username, then by id', () => {
    expect(speakerName({ id: 3, username: 'boris' })).toBe('@boris')
    expect(speakerName({ id: 3 })).toBe('3')
    expect(speakerName({ id: 3, first_name: ' Anna \n K ' })).toBe('Anna K')
  })
})

describe('/catchup (v3)', () => {
  const ROOM = -1001234567892
  const db = (list: any[]) => ({
    query: async (sql: string) =>
      /^\s*SELECT/.test(sql) ? { rows: list } : { rows: [] },
  })
  let n = 0
  const ctxIn = (chatType = 'supergroup', thread = 15): any => {
    const replies: string[] = []
    return {
      replies,
      chat: { id: chatType === 'private' ? 5 : ROOM, type: chatType },
      botInfo: { username: `catchup_bot_${n++}`, id: 42 },
      from: { id: 5, first_name: 'Anna' },
      message: { text: '/catchup', message_thread_id: thread },
      reply: async (t: string) => {
        replies.push(t)
      },
    }
  }
  const office = [
    { thread_id: 11, kind: 'agent', title: 'a', created_at: new Date() },
    { thread_id: 15, kind: 'wallet', title: 'w', created_at: new Date() },
  ]

  it('in an office the agent is asked as the person, in the room, from the channel member', async () => {
    setTopicTabsDbForTests(db(office) as any)
    const asked: any[] = []
    const ctx = ctxIn()
    const r = await catchUp(ctx, async (id, text, opts) => {
      asked.push([id, text, opts])
      return { текст: 'Decided: ship Friday.' } // cyrillic-ok: field of the agent answer
    })
    expect(r).toBe('answered')
    expect(asked).toHaveLength(1)
    expect(asked[0][0]).toBe('5')
    expect(asked[0][1]).toBe(catchupAsk(false))
    expect(asked[0][2]).toEqual({
      room: String(ROOM),
      member: 'wallet',
      speaker: 'Anna',
    })
    expect(ctx.replies).toEqual(['Decided: ship Friday.'])
  })

  it('/catchup is registered beside /office', () => {
    const names: string[] = []
    registerOfficeCommand({
      command: (name: string) => {
        names.push(name)
      },
    } as any)
    expect(names).toEqual(expect.arrayContaining(['office', 'catchup']))
  })

  it('outside an office it says where it works and asks nobody', async () => {
    for (const [type, rows] of [
      ['supergroup', []],
      ['private', office],
    ] as const) {
      setTopicTabsDbForTests(db([...rows]) as any)
      let asked = 0
      const ctx = ctxIn(type)
      const r = await catchUp(ctx, async () => {
        asked++
        return { текст: 'x' } // cyrillic-ok: field of the agent answer
      })
      expect(r).toBe('not an office')
      expect(asked).toBe(0)
      expect(ctx.replies[0]).toMatch(/office/)
    }
  })

  it('a failed or empty answer is said, never silence', async () => {
    setTopicTabsDbForTests(db(office) as any)
    for (const ask of [
      async () => {
        throw new Error('render down')
      },
      async () => ({ текст: '   ' }), // cyrillic-ok: field of the agent answer
    ]) {
      const ctx = ctxIn()
      expect(await catchUp(ctx, ask as any)).toBe('failed')
      expect(ctx.replies).toHaveLength(1)
      expect(ctx.replies[0]).toMatch(/catchup/)
    }
  })
})

describe('hand-off between members (v4)', () => {
  const ROOM = -1001234567893
  const db = (list: any[]) => ({
    query: async (sql: string) =>
      /^\s*SELECT/.test(sql) ? { rows: list } : { rows: [] },
  })
  const office = [
    { thread_id: 11, kind: 'agent', title: 'a', created_at: new Date() },
    { thread_id: 12, kind: 'reels', title: 'r', created_at: new Date() },
    { thread_id: 15, kind: 'wallet', title: 'w', created_at: new Date() },
  ]
  let n = 0
  const ctxIn = (thread = 12, chatType = 'supergroup'): any => {
    const replies: string[] = []
    return {
      replies,
      chat: { id: ROOM, type: chatType },
      botInfo: { username: `handoff_bot_${n++}`, id: 42 },
      from: { id: 5, first_name: 'Anna', language_code: 'en' },
      message: { text: 'x', message_thread_id: thread },
      reply: async (t: string) => {
        replies.push(t)
      },
    }
  }

  it('the first line naming a colleague is the hand-off; the member itself is skipped', () => {
    expect(
      handoffIn('Director: on it.\nTreasurer, count the budget.', 'reels')
    ).toEqual({
      kind: 'wallet',
      text: 'Treasurer, count the budget.',
    })
    expect(handoffIn('Director: on it.', 'reels')).toBeNull()
    expect(handoffIn('I will ask the treasurer later.', 'reels')).toBeNull()
  })

  it("the colleague is asked once, in the person's name, and answers under its own name", async () => {
    setTopicTabsDbForTests(db(office) as any)
    const asked: any[] = []
    const ctx = ctxIn()
    const r = await handOffInOffice(
      ctx,
      'make a reel for the launch',
      'Sure.\nTreasurer, count the budget for it.',
      async (id, text, opts) => {
        asked.push([id, text, opts])
        // even if the colleague names someone else, nothing is handed on
        return { текст: 'Navigator, check prices. Budget: 300 tokens.' } // cyrillic-ok: field of the agent answer
      }
    )
    expect(r).toBe('handed')
    expect(asked).toEqual([
      [
        '5',
        'Treasurer, count the budget for it.',
        { room: String(ROOM), member: 'wallet', speaker: '🎬 Director' },
      ],
    ])
    expect(ctx.replies).toEqual([
      '💰 Treasurer: Navigator, check prices. Budget: 300 tokens.',
    ])
  })

  it('a member named first by the person speaks; its own label is no hand-off', async () => {
    setTopicTabsDbForTests(db(office) as any)
    let asked = 0
    const ctx = ctxIn(12)
    const r = await handOffInOffice(
      ctx,
      'Treasurer, how much?',
      'Treasurer: 300 tokens.',
      async () => {
        asked++
        return { текст: 'x' } // cyrillic-ok: field of the agent answer
      }
    )
    expect(r).toBe('none')
    expect(asked).toBe(0)
  })

  it('no office, a private chat: no hand-off', async () => {
    let asked = 0
    const ask = async () => {
      asked++
      return { текст: 'x' } // cyrillic-ok: field of the agent answer
    }
    setTopicTabsDbForTests(db([]) as any)
    expect(await handOffInOffice(ctxIn(), 'x', 'Treasurer, count.', ask)).toBe(
      'none'
    )
    setTopicTabsDbForTests(db(office) as any)
    expect(
      await handOffInOffice(ctxIn(12, 'private'), 'x', 'Treasurer, count.', ask)
    ).toBe('none')
    expect(asked).toBe(0)
  })

  it('a colleague who does not answer is said, never silence', async () => {
    setTopicTabsDbForTests(db(office) as any)
    for (const ask of [
      async () => {
        throw new Error('render down')
      },
      async () => ({ текст: '  ' }), // cyrillic-ok: field of the agent answer
    ]) {
      const ctx = ctxIn()
      expect(
        await handOffInOffice(ctx, 'x', 'Treasurer, count.', ask as any)
      ).toBe('failed')
      expect(ctx.replies).toEqual([
        '💰 Treasurer did not answer just now. Call them by name again.',
      ])
    }
  })
})

describe('one word list in the bot and the render', () => {
  it('MEMBER_NAMES is the same in both', () => {
    const render = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        '..',
        'apps/vibee-editor/render/src/agent/profession.ts'
      ),
      'utf8'
    )
    for (const [kind, words] of Object.entries(MEMBER_NAMES)) {
      const line =
        new RegExp(`\\n  ${kind}: \\[([^\\]]*)\\]`).exec(render)?.[1] ?? ''
      const renderWords = [...line.matchAll(/'([^']+)'/g)].map(m => m[1])
      expect(renderWords, kind).toEqual([...words])
    }
  })
})
