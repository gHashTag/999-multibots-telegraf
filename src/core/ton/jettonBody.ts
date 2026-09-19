import { Cell } from '@ton/core'

/** TEP-74 jetton-wallet internal_transfer op code. */
export const JETTON_INTERNAL_TRANSFER_OP = 0x178d4519

/**
 * Parse a jetton-wallet internal_transfer message body.
 *
 * TON Center returns msg_data.body as a base64 BoC: its first 4 bytes are the
 * BoC magic (0xB5EE9C72), NOT the message op, and the amount is a
 * VarUInteger 16 (Coins), NOT a fixed 8-byte integer. A fixed-offset reader
 * therefore never matches the op and reports 0 for every transfer -- which is
 * how getJettonTransactions came to drop every incoming USDT payment.
 *
 * TL-B (TEP-74):
 *   internal_transfer#178d4519 query_id:uint64 amount:(VarUInteger 16)
 *     from:MsgAddress response_address:MsgAddress
 *     forward_ton_amount:(VarUInteger 16) forward_payload:(Either Cell ^Cell)
 * A text memo is forward_payload = op 0 (uint32) followed by a snake string.
 *
 * Pure: no I/O, no logging. Returns null for anything that is not a
 * well-formed internal_transfer, so callers can treat null as "not a payment".
 */
export function parseJettonInternalTransfer(
  bodyBase64: string
): { amount: bigint; comment: string } | null {
  try {
    const cell = Cell.fromBoc(Buffer.from(bodyBase64, 'base64'))[0]
    if (!cell) return null
    const s = cell.beginParse()
    if (s.remainingBits < 32 + 64) return null
    const op = s.loadUint(32)
    if (op !== JETTON_INTERNAL_TRANSFER_OP) return null
    s.loadUintBig(64) // query_id
    const amount = s.loadCoins()
    s.loadMaybeAddress() // from
    s.loadMaybeAddress() // response_address
    s.loadCoins() // forward_ton_amount

    let comment = ''
    // Either Cell ^Cell: bit 0 = payload inline in this slice, bit 1 = in a ref.
    const payload = s.loadBit() ? s.loadRef().beginParse() : s
    if (payload.remainingBits >= 32 && payload.loadUint(32) === 0) {
      comment = payload.loadStringTail()
    }
    return { amount, comment }
  } catch {
    return null
  }
}
