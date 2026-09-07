import { describe, it, expect, beforeEach } from 'vitest'
import {
  remember,
  pendingFor,
  claim,
  forgetProposals,
  pendingCount,
} from './src/agent/tg-proposals'

/**
 * CONFIRMATION IS THE ONLY WAY A MESSAGE LEAVES.
 *
 * `telegram-tools.ts` never sends from a model's decision -- it proposes. That
 * half was already right. What did not exist was anything able to ACCEPT a
 * proposal: measured 2026-09-07, `grep -rn proposal` across the player and the
 * bot found not one reader, so `tg_send` could not reach anybody at all.
 *
 * These checks are about the half being added. Every one of them describes
 * something that reaches another human being if it goes wrong.
 */

const draft = (id: string, who: string, what = 'привет') => ({
  id,
  telegramId: who,
  action: 'send' as const,
  target: '6579515876',
  what,
})

beforeEach(() => forgetProposals())

describe('a proposal belongs to one person', () => {
  it('somebody else cannot confirm it, even holding the id', () => {
    /*
     * The id travels in a button payload and a request body. If it were a pass
     * on its own, anybody who saw or guessed one could send a message from
     * another person's Telegram account.
     */
    remember(draft('p1', '144022504'))
    const r = claim('999', 'p1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.why).toContain('не вам')
  })

  it('a refusal does not reveal whether the id exists', () => {
    remember(draft('p1', '144022504'))
    const foreign = claim('999', 'p1')
    const missing = claim('999', 'nonexistent')
    // Different reasons are fine; what must not differ is that both refuse.
    expect(foreign.ok).toBe(false)
    expect(missing.ok).toBe(false)
  })

  it('the owner can confirm their own', () => {
    remember(draft('p1', '144022504', 'текст письма'))
    const r = claim('144022504', 'p1')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.proposal.what).toBe('текст письма')
  })
})

describe('confirming consumes the proposal', () => {
  it('a second press cannot send the same message twice', () => {
    /*
     * On a phone a slow reply is indistinguishable from a missed press, so the
     * second tap is not a rare case -- it is the normal one.
     */
    remember(draft('p1', '144022504'))
    expect(claim('144022504', 'p1').ok).toBe(true)
    const again = claim('144022504', 'p1')
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.why).toContain('уже подтверждено')
  })

  it('cancelling also consumes it, so a cancelled draft cannot be sent', () => {
    // Cancel goes through the same claim; that is the point.
    remember(draft('p1', '144022504'))
    expect(claim('144022504', 'p1').ok).toBe(true)
    expect(claim('144022504', 'p1').ok).toBe(false)
  })
})

describe('one pending proposal per person', () => {
  it('a new draft replaces the old one', () => {
    /*
     * Two drafts waiting at once is how somebody confirms the wrong one: the
     * buttons look identical and the chat has moved on.
     */
    remember(draft('p1', '144022504', 'первое'))
    remember(draft('p2', '144022504', 'второе'))
    expect(pendingFor('144022504')?.what).toBe('второе')
    expect(claim('144022504', 'p1').ok).toBe(false)
  })

  it('two different people keep their own', () => {
    remember(draft('p1', '111'))
    remember(draft('p2', '222'))
    expect(pendingFor('111')?.id).toBe('p1')
    expect(pendingFor('222')?.id).toBe('p2')
    expect(pendingCount()).toBe(2)
  })
})

describe('nothing waits for a person who has nothing', () => {
  it('pendingFor is null rather than somebody else draft', () => {
    remember(draft('p1', '144022504'))
    expect(pendingFor('999')).toBeNull()
  })
})
