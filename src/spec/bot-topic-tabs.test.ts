/**
 * Spec bot-topic-tabs.t27 (gHashTag/t27#7388), every test block run against
 * the bot's code: the tab table and rules in navigation/topics/tabs.ts, the
 * thread injection and the name bound in navigation/topics/threads.ts.
 * The behaviour the rules drive (the claim under two /start, /tabs, the
 * cached lookup) is exercised end to end in
 * src/__tests__/navigation/topicTabs.test.ts.
 */
import { describe, expect, it } from 'vitest'
import * as SPEC from './bot-topic-tabs.gen'
import {
  TABS,
  claimStale,
  claimWon,
  colorAllowed,
  evicts,
  forgetRow,
  makeTab,
  mayRename,
  maySetUp,
  nameChars,
  nameFits,
  readsDb,
  retitle,
  clearsOld,
  settleWon,
  tableColorsAllowed,
  tableColorsDistinct,
  threadMissing,
} from '@/navigation/topics/tabs'
import {
  injectThread,
  threadPayload,
  topicTitleFrom,
} from '@/navigation/topics/threads'
import { APP_ROUTES } from '@/navigation/helpers/appLinks'

/** Length of the name the host makes from a first message of n characters. */
const topicNameLen = (n: number) => [...topicTitleFrom('x'.repeat(n))].length

