/**
 * Spec agent-hive-group.t27 (gHashTag/t27#6430), every test block run against
 * the bot's code: the rules in core/bot/agentHive/rules.ts, and the two places
 * that live by them -- the chain depth and the creation claim.
 */
import { afterEach, describe, expect, it } from 'vitest'
import * as SPEC from './agent-hive-group.gen'
import {
  addressed,
  agentBotUsername,
  agentIdOfUsername,
  chainOpen,
  claimFresh,
  cooled,
  mayAnswer,
} from '@/core/bot/agentHive/rules'
import {
  clearChain,
  depthOfIncoming,
  noteSent,
} from '@/core/bot/agentHive/chain'
import {
  claimAgent,
  claimedAgent,
  clearClaims,
} from '@/core/bot/agentHive/claims'

const at = (
  tagged: boolean,
  allTag: boolean,
  replyToMe: boolean,
  ownTopic: boolean,
  fromBot: boolean
) => addressed({ tagged, allTag, replyToMe, ownTopic, fromBot })

afterEach(() => {
  clearChain()
  clearClaims()
})

describe('agent-hive-group.t27', () => {
  it('a person calls an agent by tag, all tag, reply or its own topic', () => {
    expect(at(true, false, false, false, false)).toBe(true)
    expect(at(false, true, false, false, false)).toBe(true)
    expect(at(false, false, true, false, false)).toBe(true)
    expect(at(false, false, false, true, false)).toBe(true)
    expect(at(false, false, false, false, false)).toBe(false)
  })

  it('a bot calls an agent only by tag or reply', () => {
    expect(at(true, false, false, false, true)).toBe(true)
    expect(at(false, false, true, false, true)).toBe(true)
    expect(at(false, true, false, false, true)).toBe(false)
    expect(at(false, false, false, true, true)).toBe(false)
    expect(at(false, true, false, true, true)).toBe(false)
  })

  it('the bot chain closes after three bot messages', () => {
    expect(chainOpen(0)).toBe(true)
    expect(chainOpen(2)).toBe(true)
    expect(chainOpen(3)).toBe(false)
    expect(chainOpen(4)).toBe(false)
    expect(SPEC.MAX_BOT_DEPTH).toBe(3)

    // human -> A -> B -> C: C's message stands at depth 3, nobody answers it.
    const chat = -1001
    expect(
      depthOfIncoming({ chatId: chat, messageId: 1, fromBot: false })
    ).toBe(0)
    noteSent(chat, 2, 1)
    const b = depthOfIncoming({
      chatId: chat,
      messageId: 2,
      fromBot: true,
      replyToMessageId: 1,
    })
    expect(b).toBe(1)
    noteSent(chat, 3, b + 1)
    noteSent(chat, 4, 3)
    const c = depthOfIncoming({
      chatId: chat,
      messageId: 4,
      fromBot: true,
      replyToMessageId: 3,
    })
    expect(chainOpen(c)).toBe(false)
    // An unknown bot message replying to a known one sits one deeper.
    expect(
      depthOfIncoming({
        chatId: chat,
        messageId: 9,
        fromBot: true,
        replyToMessageId: 3,
      })
    ).toBe(3)
  })

  it('a bot waits out the cooldown before answering a bot', () => {
    expect(cooled(0)).toBe(false)
    expect(cooled(4999)).toBe(false)
    expect(cooled(5000)).toBe(true)
  })

  it('a person is always answered and a bot only inside the limits', () => {
    expect(mayAnswer(false, 9, 0)).toBe(true)
    expect(mayAnswer(true, 2, 5000)).toBe(true)
    expect(mayAnswer(true, 3, 5000)).toBe(false)
    expect(mayAnswer(true, 2, 4999)).toBe(false)
  })

  it('a creation claim lives fifteen minutes', () => {
    expect(claimFresh(0)).toBe(true)
    expect(claimFresh(899999)).toBe(true)
    expect(claimFresh(900000)).toBe(false)

    // A fresh claim names the agent whatever username the owner typed.
    claimAgent(7, 'scientist', 0)
    expect(
      claimedAgent({ ownerId: 7, botUsername: 'my_lab_bot' }, 899999)
    ).toBe('scientist')
    // A stale one does not, and the suggested name is the only fallback.
    claimAgent(7, 'scientist', 0)
    expect(
      claimedAgent({ ownerId: 7, botUsername: 'my_lab_bot' }, 900000)
    ).toBeNull()
    expect(
      claimedAgent({ ownerId: 7, botUsername: agentBotUsername('coder') }, 0)
    ).toBe('coder')
    expect(agentIdOfUsername('t27_nobody_bot')).toBe('nobody')
    expect(
      claimedAgent({ ownerId: 7, botUsername: 't27_nobody_bot' }, 0)
    ).toBeNull()
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(1)
  })
})
