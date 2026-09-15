import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The client in the owner's DM is answered by the AGENT -- the one with the
 * invoice, the picture and the balance as tools -- and only when the agent
 * is unreachable by the old prompt-only responder, which must not invent
 * tariffs. Found live 2026-09-08: "Basic 299 rub/month" offered to a person
 * who said "хочу оплатить".
 */
const asked: Array<{ id: string; text: string; surface?: string }> = []
const recorded: Array<{ id: string; surface?: string; turns: unknown[] }> = []
let agentAnswer: () => Promise<{
  /* cyrillic-ok */ текст?: string
}> = async () => ({
  текст: 'Счёт: https://t.me/$inv-abc', // cyrillic-ok: pre-existing identifiers
}) // cyrillic-ok: pre-existing field

// aiChatService drags the scene registry in; the fallback is a function we pass ourselves.
vi.mock('@/services/aiChatService', () => ({
  chatWithAI: vi.fn(async () => 'unused'),
}))

vi.mock('@/services/trinityAgent', () => ({
  /* cyrillic-ok */ спроситьАгента: async (
    id: string,
    text: string,
    opts?: { surface?: string }
  ) => {
    asked.push({ id, text, surface: opts?.surface })
    return agentAnswer()
  },
  recordTurns: async (id: string, turns: unknown[], surface?: string) => {
    recorded.push({ id, surface, turns })
    return 'recorded'
  },
}))

beforeEach(() => {
  asked.length = 0
  recorded.length = 0
  agentAnswer = async () => ({ текст: 'Счёт: https://t.me/$inv-abc' }) // cyrillic-ok: pre-existing field
})
afterEach(() => vi.restoreAllMocks())

describe('answerClient', () => {
  /*
   * THESE TWO EXPECTATIONS WERE THE WRONG WAY ROUND, AND THEY FROZE A DEFECT.
   *
   * They used to demand two records on SUCCESS and none on the fallback --
   * which is precisely the bug. The render's /api/agent/chat already records
   * both replies on its way through (its own comment says so, and says the
   * catch-up route exists "But the bot has a FALLBACK"). Neither side
   * deduplicates, so every normal exchange landed in the history TWICE,
   * halving a memory window that is read as the last forty replies. And the
   * spare model's answer, written when the render is down, reached the
   * history never -- so the next turn read a question with no answer beside
   * it and the seller answered it again.
   *
   * The owner's own path in registerCommands.ts had this right from the
   * start: it records only in the fallback branch.
   */
  it('asks the agent as the client, and lets the render keep the record', async () => {
    const { answerClient } = await import('@/services/businessBotService')
    const fallback = vi.fn(async () => 'fallback')
    const said = await answerClient('555', 'хочу оплатить', fallback)
    expect(said).toContain('t.me/$inv-abc')
    expect(asked).toEqual([
      { id: '555', text: 'хочу оплатить', surface: 'business' },
    ])
    expect(fallback).not.toHaveBeenCalled()
    await new Promise(r => setTimeout(r, 0))
    expect(
      recorded,
      'the successful turn was written a second time, on top of the render'
    ).toEqual([])
  })

  it('writes BOTH replies when the agent was never reached', async () => {
    // Nothing exists on the render's side: the request never arrived.
    agentAnswer = async () => {
      throw new Error('render 502')
    }
    const { answerClient } = await import('@/services/businessBotService')
    const fallback = vi.fn(async () => 'из запасного ответчика')
    expect(await answerClient('555', 'привет', fallback)).toBe(
      'из запасного ответчика'
    )
    expect(fallback).toHaveBeenCalledTimes(1)
    await new Promise(r => setTimeout(r, 0))
    expect(recorded[0]?.surface).toBe('business')
    expect(recorded[0]?.turns).toEqual([
      { role: 'user', content: 'привет' },
      { role: 'assistant', content: 'из запасного ответчика' },
    ])
  })

  it('writes only the ANSWER when the agent was reached but said nothing', async () => {
    // The request got through, so the render stored the question; only the
    // spare answer is missing. Writing the question again would duplicate it.
    agentAnswer = async () => ({ текст: '' }) // cyrillic-ok: pre-existing field
    const { answerClient } = await import('@/services/businessBotService')
    const fallback = vi.fn(async () => 'запасной')
    expect(await answerClient('555', 'привет', fallback)).toBe('запасной')
    await new Promise(r => setTimeout(r, 0))
    expect(recorded[0]?.turns).toEqual([
      { role: 'assistant', content: 'запасной' },
    ])
  })

  /**
   * A THROW IS NOT PROOF THAT NOTHING WAS STORED.
   *
   * The server writes head 200 first, stores the person's line second and
   * runs the agent third. An error event inside the stream, or a socket cut
   * halfway through it, therefore leaves the question ON RECORD -- and this
   * function used to write it again, because it read every throw as "never
   * arrived". The duplicate is invisible (both sides are plain INSERTs) and
   * it halves a memory window read as the last forty replies.
   *
   * `спроситьАгента` attaches `questionStored` to exactly those errors.
   */
  it('writes only the ANSWER when the stream broke after the question was stored', async () => {
    agentAnswer = async () => {
      const e = new Error('агент оборвался на середине')
      ;(e as { questionStored?: boolean }).questionStored = true
      throw e
    }
    const { answerClient } = await import('@/services/businessBotService')
    const fallback = vi.fn(async () => 'запасной')
    expect(await answerClient('555', 'привет', fallback)).toBe('запасной')
    await new Promise(r => setTimeout(r, 0))
    expect(
      recorded[0]?.turns,
      'the question was written a second time on top of the render'
    ).toEqual([{ role: 'assistant', content: 'запасной' }])
  })

  it('an empty answer is not an answer: fallback', async () => {
    agentAnswer = async () => ({ текст: '   ' }) // cyrillic-ok: pre-existing field
    const { answerClient } = await import('@/services/businessBotService')
    const fallback = vi.fn(async () => 'запас')
    expect(await answerClient('555', 'привет', fallback)).toBe('запас')
  })
})

describe('the fallback prompt', () => {
  it('carries no tariffs, no rubles, and says invoices come by tokens', async () => {
    const { buildBusinessMessages } = await import(
      '@/services/businessBotService'
    )
    const sys = String(
      buildBusinessMessages('привет', 'Гость', 'neuro_blogger_bot')[0].content
    )
    expect(sys.includes('руб')).toBe(false)
    expect(sys).not.toMatch(/Basic|Pro:|Studio/)
    expect(sys).toContain('Тарифов и подписок НЕТ')
    expect(sys).toContain('токенами за звёзды')
  })
})
