/**
 * TRI WALLETS BEYOND TON: an EVM, Solana or TRON address bound by the wallet's
 * own signature (spec automation/tri-wallet-chains.t27, src/spec/).
 *
 * TON keeps its ton_proof (tri-wallet.ts). These three sign TEXT a person
 * reads in the wallet: the spec's lines, the address, the one-time nonce the
 * person was issued, and when. The server rebuilds that text from the posted
 * fields and the signature must verify over exactly it -- nothing the client
 * calls "the message" is trusted.
 *
 * THE KEY NEVER COMES FROM THE REQUEST (spec key_source):
 *
 *   EVM, TRON  the public key is RECOVERED from the secp256k1 signature, and
 *              the address must be the last 20 bytes of its keccak256. A key
 *              of the caller's choosing would recover to another address.
 *   Solana     the address IS the ed25519 key; the signature verifies under
 *              it or it does not.
 *
 * One EVM key owns the same address on Ethereum, Base, BNB Chain, Polygon,
 * Arbitrum and every other EVM chain, so an EVM binding is one row for all of
 * them; likewise a Solana key on every cluster and a TRON key on mainnet and
 * its testnets. Smart-contract wallets (EIP-1271) are refused: proving one
 * takes a call to its chain, and v1 makes none.
 *
 * Nothing here moves a coin. Where TRI is actually paid is paidOn() -- TON
 * only, until the bridge is live.
 */

import { createPublicKey, verify } from 'node:crypto'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { base58, createBase58check } from '@scure/base'
import * as SPEC from './spec/tri-wallet-chains.gen'
import {
  addressBytes,
  chainKnown,
  keySource,
  nonceLengthOk,
  proofExpired,
  proofFromFuture,
  recoveryId,
  signatureBytes,
} from './spec/tri-wallet-chains.logic'

/** The chains signed as text; TON signs ton_proof (tri-wallet.ts). */
export type TextChain = 'evm' | 'solana' | 'tron'
export type ChainName = 'ton' | TextChain

/** Chain name to the spec's chain id. */
export const CHAIN_ID: Record<ChainName, number> = {
  [SPEC.CHAIN_TON_NAME]: SPEC.CHAIN_TON,
  [SPEC.CHAIN_EVM_NAME]: SPEC.CHAIN_EVM,
  [SPEC.CHAIN_SOLANA_NAME]: SPEC.CHAIN_SOLANA,
  [SPEC.CHAIN_TRON_NAME]: SPEC.CHAIN_TRON,
} as Record<ChainName, number>

/** The one network row each text chain binds (TON binds per network). */
export const TEXT_CHAIN_NETWORK: Record<TextChain, string> = {
  [SPEC.CHAIN_EVM_NAME]: SPEC.EVM_NETWORK,
  [SPEC.CHAIN_SOLANA_NAME]: SPEC.SOLANA_NETWORK,
  [SPEC.CHAIN_TRON_NAME]: SPEC.TRON_NETWORK,
} as Record<TextChain, string>

export function chainIdOf(name: unknown): number {
  return typeof name === 'string' && Object.hasOwn(CHAIN_ID, name)
    ? CHAIN_ID[name as ChainName]
    : 0
}

/** A name the spec knows and that signs text, or null. */
export function textChainOf(name: unknown): TextChain | null {
  const id = chainIdOf(name)
  if (!chainKnown(id) || id === SPEC.CHAIN_TON) return null
  return name as TextChain
}

// ---------------------------------------------------------------------------
// Addresses: parsed to their key bytes, printed in one canonical form
// ---------------------------------------------------------------------------

const tronCheck = createBase58check(sha256)
/** TRON's address prefix byte; the rest is the EVM-style key hash. */
const TRON_PREFIX = 0x41

export interface ParsedAddress {
  /** The bytes the key must hash (EVM, TRON) or be (Solana) to. */
  key: Uint8Array
  /** The form stored, shown and signed. */
  canonical: string
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) return null
  return Uint8Array.from(Buffer.from(hex, 'hex'))
}

