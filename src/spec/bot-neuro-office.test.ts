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
  registerOfficeCommand,
} from '@/navigation/topics/office'
import { setTopicTabsDbForTests } from '@/navigation/topics/tabs'

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

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(1)
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
        command: (_: string, h: any) => (handler = h),
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
