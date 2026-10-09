/**
 * Spec bot-topic-tabs.t27 (gHashTag/t27#7388, v2 #7451), every test block run
 * against the render's copy of the engine (../topic-tabs-engine.ts), the one
 * tabs_status and tabs_setup use. The bot runs the same blocks against its
 * own copy in src/spec/bot-topic-tabs.test.ts at the repository root, and a
 * parity test there keeps the two engine files byte-identical.
 *
 * The render never names a person's topic and never routes a reply into one,
 * so the naming bound and the thread injection are checked here through the
 * engine's rules and the first message of each tab it makes.
 */
import { describe, expect, it } from 'vitest'
import * as SPEC from './bot-topic-tabs.gen'
import { createTopicTabs, threadMissing, type Db } from '../topic-tabs-engine'

const quiet = { warn: () => undefined }
const E = createTopicTabs({ spec: SPEC, db: () => null, log: quiet })

/** Just enough of bot_topic_tabs for one person making their tabs. */
function tinyDb(): Db {
  const rows: any[] = []
  return {
    async query(sql: string, p: any[] = []) {
      const q = sql.trim()
      if (q.startsWith('SELECT'))
        return { rows: rows.filter(r => r.bot === p[0] && r.tid === p[1]) }
      if (q.startsWith('INSERT')) {
        if (rows.some(r => r.kind === p[3])) return { rows: [] }
        rows.push({ bot: p[0], tid: p[1], thread_id: p[2], kind: p[3] })
        return { rows: [{ thread_id: p[2] }] }
      }
      if (q.startsWith('UPDATE')) {
        const r = rows.find(x => x.thread_id === p[2])
        if (r) r.thread_id = p[3]
        return { rows: r ? [{ thread_id: p[3] }] : [] }
      }
      return { rows: [] }
    },
  }
}

