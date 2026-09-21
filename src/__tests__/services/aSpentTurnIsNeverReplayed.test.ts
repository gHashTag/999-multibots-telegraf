/**
 * A TURN THAT ALREADY SPENT IS NEVER REPLAYED.
 *
 * Production, 20.09.2026. An `image_edit` ran 170 seconds; the bot's flat
 * 180 s deadline fired 10 seconds after the picture had actually landed in the
 * bucket. The error read "This operation was aborted" -- which the transient
 * classifier accepts -- so the whole turn was replayed, rendered the same
 * picture again and charged for it again. The client paid twice and received
 * neither image.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  markTurnTools,
  toolsUsedOf,
  turnAlreadySpent,
} from '@/services/agentTurnSpend'

const asked: string[] = []
/** The agent's reply, in the wire format's own field names. */
type AgentReply = { текст?: string } // cyrillic-ok: reply field

let agentAnswer: () => Promise<AgentReply> = async () => ({
  // cyrillic-ok: agent reply field
  текст: 'готово', // cyrillic-ok: pre-existing field
})

vi.mock('@/services/aiChatService', () => ({
  chatWithAI: vi.fn(async () => 'unused'),
}))

vi.mock('@/services/trinityAgent', () => ({
  /* cyrillic-ok */ спроситьАгента: async (id: string) => {
    asked.push(id)
    return agentAnswer()
  },
  recordTurns: async () => 'recorded',
}))

vi.mock('@/services/assetLinkGuard', () => ({
  guardAssetLinks: async (t: string) => t,
}))

beforeEach(() => {
  asked.length = 0
})
afterEach(() => vi.restoreAllMocks())

describe('what a failed turn already did', () => {
  it('an unannotated error claims nothing', () => {
    expect(toolsUsedOf(new Error('boom'))).toEqual([])
    expect(turnAlreadySpent(new Error('boom'))).toBe(false)
    expect(turnAlreadySpent(undefined)).toBe(false)
  })

  it('a turn that only read is not a turn that spent', () => {
    const e = markTurnTools(new Error('aborted'), ['my_assets', 'balance'])
    expect(turnAlreadySpent(e)).toBe(false)
  })

  it('a turn that generated, billed or sent is', () => {
    for (const tool of ['image_edit', 'invoice', 'tg_send', 'video_generate']) {
      expect(turnAlreadySpent(markTurnTools(new Error('x'), [tool]))).toBe(true)
    }
  })

  it('the annotation leaves the message the classifier reads untouched', () => {
    const e = new Error('This operation was aborted')
    expect((markTurnTools(e, ['image_edit']) as Error).message).toBe(
      'This operation was aborted'
    )
  })

  it('the list is copied, so a later turn cannot rewrite an old failure', () => {
    const live = ['image_edit']
    const e = markTurnTools(new Error('x'), live)
    live.length = 0
    expect(toolsUsedOf(e)).toEqual(['image_edit'])
  })
})

describe('answerClient', () => {
  it('replays a transient failure that spent nothing', async () => {
    let calls = 0
    agentAnswer = async () => {
      calls += 1
      if (calls === 1) throw new Error('This operation was aborted')
      return { текст: 'со второй попытки' } // cyrillic-ok: pre-existing field
    }
    const { answerClient } = await import('@/services/businessBotService')
    const fallback = vi.fn(async () => 'fallback')
    expect(await answerClient('555', 'привет', fallback)).toBe(
      'со второй попытки'
    )
    expect(calls).toBe(2)
    expect(fallback).not.toHaveBeenCalled()
  })

  it('refuses to replay the same transient failure once it has spent', async () => {
    let calls = 0
    agentAnswer = async () => {
      calls += 1
      throw markTurnTools(new Error('This operation was aborted'), [
        'image_edit',
      ])
    }
    const { answerClient } = await import('@/services/businessBotService')
    const fallback = vi.fn(async () => 'из запасного ответчика')
    expect(await answerClient('555', 'сделай картинку', fallback)).toBe(
      'из запасного ответчика'
    )
    // One attempt, one charge. The picture the client paid for may still
    // arrive; a second render of it certainly would not have been free.
    expect(calls).toBe(1)
    expect(fallback).toHaveBeenCalledTimes(1)
  })
})
