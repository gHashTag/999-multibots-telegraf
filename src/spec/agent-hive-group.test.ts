/**
 * Spec agent-hive-group.t27 (gHashTag/t27#6430, v2 #6558, v3 #6564), every test block run against
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
  briefFits,
  briefSource,
  followsUp,
  heardWhileMuted,
  keepsSeenMark,
  mayAnswerAfterStop,
  maySetBrief,
  recreateTopic,
  speaksOnAll,
  summaryCount,
  turnOk,
  typingDue,
} from '@/core/bot/agentHive/rules'
import {
  clearChain,
  placeOfIncoming,
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
    const place = (
      messageId: number,
      fromBot: boolean,
      replyToMessageId?: number
    ) =>
      placeOfIncoming({
        chatId: chat,
        messageId,
        fromBot,
        fromId: 5,
        replyToMessageId,
      })
    expect(place(1, false)).toEqual({ depth: 0, origin: 5 })
    noteSent(chat, 2, 1, 5)
    expect(place(2, true, 1)).toEqual({ depth: 1, origin: 5 })
    noteSent(chat, 3, 2, 5)
    noteSent(chat, 4, 3, 5)
    expect(chainOpen(place(4, true, 3).depth)).toBe(false)
    // An unknown bot message replying to a known one sits one deeper, same person.
    expect(place(9, true, 3)).toEqual({ depth: 3, origin: 5 })
    // One replying to nothing we know belongs to nobody.
    expect(place(10, true)).toEqual({ depth: 1, origin: null })
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

  it('typing is sent again four seconds after the last one', () => {
    expect(typingDue(0)).toBe(false)
    expect(typingDue(3999)).toBe(false)
    expect(typingDue(4000)).toBe(true)
  })

  it('on the all tag only the best fit answers at once', () => {
    expect(speaksOnAll(0)).toBe(true)
    expect(speaksOnAll(1)).toBe(false)
    expect(speaksOnAll(7)).toBe(false)
  })

  it('a person follows up in the same topic for two minutes without a tag', () => {
    expect(followsUp(false, true, true, 0)).toBe(true)
    expect(followsUp(false, true, true, 119999)).toBe(true)
    expect(followsUp(false, true, true, 120000)).toBe(false)
    expect(followsUp(false, false, true, 0)).toBe(false)
    expect(followsUp(false, true, false, 0)).toBe(false)
    expect(followsUp(true, true, true, 0)).toBe(false)
  })

  it('a stop silences bots for ten minutes and never a person', () => {
    expect(mayAnswerAfterStop(true, 0)).toBe(false)
    expect(mayAnswerAfterStop(true, 599999)).toBe(false)
    expect(mayAnswerAfterStop(true, 600000)).toBe(true)
    expect(mayAnswerAfterStop(false, 0)).toBe(true)
  })

  it('a muted agent still answers its own tag for the hour', () => {
    expect(heardWhileMuted(true, 0)).toBe(true)
    expect(heardWhileMuted(false, 0)).toBe(false)
    expect(heardWhileMuted(false, 3599999)).toBe(false)
    expect(heardWhileMuted(false, 3600000)).toBe(true)
  })

  it('the answer counts even when the chat refuses reactions', () => {
    expect(turnOk(true, false)).toBe(true)
    expect(turnOk(true, true)).toBe(true)
    expect(turnOk(false, true)).toBe(false)
    expect(keepsSeenMark(true)).toBe(true)
    expect(keepsSeenMark(false)).toBe(false)
  })

  it('the topic brief wins over the group brief, and only an admin sets one', () => {
    expect(briefSource(true, true)).toBe(2)
    expect(briefSource(true, false)).toBe(2)
    expect(briefSource(false, true)).toBe(1)
    expect(briefSource(false, false)).toBe(0)
    expect(briefFits(0)).toBe(true)
    expect(briefFits(1000)).toBe(true)
    expect(briefFits(1001)).toBe(false)
    expect(maySetBrief(true, false)).toBe(true)
    expect(maySetBrief(false, false)).toBe(false)
    expect(maySetBrief(true, true)).toBe(false)
  })

  it('a deleted topic is recreated, at most once in ten minutes', () => {
    expect(recreateTopic(false, false, 600000)).toBe(true)
    expect(recreateTopic(false, true, 600000)).toBe(true)
    expect(recreateTopic(true, false, 600000)).toBe(true)
    expect(recreateTopic(true, true, 600000)).toBe(false)
    expect(recreateTopic(true, false, 599999)).toBe(false)
  })

  it('a summary reads fifty by default and never past the log', () => {
    expect(summaryCount(0)).toBe(50)
    expect(summaryCount(1)).toBe(1)
    expect(summaryCount(10)).toBe(10)
    expect(summaryCount(200)).toBe(200)
    expect(summaryCount(201)).toBe(200)
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(3)
  })
})