describe('spec bot-topic-tabs.t27 (render engine)', () => {
  it('the table has six tabs, each in a colour Telegram accepts, no two alike', () => {
    expect(E.TABS).toHaveLength(SPEC.TAB_COUNT)
    expect(E.tableColorsAllowed()).toBe(true)
    expect(E.tableColorsDistinct()).toBe(true)
    expect(E.colorAllowed(7322096)).toBe(true)
    expect(E.colorAllowed(9363846)).toBe(false)
    expect(E.colorAllowed(0)).toBe(false)
    expect(E.TABS.map(t => t.kind)).toEqual([...SPEC.TAB_KEYS])
    expect(E.TABS.map(t => t.color)).toEqual([...SPEC.TAB_COLORS])
    expect(E.TABS.map(t => t.route)).toEqual([...SPEC.TAB_ROUTES])
    for (const [i, t] of E.TABS.entries())
      expect(t.en).toBe(
        `${String.fromCodePoint(SPEC.TAB_EMOJI[i])} ${SPEC.TAB_TITLES_EN[i]}`
      )
    expect(E.tableColorsAllowed([{ color: 0x8ee186 }])).toBe(false)
    expect(
      E.tableColorsDistinct([{ color: 7322096 }, { color: 7322096 }])
    ).toBe(false)
  })

  it('a topic name is at most thirty-two characters', () => {
    expect(E.nameFits(32)).toBe(true)
    expect(E.nameFits(33)).toBe(false)
    expect(E.nameFits(0)).toBe(false)
    expect(E.nameChars('🎬 Reels')).toBe(7)
    for (const t of E.TABS) {
      expect(E.nameFits(E.nameChars(t.ru))).toBe(true)
      expect(E.nameFits(E.nameChars(t.en))).toBe(true)
    }
  })

  it('a stored tab that is alive is never made again', () => {
    expect(E.makeTab(true, true)).toBe(false)
    expect(E.makeTab(true, false)).toBe(true)
    expect(E.makeTab(false, true)).toBe(true)
    expect(E.makeTab(false, false)).toBe(true)
  })

  it('a tab is forgotten only when Telegram says its thread is missing', () => {
    expect(E.forgetRow(true, true)).toBe(true)
    expect(E.forgetRow(true, false)).toBe(false)
    expect(E.forgetRow(false, true)).toBe(false)
    expect(
      threadMissing({
        response: { description: 'Bad Request: message thread not found' },
      })
    ).toBe(true)
    expect(threadMissing(new Error('ETIMEDOUT'))).toBe(false)
    expect(
      threadMissing(new Error('400: Bad Request: TOPIC_NOT_MODIFIED'))
    ).toBe(false)
    expect(SPEC.PROBE_METHOD).toBe('editForumTopic')
  })

  it('only the claim that landed makes the tab, and a dead claim expires', () => {
    expect(E.claimWon(1)).toBe(true)
    expect(E.claimWon(0)).toBe(false)
    expect(E.claimStale(119999)).toBe(false)
    expect(E.claimStale(120000)).toBe(true)
  })

  it("only a person's own unknown topic is named from its first message", () => {
    expect(E.mayRename(false, false, false, false)).toBe(true)
    expect(E.mayRename(true, false, false, false)).toBe(false)
    expect(E.mayRename(false, true, false, false)).toBe(false)
    expect(E.mayRename(false, false, true, false)).toBe(false)
  })

  it("no topic is named while one of the person's tabs is being made", () => {
    expect(E.mayRename(false, false, false, true)).toBe(false)
  })

  it('a slow maker whose claim was taken keeps nothing and deletes its topic', () => {
    expect(E.settleWon(1)).toBe(true)
    expect(E.settleWon(0)).toBe(false)
    expect(E.settleWon(2)).toBe(false)
  })

  it('a fixed tab named under an older title is renamed once to the current one', () => {
    expect(E.retitle(false)).toBe(true)
    expect(E.retitle(true)).toBe(false)
  })

  it('a tab is never doubled: a rename never remakes, a remake clears the old thread', () => {
    expect(SPEC.RENAME_REMAKES).toBe(false)
    expect(E.clearsOld(true, true)).toBe(true)
    expect(E.clearsOld(true, false)).toBe(false)
    expect(E.clearsOld(false, true)).toBe(false)
    expect(E.clearsOld(false, false)).toBe(false)
  })

  it("a person's tabs are set up by that person or a keeper", () => {
    expect(E.maySetUp(true, false)).toBe(true)
    expect(E.maySetUp(false, true)).toBe(true)
    expect(E.maySetUp(false, false)).toBe(false)
  })

  it('a send named its own thread, even null, keeps it', async () => {
    // Every first message the render sends names the tab's thread itself.
    const db = tinyDb()
    const engine = createTopicTabs({ spec: SPEC, db: () => db, log: quiet })
    const calls: any[] = []
    let next = 500
    const api = {
      async callApi(method: string, payload: any) {
        calls.push([method, payload])
        return method === 'createForumTopic'
          ? { message_thread_id: next++ }
          : true
      },
    }
    await engine.ensureTabs(api, 'b', 777, false, () => undefined)
    const sends = calls.filter(c => c[0] === 'sendMessage')
    expect(sends).toHaveLength(SPEC.TAB_COUNT)
    for (const [, p] of sends)
      expect(p.message_thread_id).toBeGreaterThanOrEqual(500)
  })

  it('a message in a known tab costs no database read', () => {
    expect(E.readsDb(true)).toBe(false)
    expect(E.readsDb(false)).toBe(true)
    expect(E.evicts(4999)).toBe(false)
    expect(E.evicts(5000)).toBe(true)
  })

  it("a tab's name never opens with an emoji, or the emoji is drawn again inside the icon", async () => {
    expect(SPEC.NAME_CARRIES_EMOJI).toBe(false)
    expect(E.nameOk(true)).toBe(false)
    expect(E.nameOk(false)).toBe(true)
    // the names the render's engine really gives the topics it makes
    const store = tinyDb()
    const engine = createTopicTabs({
      spec: SPEC,
      db: () => store,
      log: quiet,
    })
    let next = 700
    const names: string[] = []
    const api = {
      async callApi(method: string, p: any) {
        if (method === 'createForumTopic') {
          names.push(p.name)
          return { message_thread_id: next++ }
        }
        return true
      },
    }
    await engine.ensureTabs(api, 'b', 777, true, () => undefined)
    expect(names).toHaveLength(SPEC.TAB_COUNT)
    for (const n of names)
      expect(E.nameOk(/^\p{Extended_Pictographic}/u.test(n))).toBe(true)
  })

  it("the emoji is the icon only of a made topic and only when Telegram's icon set has it", async () => {
    expect(SPEC.ICON_AFTER_CREATE).toBe(true)
    expect(E.setsIcon(true, true)).toBe(true)
    expect(E.setsIcon(true, false)).toBe(false)
    expect(E.setsIcon(false, true)).toBe(false)
    expect(E.setsIcon(false, false)).toBe(false)
    // through the engine: the icon edit follows the create of its topic
    const store = tinyDb()
    const engine = createTopicTabs({
      spec: SPEC,
      db: () => store,
      log: quiet,
    })
    let next = 800
    const calls: any[][] = []
    const api = {
      async callApi(method: string, p: any) {
        calls.push([method, p])
        if (method === 'getForumTopicIconStickers')
          return [
            {
              emoji: String.fromCodePoint(SPEC.TAB_EMOJI[0]),
              custom_emoji_id: 'e0',
            },
          ]
        if (method === 'createForumTopic') return { message_thread_id: next++ }
        return true
      },
    }
    await engine.ensureTabs(api, 'b', 777, false, () => undefined)
    const created = calls.findIndex(c => c[0] === 'createForumTopic')
    expect(calls[created][1]).not.toHaveProperty('icon_custom_emoji_id')
    const icons = calls.filter(
      c => c[0] === 'editForumTopic' && 'icon_custom_emoji_id' in c[1]
    )
    expect(
      icons.map(c => [c[1].message_thread_id, c[1].icon_custom_emoji_id])
    ).toEqual([[800, 'e0']])
    expect(calls.indexOf(icons[0])).toBeGreaterThan(created)
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(5)
  })
})
