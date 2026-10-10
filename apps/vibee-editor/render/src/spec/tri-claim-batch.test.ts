/**
 * Spec tri-claim-batch.t27 (gHashTag/t27#8348), every test block run against
 * the render: the rules from tri-claim-batch.logic.ts and the batch route in
 * src/tri-claim.ts. The route end to end -- sixteen messages, a quorum each,
 * one minter read, refusals named per earning, the wallet's message limit --
 * runs in tri-claim.test.ts "withdraw all".
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as SPEC from './tri-claim-batch.gen'
import {
  batchSize,
  confirmationsFor,
  continueAfter,
  countsAsDone,
  mayRetry,
  messagesPerTx,
  selectable,
  transactionsFor,
  valueMilliton,
} from './tri-claim-batch.logic'
import {
  MINT_VALUE_NANO,
  TRI_CLAIM_BATCH_PATH,
  refusalKind,
} from '../tri-claim'

describe('spec tri-claim-batch.t27', () => {
  it('a request builds at most sixteen messages', () => {
    expect(SPEC.BATCH_MAX).toBe(16)
    expect(SPEC.SIGN_CONCURRENCY).toBe(4)
    expect(batchSize(0)).toBe(0)
    expect(batchSize(5)).toBe(5)
    expect(batchSize(16)).toBe(16)
    expect(batchSize(17)).toBe(16)
    expect(batchSize(874)).toBe(16)
    expect(TRI_CLAIM_BATCH_PATH).toBe('/api/tri/claim/batch')
  })

  it('only earnings neither revoked nor sent are picked, oldest first', () => {
    expect(SPEC.OLDEST_FIRST).toBe(true)
    expect(selectable(false, false)).toBe(true)
    expect(selectable(true, false)).toBe(false)
    expect(selectable(false, true)).toBe(false)
    expect(selectable(true, true)).toBe(false)
    // The card picks with this rule (player TriClaimCard.tsx "withdraw all").
    const card = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        '..',
        'player',
        'src',
        'components',
        'Profile',
        'TriClaimCard.tsx'
      ),
      'utf8'
    )
    expect(card).toMatch(/acceptedAt/)
  })

  it('a transaction carries what the wallet allows, four when it says nothing', () => {
    expect(SPEC.WALLET_MESSAGES_DEFAULT).toBe(4)
    expect(SPEC.WALLET_MESSAGES_MAX).toBe(255)
    expect(messagesPerTx(0)).toBe(4)
    expect(messagesPerTx(1)).toBe(1)
    expect(messagesPerTx(4)).toBe(4)
    expect(messagesPerTx(255)).toBe(255)
    expect(messagesPerTx(256)).toBe(255)
    expect(transactionsFor(16, 4)).toBe(4)
    expect(transactionsFor(17, 4)).toBe(5)
    expect(transactionsFor(16, 255)).toBe(1)
    expect(transactionsFor(874, 255)).toBe(4)
    expect(transactionsFor(0, 4)).toBe(0)
  })

  it('each message carries a tenth of a TON and a batch lives five minutes', () => {
    expect(SPEC.MINT_VALUE_MILLITON).toBe(100)
    expect(valueMilliton(1)).toBe(100)
    expect(valueMilliton(16)).toBe(1600)
    expect(SPEC.VALID_FOR_S).toBe(300)
    // The value the host puts on every message is the spec's, in nanoton.
    expect(MINT_VALUE_NANO).toBe(BigInt(SPEC.MINT_VALUE_MILLITON) * 1_000_000n)
  })

  it('the run stops at a cancelled prompt or an empty batch', () => {
    expect(continueAfter(16, true, false)).toBe(true)
    expect(continueAfter(16, false, false)).toBe(false)
    expect(continueAfter(16, true, true)).toBe(false)
    expect(continueAfter(0, true, false)).toBe(false)
  })

  it('the confirmations are one per batch of sixteen, counted before the press', () => {
    expect(confirmationsFor(874, 255)).toBe(55)
    expect(confirmationsFor(874, 4)).toBe(219)
    expect(confirmationsFor(16, 255)).toBe(1)
    expect(confirmationsFor(17, 255)).toBe(2)
    expect(confirmationsFor(10, 4)).toBe(3)
    expect(confirmationsFor(0, 255)).toBe(0)
    expect(confirmationsFor(874, 255)).not.toBe(4)
    // The server lists these numbers (tri-claim.test.ts "counts the wallet
    // confirmations before the press"); the card shows them before the press.
  })

  it('a refusal keeps its reason: done counts, passing is retried twice, final stops', () => {
    expect(SPEC.REFUSAL_DONE).toBe(1)
    expect(SPEC.REFUSAL_PASSING).toBe(2)
    expect(SPEC.REFUSAL_FINAL).toBe(3)
    expect(countsAsDone(SPEC.REFUSAL_DONE)).toBe(true)
    expect(countsAsDone(SPEC.REFUSAL_PASSING)).toBe(false)
    expect(countsAsDone(SPEC.REFUSAL_FINAL)).toBe(false)
    expect(SPEC.MAX_RETRY_ROUNDS).toBe(2)
    expect(mayRetry(SPEC.REFUSAL_PASSING, 0)).toBe(true)
    expect(mayRetry(SPEC.REFUSAL_PASSING, 1)).toBe(true)
    expect(mayRetry(SPEC.REFUSAL_PASSING, 2)).toBe(false)
    expect(mayRetry(SPEC.REFUSAL_FINAL, 0)).toBe(false)
    expect(mayRetry(SPEC.REFUSAL_DONE, 0)).toBe(false)
    expect(SPEC.SENT_IS_NOT_MINTED).toBe(true)
    // The host sorts codes with the spec's lists and nothing else.
    expect(refusalKind('already_minted')).toBe(SPEC.REFUSAL_DONE)
    for (const c of SPEC.PASSING_CODES.split(','))
      expect(refusalKind(c)).toBe(SPEC.REFUSAL_PASSING)
    for (const c of ['earning_revoked', 'not_merged', 'not_your_earning'])
      expect(refusalKind(c)).toBe(SPEC.REFUSAL_FINAL)
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(2)
    const spec = readFileSync(join(__dirname, 'tri-claim-batch.t27'), 'utf8')
    const notes = [...spec.matchAll(/^\/\/ v(\d+) \(/gm)].map(m => Number(m[1]))
    expect(Math.max(...notes)).toBe(SPEC.VERSION)
  })
})
