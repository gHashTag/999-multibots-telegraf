/**
 * Ratchet: the USDT (jetton) payment detector must parse the incoming
 * internal_transfer body as a BoC and read the amount as a VarUInteger 16.
 *
 * parseJettonAmount used to do Buffer.from(body,'base64').readUInt32BE(0) and
 * compare it with the internal_transfer op. But TON Center returns the body as
 * a base64 BoC whose first 4 bytes are the BoC magic 0xB5EE9C72 -- so the op
 * never matched, the function returned 0 for EVERY transfer, and
 * getJettonTransactions' `amount > 0` filter dropped every incoming USDT
 * payment: findPaymentByComment returned null, the scene said "not found",
 * and the user who paid real USDT on-chain was never credited (no refund path
 * exists for an on-chain jetton transfer). Even past the op check, the amount
 * was read as a fixed 8-byte integer, but Coins are variable-length.
 *
 * OWNER-GATED: this changes WHICH payments are detected and credited, so it
 * ships as a draft for the owner to merge. Fixtures: lib-built (@ton/core) for
 * the edge cases, PLUS one CHAIN-CAPTURED real transfer corroborated against
 * TON Center v3's independent decoder (see REAL_BODY below).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { beginCell, Address } from '@ton/core'
import {
  parseJettonInternalTransfer,
  JETTON_INTERNAL_TRANSFER_OP,
} from '@/core/ton/jettonBody'

const INDEX = path.resolve(__dirname, '../../core/ton/index.ts')
const SENDER = Address.parse('EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N')

/** Build a TEP-74 internal_transfer body as TON Center would return it (base64 BoC). */
function fixture(
  amount: bigint,
  comment: string,
  opts: { viaRef?: boolean; op?: number } = {}
): string {
  const memo = beginCell().storeUint(0, 32).storeStringTail(comment)
  const b = beginCell()
    .storeUint(opts.op ?? JETTON_INTERNAL_TRANSFER_OP, 32)
    .storeUint(7n, 64) // query_id
    .storeCoins(amount)
    .storeAddress(SENDER) // from
    .storeAddress(null) // response_address = addr_none
    .storeCoins(1n) // forward_ton_amount
  if (opts.viaRef) b.storeBit(1).storeRef(memo.endCell())
  else b.storeBit(0).storeBuilder(memo)
  return b.endCell().toBoc().toString('base64')
}

/** Text of the parseJettonAmount function in index.ts. */
function parseJettonAmountText(source: string): string {
  const i = source.indexOf('function parseJettonAmount(')
  if (i < 0) return ''
  const j = source.indexOf('\n}\n', i)
  return source.slice(i, j)
}

