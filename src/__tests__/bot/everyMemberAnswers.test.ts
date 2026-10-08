/**
 * bot-agent-team.t27 v2, the behaviour: a person's turns run one at a time in
 * the order sent (five tabs at once were five refused requests on
 * 2026-10-08), the queue says when it is full, a refused turn retries with a
 * growing pause, and the pay buttons live in the Treasurer's tab.
 * The spec's own vectors run in src/spec/bot-agent-team.test.ts.
 */
import { describe, expect, it } from 'vitest'
import * as SPEC from '@/spec/bot-agent-team.gen'
import {
  PersonQueueFull,
  inPersonQueue,
  waitingTurns,
} from '@/services/personTurns'
import { retryAllowed, ownTurn } from '@/services/trinityAgent'
import { buttonsForAnswer } from '@/navigation/helpers/actionButtons'
import { startGreetingKeyboard } from '@/navigation/helpers/startGreeting'
import { tabMarkup } from '@/navigation/topics/wire'
import { TABS } from '@/navigation/topics/tabs'

const tick = () => new Promise(r => setTimeout(r, 0))

describe("a person's turns, one at a time", () => {
  it('five tabs at once are five answers in a row, in the order sent', async () => {
    let running = 0
    let most = 0
    const order: number[] = []
    const turn = (n: number) => async () => {
      running++
      most = Math.max(most, running)
      await tick()
      await tick()
      order.push(n)
      running--
      return n
    }
    const all = await Promise.all(
      [1, 2, 3, 4, 5].map(n => inPersonQueue('p1', turn(n)))
    )
    expect(all).toEqual([1, 2, 3, 4, 5])
    expect(order).toEqual([1, 2, 3, 4, 5])
    expect(most).toBe(SPEC.TURNS_AT_ONCE_PER_PERSON)
    expect(waitingTurns('p1')).toBe(0)
  })

  it('a released slot goes to the waiter, never to a newcomer arriving at that moment', async () => {
    let running = 0
    let most = 0
    let release!: () => void
    const turn = async () => {
      running++
      most = Math.max(most, running)
      await tick()
      running--
    }
    const first = inPersonQueue('p3', async () => {
      running++
      most = Math.max(most, running)
      await new Promise<void>(r => (release = r))
      running--
    })
    const waiter = inPersonQueue('p3', turn)
    await tick()
    release()
    await first
    // The newcomer arrives in the same instant the slot is handed over.
    const newcomer = inPersonQueue('p3', turn)
    await Promise.all([waiter, newcomer])
    expect(most).toBe(1)
  })

  it('two people do not wait for each other', async () => {
    let running = 0
    let most = 0
    const turn = async () => {
      running++
      most = Math.max(most, running)
      await tick()
      running--
    }
    await Promise.all([inPersonQueue('a', turn), inPersonQueue('b', turn)])
    expect(most).toBe(2)
  })

  it('a full queue is said, and a failed turn passes the slot on', async () => {
    let release!: () => void
    const first = inPersonQueue(
      'p2',
      () => new Promise<void>(r => (release = r))
    )
    const waiting = Array.from({ length: SPEC.TURNS_WAITING_MAX }, () =>
      inPersonQueue('p2', async () => {
        throw new Error('model refused')
      }).catch(e => e.message)
    )
    await tick()
    await expect(inPersonQueue('p2', async () => 1)).rejects.toBeInstanceOf(
      PersonQueueFull
    )
    release()
    await first
    expect(await Promise.all(waiting)).toEqual(
      Array(SPEC.TURNS_WAITING_MAX).fill('model refused')
    )
    expect(await inPersonQueue('p2', async () => 'free again')).toBe(
      'free again'
    )
  })

  it("only the person's own turns queue: never a customer's business DM, the sweep or a room", () => {
    expect(ownTurn({ surface: 'bot' })).toBe(true)
    expect(ownTurn({})).toBe(true)
    expect(ownTurn({ surface: 'business' })).toBe(false)
    expect(ownTurn({ toolsOnly: true })).toBe(false)
    expect(ownTurn({ room: '-100123' })).toBe(false)
  })

  it('an own turn retries LIMIT_RETRIES times on a limit, a paid one never', () => {
    const limit = SPEC.LIMIT_RETRIES
    expect(
      retryAllowed(limit - 1, 'zai-lite: limit (code 1302)', [], limit)
    ).toBe(true)
    expect(retryAllowed(limit, 'zai-lite: limit (code 1302)', [], limit)).toBe(
      false
    )
    expect(retryAllowed(0, 'zai-lite: limit', ['image_generate'], limit)).toBe(
      false
    )
    // A customer's business turn keeps its one short retry.
    expect(retryAllowed(1, 'limit', [])).toBe(false)
  })
})