/** EIP-55: the address's hex with the case its own keccak256 dictates. */
export function eip55(key: Uint8Array): string {
  const lower = Buffer.from(key).toString('hex')
  const hash = Buffer.from(keccak_256(Buffer.from(lower, 'ascii'))).toString(
    'hex'
  )
  let out = '0x'
  for (let i = 0; i < lower.length; i++)
    out += parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i]
  return out
}

export function parseAddress(
  chain: TextChain,
  address: unknown
): ParsedAddress | null {
  if (typeof address !== 'string' || address.length > 128) return null
  const want = addressBytes(CHAIN_ID[chain])
  try {
    if (chain === 'evm') {
      if (!/^0x/i.test(address)) return null
      const key = hexToBytes(address.slice(2))
      if (!key || key.length !== want) return null
      // A mixed-case address carries a checksum; a wrong one is a typo.
      const mixed = /[a-f]/.test(address) && /[A-F]/.test(address)
      if (mixed && eip55(key) !== address) return null
      return { key, canonical: eip55(key) }
    }
    if (chain === 'tron') {
      const raw = tronCheck.decode(address)
      if (raw.length !== want + 1 || raw[0] !== TRON_PREFIX) return null
      const key = raw.slice(1)
      return { key, canonical: tronCheck.encode(raw) }
    }
    const key = base58.decode(address)
    if (key.length !== want) return null
    return { key, canonical: base58.encode(key) }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// The message
// ---------------------------------------------------------------------------

export interface MessageFields {
  domain: string
  chain: TextChain
  /** Canonical: parseAddress(...).canonical. */
  address: string
  nonce: string
  /** ISO 8601 UTC, as Date.prototype.toISOString prints it. */
  issuedAt: string
}

/** The text the wallet shows and signs: the spec's lines and nothing else. */
export function bindMessage(f: MessageFields): string {
  return [
    `${f.domain} ${SPEC.MESSAGE_INTENT}`,
    '',
    SPEC.MESSAGE_NO_SPEND,
    '',
    `${SPEC.LABEL_CHAIN}${f.chain}`,
    `${SPEC.LABEL_ADDRESS}${f.address}`,
    `${SPEC.LABEL_NONCE}${f.nonce}`,
    `${SPEC.LABEL_ISSUED}${f.issuedAt}`,
  ].join('\n')
}

/** EIP-191 and TRON's signMessageV2: a prefix, the byte length, the text. */
function prefixedDigest(chain: TextChain, text: string): Uint8Array {
  const body = Buffer.from(text, 'utf8')
  const name = chain === 'tron' ? 'TRON' : 'Ethereum'
  const head = Buffer.from(`\x19${name} Signed Message:\n${body.length}`)
  return keccak_256(Buffer.concat([head, body]))
}

// ---------------------------------------------------------------------------
// Signatures
// ---------------------------------------------------------------------------

/** EVM and TRON: hex, 0x optional. Solana: base58 or base64. */
function decodeSignature(chain: TextChain, sig: unknown): Uint8Array | null {
  if (typeof sig !== 'string' || sig.length > 256) return null
  const want = signatureBytes(CHAIN_ID[chain])
  let bytes: Uint8Array | null = null
  try {
    if (chain === 'solana') {
      bytes = /^[1-9A-HJ-NP-Za-km-z]+$/.test(sig)
        ? base58.decode(sig)
        : Uint8Array.from(Buffer.from(sig, 'base64'))
    } else {
      bytes = hexToBytes(sig.replace(/^0x/i, ''))
    }
  } catch {
    return null
  }
  return bytes && bytes.length === want ? bytes : null
}

/** The 20-byte key hash a secp256k1 message signature recovers to, or null. */
function recoveredKey(
  digest: Uint8Array,
  sig: Uint8Array
): { hash: Uint8Array; publicKey: Uint8Array } | null {
  const rec = recoveryId(sig[64])
  if (rec < 0) return null
  try {
    const point = secp256k1.Signature.fromBytes(
      Uint8Array.of(rec, ...sig.subarray(0, 64)),
      'recovered'
    ).recoverPublicKey(digest)
    const publicKey = point.toBytes(false)
    return { hash: keccak_256(publicKey.subarray(1)).subarray(12), publicKey }
  } catch {
    return null
  }
}

/**
 * The EVM or TRON address that signed `text`, or null: the same recovery the
 * check runs, exposed so a test can hold it to a signature made elsewhere.
 */
export function signerOf(
  chain: 'evm' | 'tron',
  text: string,
  signature: string
): string | null {
  const sig = decodeSignature(chain, signature)
  const got = sig && recoveredKey(prefixedDigest(chain, text), sig)
  if (!got) return null
  return chain === 'evm'
    ? eip55(got.hash)
    : tronCheck.encode(Uint8Array.of(TRON_PREFIX, ...got.hash))
}

const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

function ed25519Holds(key: Uint8Array, text: string, sig: Uint8Array) {
  try {
    const pub = createPublicKey({
      key: Buffer.concat([SPKI_ED25519_PREFIX, key]),
      format: 'der',
      type: 'spki',
    })
    return verify(null, Buffer.from(text, 'utf8'), pub, sig)
  } catch {
    return false
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && Buffer.from(a).equals(Buffer.from(b))
}

// ---------------------------------------------------------------------------
// The whole check
// ---------------------------------------------------------------------------

export interface ChainProofInput {
  chain: unknown
  address: unknown
  nonce: unknown
  issuedAt: unknown
  signature: unknown
}

export type ChainProofCheck =
  | {
      ok: true
      chain: TextChain
      network: string
      address: string
      publicKey: string
    }
  | { ok: false; code: string }

/** An age in ms the spec's i32 can hold: beyond it, stale or future anyway. */
// t27-plumbing: clamps a number into the i32 the spec's fn takes, not a rule
const I32_MAX = 2 ** 31 - 1
function ageForSpec(ms: number): number {
  return Math.max(-I32_MAX, Math.min(I32_MAX, Math.trunc(ms)))
}

export function proofAge(issuedMs: number, nowMs: number): number {
  return ageForSpec(nowMs - issuedMs)
}

/** issuedAt as the ISO string toISOString() prints, or null. */
export function issuedAtMs(issuedAt: unknown): number | null {
  if (typeof issuedAt !== 'string') return null
  const ms = Date.parse(issuedAt)
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== issuedAt)
    return null
  return ms
}

export function isNonceShape(s: unknown): s is string {
  return (
    typeof s === 'string' && nonceLengthOk(s.length) && /^[0-9a-f]+$/.test(s)
  )
}

/**
 * Pure: everything about a text proof that does not need the database. That
 * the nonce was issued, to whom, and is unspent is the caller's to check.
 */
export function checkChainProof(
  input: ChainProofInput,
  domain: string,
  nowMs: number
): ChainProofCheck {
  const chain = textChainOf(input.chain)
  if (!chain) return { ok: false, code: 'chain_unknown' }
  const parsed = parseAddress(chain, input.address)
  if (!parsed) return { ok: false, code: 'address_malformed' }
  if (!isNonceShape(input.nonce))
    return { ok: false, code: 'payload_malformed' }
  const issued = issuedAtMs(input.issuedAt)
  if (issued === null) return { ok: false, code: 'timestamp_malformed' }
  const age = proofAge(issued, nowMs)
  if (proofExpired(age)) return { ok: false, code: 'proof_expired' }
  if (proofFromFuture(age)) return { ok: false, code: 'proof_from_future' }
  const sig = decodeSignature(chain, input.signature)
  if (!sig) return { ok: false, code: 'signature_malformed' }

  const text = bindMessage({
    domain,
    chain,
    address: parsed.canonical,
    nonce: input.nonce,
    issuedAt: input.issuedAt as string,
  })
  const id = CHAIN_ID[chain]
  const source = keySource(id)
  let publicKey: Uint8Array | null = null
  if (source === SPEC.KEY_RECOVERED) {
    const got = recoveredKey(prefixedDigest(chain, text), sig)
    if (got && sameBytes(got.hash, parsed.key)) publicKey = got.publicKey
  } else if (source === SPEC.KEY_IS_ADDRESS) {
    if (ed25519Holds(parsed.key, text, sig)) publicKey = parsed.key
  }
  if (!publicKey) return { ok: false, code: 'signature_invalid' }
  return {
    ok: true,
    chain,
    network: TEXT_CHAIN_NETWORK[chain],
    address: parsed.canonical,
    publicKey: Buffer.from(publicKey).toString('hex'),
  }
}