describe('USDT jetton amount is parsed from the BoC body (was: always 0)', () => {
  it('recovers amount and inline memo from an internal_transfer body', () => {
    const r = parseJettonInternalTransfer(fixture(5_000_000n, 'INV-42'))
    expect(r).not.toBeNull()
    expect(r!.amount).toBe(5_000_000n)
    expect(r!.comment).toBe('INV-42')
  })

  it('recovers the memo when forward_payload is carried in a ref cell', () => {
    const r = parseJettonInternalTransfer(
      fixture(250_000n, 'inv_777', { viaRef: true })
    )
    expect(r?.amount).toBe(250_000n)
    expect(r?.comment).toBe('inv_777')
  })

  it('amount is a VarUInteger, not a fixed width: tiny and large values round-trip', () => {
    expect(parseJettonInternalTransfer(fixture(1n, 'x'))?.amount).toBe(1n)
    expect(
      parseJettonInternalTransfer(fixture(123_456_789_012n, 'x'))?.amount
    ).toBe(123_456_789_012n)
  })

  it('returns null for a non-internal_transfer op and for garbage', () => {
    // 0x0f8a7ea5 = the outgoing `transfer` op a user wallet sends -- not what our wallet receives.
    expect(
      parseJettonInternalTransfer(fixture(5n, 'INV', { op: 0x0f8a7ea5 }))
    ).toBeNull()
    expect(parseJettonInternalTransfer('not base64 boc')).toBeNull()
  })

  it('why the old reader was dead: the body starts with the BoC magic, not the op', () => {
    const buf = Buffer.from(fixture(5_000_000n, 'INV-42'), 'base64')
    expect(buf.readUInt32BE(0)).toBe(0xb5ee9c72)
    expect(buf.readUInt32BE(0)).not.toBe(JETTON_INTERNAL_TRANSFER_OP)
  })

  // CHAIN-CAPTURED fixture (not lib-generated): the real in_msg.msg_data.body of
  // an incoming USDT internal_transfer, read from TON Center v2 getTransactions
  // on the DESTINATION JETTON WALLET (the address getJettonTransactions queries),
  // and corroborated against TON Center v3 jetton/transfers -- an INDEPENDENT
  // decoder -- on four points: amount, source jetton wallet, decoded text memo,
  // and block time (|dt| = 0s).
  //   dest jetton wallet: 0:52A63C1D92E23EA97E60B7613B723CCF20F4F6A13512D276F77AE899850A3AF4
  //   dest tx hash:       zaMcz/0sat3yg+V+naqayLBvA9rEYtMC+4PdcDLOZc4=  (lt 101954559000005, utime 1788800199)
  //   v3 sender-side tx:  GeKLD8koUdE4pvppUQHCa7BtitgBcyv336Is1xXsXvU=
  //   msg_data @type:     msg.dataRaw
  const REAL_BODY =
    'te6cckEBAgEAigABpxeNRRl8Ygsi5N5Njj8/zwgAUFltDRT/QfFa+SOaX+983XiD+FfYcMoAj/6ZAdsBEtcACgstoaKf6D4rXyRzS/3vm68Qfwr7DhlAEf/TIDtgIlrEBwEAYgAAAABUZWxlZ3JhbSBQcmVtaXVtIGZvciA2IG1vbnRocyAKClJlZiMyU2ZTMkc1azVMbJ8/'
  const REAL_AMOUNT = 15990000n // micro-USDT per TON Center v3 (15.99 USDT)
  const REAL_MEMO = 'Telegram Premium for 6 months \n\nRef#2SfS2G5k5'

  it('real chain data: parses the amount and memo of a captured USDT transfer', () => {
    const r = parseJettonInternalTransfer(REAL_BODY)
    expect(r).not.toBeNull()
    expect(r!.amount).toBe(REAL_AMOUNT)
    expect(r!.comment).toBe(REAL_MEMO)
  })

  it('real chain data: the old fixed-offset reader hit the BoC magic here too', () => {
    const buf = Buffer.from(REAL_BODY, 'base64')
    expect(buf.readUInt32BE(0)).toBe(0xb5ee9c72)
    expect(buf.readUInt32BE(0)).not.toBe(JETTON_INTERNAL_TRANSFER_OP)
  })

  const source = fs.readFileSync(INDEX, 'utf8')

  it('floor + structure: parseJettonAmount delegates to the BoC parser and has no fixed-offset read', () => {
    const fn = parseJettonAmountText(source)
    expect(fn.length).toBeGreaterThan(0)
    expect(fn).toContain('parseJettonInternalTransfer(')
    expect(fn).not.toContain('readUInt32BE(')
    // parseComment consults the jetton forward_payload for msg.dataRaw bodies
    expect(source).toContain(
      'const jetton = parseJettonInternalTransfer(msgData.body)'
    )
  })

  it('self-check: an old-style fixed-offset body is detected', () => {
    const bad = `function parseJettonAmount(tx: any): number {
  const body = Buffer.from(tx.in_msg.msg_data.body, 'base64')
  const op = body.readUInt32BE(0)
  return op === 0x178d4519 ? Number(body.readBigUInt64BE(12)) : 0
}
`
    const t = parseJettonAmountText(bad)
    expect(t).toContain('readUInt32BE(')
    expect(t).not.toContain('parseJettonInternalTransfer(')
  })

  it('mutation: severing the delegation in the real source turns the check RED', () => {
    const mutated = source.replace(
      'const parsed = parseJettonInternalTransfer(body)',
      'const parsed = null as { amount: bigint } | null'
    )
    expect(mutated).not.toEqual(source)
    expect(parseJettonAmountText(mutated)).not.toContain(
      'parseJettonInternalTransfer('
    )
  })
})