const callbacks = (markup: any): string[] =>
  (markup?.reply_markup?.inline_keyboard ?? markup?.inline_keyboard ?? [])
    .flat()
    .map((b: any) => String(b.callback_data ?? b.url ?? ''))

describe("the money is the Treasurer's", () => {
  const priced =
    'Рилс стоит 270 токенов, на балансе 10. Оплатить: https://t.me/$abcDEF123 [[Пополнить|act:topup]] [[Что умеешь|act:can]]' // cyrillic-ok: an answer under test

  it('outside the Treasurer tab an answer carries no pay row, no top-up, no balance', () => {
    const { markup } = buttonsForAnswer(priced, true, { money: false })
    const data = callbacks(markup)
    expect(data.some(d => d.includes('t.me/$'))).toBe(false)
    expect(data).not.toContain('act:topup')
    expect(data).not.toContain('act:balance')
    expect(data).toContain('act:can')
  })

  it('in the Treasurer tab, or without tabs, the pay row stays', () => {
    const data = callbacks(buttonsForAnswer(priced, true, {}).markup)
    expect(data.some(d => d.includes('t.me/$'))).toBe(true)
    expect(data).toContain('act:topup')
  })

  it('the greeting drops the pay rows when the person has tabs', () => {
    const without = callbacks(
      startGreetingKeyboard(true, { app: false, rubles: true, money: false })
    )
    expect(without).not.toContain('act:topup')
    expect(without).not.toContain('act:pay_rub')
    expect(without).not.toContain('act:pay_crypto')
    const withMoney = callbacks(
      startGreetingKeyboard(true, { app: false, rubles: true })
    )
    expect(withMoney).toContain('act:topup')
  })

  it("the Treasurer's first message carries the pay rows; the Director's does not", () => {
    const ctx: any = {
      botInfo: { username: 'b' },
      from: { id: 7, language_code: 'ru' },
      state: {},
    }
    const wallet = TABS.find(t => t.kind === 'wallet')!
    const reels = TABS.find(t => t.kind === 'reels')!
    expect(callbacks(tabMarkup(ctx, wallet, true))).toContain('act:topup')
    expect(callbacks(tabMarkup(ctx, wallet, true))).toContain('act:balance')
    expect(callbacks(tabMarkup(ctx, reels, true))).not.toContain('act:topup')
  })
})

describe('which message may carry pay buttons', () => {
  const rows = [
    { thread_id: 11, kind: 'agent', title: 'a', created_at: new Date() },
    { thread_id: 15, kind: 'wallet', title: 'w', created_at: new Date() },
  ]
  const db = (list: any[]) => ({
    query: async (sql: string) =>
      /^\s*SELECT/.test(sql) ? { rows: list } : { rows: [] },
  })
  const inThread = (thread?: number, type = 'private'): any => ({
    chat: { id: 900000077, type },
    botInfo: { username: 'money_bot' },
    update: {
      message: {
        chat: { id: 900000077, type },
        ...(thread
          ? { is_topic_message: true, message_thread_id: thread }
          : {}),
      },
    },
  })

  it("in the Treasurer's tab yes, in another tab no, without tabs yes", async () => {
    const { setTopicTabsDbForTests } = await import('@/navigation/topics/tabs')
    const { moneyHere } = await import('@/navigation/topics/team')
    // A fresh bot name per question: the tab cache is keyed by bot and person.
    const as = (ctx: any, bot: string) => ({
      ...ctx,
      botInfo: { username: bot },
    })
    setTopicTabsDbForTests(db(rows) as any)
    expect(await moneyHere(as(inThread(15), 'm1'))).toBe(true)
    expect(await moneyHere(as(inThread(11), 'm2'))).toBe(false)
    expect(await moneyHere(as(inThread(undefined), 'm3'))).toBe(false)
    setTopicTabsDbForTests(db([]) as any)
    expect(await moneyHere(as(inThread(11), 'm4'))).toBe(true)
    expect(await moneyHere(as(inThread(11, 'supergroup'), 'm5'))).toBe(true)
  })
})
