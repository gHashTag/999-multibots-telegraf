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
  it('asks the agent as the client on the business surface, and writes the turn down', async () => {
    const { answerClient } = await import('@/services/businessBotService')
    const fallback = vi.fn(async () => 'fallback')
    const said = await answerClient('555', 'хочу оплатить', fallback)
    expect(said).toContain('t.me/$inv-abc')
    expect(asked).toEqual([
      { id: '555', text: 'хочу оплатить', surface: 'business' },
    ])
    expect(fallback).not.toHaveBeenCalled()
    await new Promise(r => setTimeout(r, 0))
    expect(recorded[0]?.surface).toBe('business')
    expect(recorded[0]?.turns).toHaveLength(2)
  })

  it('an unreachable agent falls back to the prompt-only responder', async () => {
    agentAnswer = async () => {
      throw new Error('render 502')
    }
    const { answerClient } = await import('@/services/businessBotService')
    const fallback = vi.fn(async () => 'из запасного ответчика')
    expect(await answerClient('555', 'привет', fallback)).toBe(
      'из запасного ответчика'
    )
    expect(fallback).toHaveBeenCalledTimes(1)
    expect(recorded).toEqual([])
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