describe('spec bot-topic-tabs.t27', () => {
  it('the table has six tabs, each in a colour Telegram accepts, no two alike', () => {
    expect(SPEC.TAB_COUNT).toBe(6)
    expect(TABS).toHaveLength(SPEC.TAB_COUNT)
    expect(tableColorsAllowed()).toBe(true)
    expect(tableColorsDistinct()).toBe(true)
    expect(colorAllowed(7322096)).toBe(true)
    expect(colorAllowed(16478047)).toBe(true)
    expect(colorAllowed(9363846)).toBe(false)
    expect(colorAllowed(7545565)).toBe(false)
    expect(colorAllowed(0)).toBe(false)
    // the host table is the spec's table, in the spec's order
    expect(TABS.map(t => t.kind)).toEqual([...SPEC.TAB_KEYS])
    expect(TABS.map(t => t.color)).toEqual([...SPEC.TAB_COLORS])
    expect(TABS.map(t => t.route)).toEqual([...SPEC.TAB_ROUTES])
    for (const [i, t] of TABS.entries()) {
      const emoji = String.fromCodePoint(SPEC.TAB_EMOJI[i])
      expect(t.en).toBe(`${emoji} ${SPEC.TAB_TITLES_EN[i]}`)
      expect(t.ru.startsWith(`${emoji} `)).toBe(true)
      expect((APP_ROUTES as readonly string[]).includes(t.route)).toBe(true)
    }
    // the controls: a table with a refused or a repeated colour is caught
    expect(tableColorsAllowed([{ color: 0x8ee186 }])).toBe(false)
    expect(tableColorsDistinct([{ color: 7322096 }, { color: 7322096 }])).toBe(
      false
    )
  })

  it('a topic name is at most thirty-two characters', () => {
    expect(topicNameLen(1)).toBe(1)
    expect(topicNameLen(32)).toBe(32)
    expect(topicNameLen(33)).toBe(32)
    expect(topicNameLen(500)).toBe(32)
    expect(nameFits(32)).toBe(true)
    expect(nameFits(33)).toBe(false)
    expect(nameFits(0)).toBe(false)
    expect(SPEC.TOPIC_NAME_MAX).toBeLessThan(SPEC.TELEGRAM_TOPIC_NAME_MAX)
    for (const t of TABS) {
      expect(nameFits(nameChars(t.ru))).toBe(true)
      expect(nameFits(nameChars(t.en))).toBe(true)
    }
    // an emoji past the bound is dropped whole, never cut in half
    const cut = topicTitleFrom('a'.repeat(30) + '🎬🎬🎬')
    expect([...cut]).toHaveLength(32)
    expect(cut.endsWith('🎬…')).toBe(true)
  })

  it('a stored tab that is alive is never made again', () => {
    expect(makeTab(true, true)).toBe(false)
    expect(makeTab(true, false)).toBe(true)
    expect(makeTab(false, true)).toBe(true)
    expect(makeTab(false, false)).toBe(true)
  })

  it('a tab is forgotten only when Telegram says its thread is missing', () => {
    expect(forgetRow(true, true)).toBe(true)
    expect(forgetRow(true, false)).toBe(false)
    expect(forgetRow(false, false)).toBe(false)
    expect(forgetRow(false, true)).toBe(false)
    // what counts as Telegram's word
    expect(
      threadMissing({
        response: { description: 'Bad Request: message thread not found' },
      })
    ).toBe(true)
    expect(threadMissing(new Error('400: Bad Request: TOPIC_ID_INVALID'))).toBe(
      true
    )
    expect(threadMissing(new Error('ETIMEDOUT'))).toBe(false)
    expect(
      threadMissing({ response: { description: 'Too Many Requests' } })
    ).toBe(false)
    // the probe's "nothing changed" is a live topic, not a missing one
    expect(
      threadMissing(new Error('400: Bad Request: TOPIC_NOT_MODIFIED'))
    ).toBe(false)
    expect(SPEC.PROBE_METHOD).toBe('editForumTopic')
  })

  it('only the claim that landed makes the tab, and a dead claim expires', () => {
    expect(claimWon(1)).toBe(true)
    expect(claimWon(0)).toBe(false)
    expect(claimStale(0)).toBe(false)
    expect(claimStale(119999)).toBe(false)
    expect(claimStale(120000)).toBe(true)
    expect(SPEC.CLAIM_STALE_MS).toBe(120000)
  })

  it("only a person's own unknown topic is named from its first message", () => {
    expect(mayRename(false, false, false, false)).toBe(true)
    expect(mayRename(true, false, false, false)).toBe(false)
    expect(mayRename(false, true, false, false)).toBe(false)
    expect(mayRename(false, false, true, false)).toBe(false)
    // a command makes no name, so it is never a topic's name either
    expect(topicTitleFrom('/start')).toBe('')
  })

  it("no topic is named while one of the person's tabs is being made", () => {
    expect(mayRename(false, false, false, true)).toBe(false)
    expect(mayRename(true, false, false, true)).toBe(false)
  })

  it('a slow maker whose claim was taken keeps nothing and deletes its topic', () => {
    expect(settleWon(1)).toBe(true)
    expect(settleWon(0)).toBe(false)
    expect(settleWon(2)).toBe(false)
  })

  it('a fixed tab named under an older title is renamed once to the current one', () => {
    expect(retitle(false)).toBe(true)
    expect(retitle(true)).toBe(false)
  })

  it('a tab is never doubled: a rename never remakes, a remake clears the old thread', () => {
    expect(SPEC.RENAME_REMAKES).toBe(false)
    expect(clearsOld(true, true)).toBe(true)
    expect(clearsOld(true, false)).toBe(false)
    expect(clearsOld(false, true)).toBe(false)
    expect(clearsOld(false, false)).toBe(false)
  })

  it("a person's tabs are set up by that person or a keeper", () => {
    expect(maySetUp(true, false)).toBe(true)
    expect(maySetUp(false, true)).toBe(true)
    expect(maySetUp(true, true)).toBe(true)
    expect(maySetUp(false, false)).toBe(false)
  })

  it('a send named its own thread, even null, keeps it', () => {
    expect(injectThread(true, true, false, false)).toBe(true)
    expect(injectThread(true, true, true, false)).toBe(false)
    expect(injectThread(false, true, false, false)).toBe(false)
    expect(injectThread(true, false, false, false)).toBe(false)
    expect(injectThread(true, true, false, true)).toBe(false)
    // the same five, through the host's payload rewrite
    const send = (p: any, method = 'sendMessage') =>
      threadPayload(method, p, 777, 42).message_thread_id
    expect(send({ chat_id: 777 })).toBe(42)
    expect(send({ chat_id: 777, message_thread_id: null })).toBeNull()
    expect(send({ chat_id: 777 }, 'editMessageText')).toBeUndefined()
    expect(send({ chat_id: 1 })).toBeUndefined()
    expect(send({ chat_id: 777, business_connection_id: 'b' })).toBeUndefined()
  })

  it('a message in a known tab costs no database read', () => {
    expect(readsDb(true)).toBe(false)
    expect(readsDb(false)).toBe(true)
    expect(evicts(4999)).toBe(false)
    expect(evicts(5000)).toBe(true)
    expect(SPEC.TAB_CACHE_MAX).toBe(5000)
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(4)
  })
})
