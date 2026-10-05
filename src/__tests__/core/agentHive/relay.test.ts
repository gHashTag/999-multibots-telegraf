import { describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const relay = vi.hoisted(() => vi.fn(async () => ({ текст: 'hello' }))) // cyrillic-ok: the relay's field
vi.mock('@/services/trinityAgent', () => ({ спроситьАгента: relay })) // cyrillic-ok: the relay's export

import { answerAsAgent } from '@/core/bot/agentHive/answer'
import { claimedAgent } from '@/core/bot/agentHive/claims'
import type { ManagedBotRow } from '@/core/bot/managedBots/store'

describe('an agent bot without injected deps', () => {
  it('asks the real relay with the agent set, and sends its words', async () => {
    const sent: string[] = []
    const ok = await answerAsAgent(
      {
        message: {
          message_id: 1,
          text: 'hi',
          from: { id: 5, first_name: 'A' },
        },
        chat: { id: 5, type: 'private' },
        botInfo: { id: 11, username: 't27_coder_bot' },
        telegram: {
          sendMessage: async (_c, text) => {
            sent.push(text)
            return { message_id: 2 }
          },
          sendChatAction: async () => true,
        },
      },
      {
        botId: 11,
        botUsername: 't27_coder_bot',
        agentId: 'coder',
      } as ManagedBotRow
    )
    expect(ok).toBe(true)
    expect(relay).toHaveBeenCalledWith('5', 'hi', {
      agent: 'coder',
      onTool: expect.any(Function),
    })
    expect(sent).toEqual(['hello'])
  })
})

describe('a creation with no claim', () => {
  it('reads the agent from the name, and nothing from a stranger name', () => {
    expect(claimedAgent({ ownerId: 1, botUsername: 't27_coder_bot' })).toBe(
      'coder'
    )
    expect(
      claimedAgent({ ownerId: 1, botUsername: 't27_nobody_bot' })
    ).toBeNull()
    expect(claimedAgent({ ownerId: 1, botUsername: 'shop_bot' })).toBeNull()
  })
})
