/**
 * Spec tri-wallet-chains.t27 (gHashTag/t27#8293), every test block run
 * against the render: the rules from tri-wallet-chains.logic.ts, then the
 * code that obeys them in src/tri-wallet-chains.ts (the EVM, Solana and TRON
 * signatures) and src/tri-wallet.ts (the routes, the nonce, the tables). The
 * routes themselves -- 401 without a person, a proposal that binds nothing,
 * a confirmation only by the nonce's own person -- run end to end in
 * tri-wallet.test.ts at the render's root.
 */
import { generateKeyPairSync, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { base58 } from '@scure/base'
import * as SPEC from './tri-wallet-chains.gen'
import {
  addressBytes,
  bindCommits,
  unbindCommits,
  chainKnown,
  checksSignature,
  keySource,
  mayBind,
  mayConfirm,
  mayCallPublic,
  mayIssue,
  mayPropose,
  networksOf,
  nonceLengthOk,
  paidOn,
  proofExpired,
  proofFromFuture,
  proposalBinds,
  recoveryId,
  signatureBytes,
} from './tri-wallet-chains.logic'
import {
  CHAIN_ID,
  TEXT_CHAIN_NETWORK,
  bindMessage,
  checkChainProof,
  eip55,
  isNonceShape,
  parseAddress,
  textChainOf,
} from '../tri-wallet-chains'
import {
  countPublicCall,
  resetPublicCallsForTests,
  MAX_OPEN_CHALLENGES,
  PROOF_TTL_MS,
  TON_NETWORKS,
  TRI_WALLET_PUBLIC_PATHS,
} from '../tri-wallet'
import { CHAIN_TON as CLAIM_CHAIN_TON } from '../tri-claim'

const DOMAIN = 'app.t27.ai'
const NOW = Date.UTC(2026, 9, 9, 12, 0, 0)
const NONCE = 'c'.repeat(64)

function evmSigned(
  over: Partial<{ v: number; issuedMs: number; signer: Uint8Array }> = {}
) {
  const priv = secp256k1.utils.randomSecretKey()
  const key = keccak_256(secp256k1.getPublicKey(priv, false).subarray(1))
  const address = eip55(key.subarray(12))
  const issuedAt = new Date(over.issuedMs ?? NOW).toISOString()
  const text = bindMessage({
    domain: DOMAIN,
    chain: 'evm',
    address,
    nonce: NONCE,
    issuedAt,
  })
  const body = Buffer.from(text, 'utf8')
  const digest = keccak_256(
    Buffer.concat([
      Buffer.from(`\x19Ethereum Signed Message:\n${body.length}`),
      body,
    ])
  )
  const rec = secp256k1.sign(digest, over.signer ?? priv, {
    prehash: false,
    format: 'recovered',
  })
  const v = over.v ?? 27 + rec[0]
  const signature =
    '0x' +
    Buffer.concat([Buffer.from(rec.subarray(1)), Buffer.from([v])]).toString(
      'hex'
    )
  return { chain: 'evm', address, nonce: NONCE, issuedAt, signature, rec }
}

describe('spec tri-wallet-chains.t27', () => {
  it('four chains, numbered as the mint oracle numbers them', () => {
    expect(SPEC.CHAIN_TON).toBe(1)
    expect(SPEC.CHAIN_SOLANA).toBe(2)
    expect(SPEC.CHAIN_EVM).toBe(3)
    expect(SPEC.CHAIN_TRON).toBe(4)
    expect(SPEC.CHAINS_BOUND).toBe(4)
    for (const id of [1, 2, 3, 4]) expect(chainKnown(id)).toBe(true)
    expect(chainKnown(0)).toBe(false)
    expect(chainKnown(5)).toBe(false)
    // The host: every name maps to the spec's id, the claim uses the same TON.
    expect(Object.keys(CHAIN_ID)).toHaveLength(SPEC.CHAINS_BOUND)
    for (const id of Object.values(CHAIN_ID)) expect(chainKnown(id)).toBe(true)
    expect(CLAIM_CHAIN_TON).toBe(SPEC.CHAIN_TON)
    expect(textChainOf('bitcoin')).toBeNull()
    expect(textChainOf('ton')).toBeNull()
  })

  it('TON binds per network, EVM, Solana and TRON once for every network', () => {
    expect(SPEC.EVM_ONE_ADDRESS_ALL_CHAINS).toBe(true)
    expect(networksOf(SPEC.CHAIN_TON)).toBe(2)
    expect(networksOf(SPEC.CHAIN_EVM)).toBe(1)
    expect(networksOf(SPEC.CHAIN_SOLANA)).toBe(1)
    expect(networksOf(SPEC.CHAIN_TRON)).toBe(1)
    expect(networksOf(9)).toBe(0)
    // The host: TON's networks and one network per text chain.
    expect(TON_NETWORKS).toHaveLength(networksOf(SPEC.CHAIN_TON))
    for (const [name, network] of Object.entries(TEXT_CHAIN_NETWORK)) {
      expect(networksOf(CHAIN_ID[name as 'evm'])).toBe(1)
      expect(typeof network).toBe('string')
    }
  })

  it('the key is never taken from the request', () => {
    expect(SPEC.KEY_FROM_REQUEST).toBe(false)
    expect(SPEC.EVM_CONTRACT_WALLETS).toBe(false)
    expect(keySource(SPEC.CHAIN_TON)).toBe(SPEC.KEY_STATE_INIT)
    expect(keySource(SPEC.CHAIN_EVM)).toBe(SPEC.KEY_RECOVERED)
    expect(keySource(SPEC.CHAIN_SOLANA)).toBe(SPEC.KEY_IS_ADDRESS)
    expect(keySource(SPEC.CHAIN_TRON)).toBe(SPEC.KEY_RECOVERED)
    expect(keySource(0)).toBe(SPEC.KEY_NONE)
    expect(keySource(5)).toBe(SPEC.KEY_NONE)
    // The host: a thief's signature with the victim's key named beside it.
    const victim = evmSigned()
    const thief = secp256k1.utils.randomSecretKey()
    const forged = evmSigned({ signer: thief })
    expect(
      checkChainProof(
        {
          ...forged,
          address: victim.address,
          publicKey: Buffer.from(secp256k1.getPublicKey(thief)).toString('hex'),
        } as never,
        DOMAIN,
        NOW
      )
    ).toEqual({ ok: false, code: 'signature_invalid' })
  })

  it("addresses and signatures have each chain's length", () => {
    expect(addressBytes(SPEC.CHAIN_EVM)).toBe(20)
    expect(addressBytes(SPEC.CHAIN_SOLANA)).toBe(32)
    expect(addressBytes(SPEC.CHAIN_TON)).toBe(32)
    expect(addressBytes(SPEC.CHAIN_TRON)).toBe(20)
    expect(addressBytes(0)).toBe(0)
    expect(signatureBytes(SPEC.CHAIN_EVM)).toBe(65)
    expect(signatureBytes(SPEC.CHAIN_SOLANA)).toBe(64)
    expect(signatureBytes(SPEC.CHAIN_TON)).toBe(64)
    expect(signatureBytes(SPEC.CHAIN_TRON)).toBe(65)
    expect(signatureBytes(7)).toBe(0)
    // The host parses each chain's key to exactly that many bytes.
    const p = evmSigned()
    expect(parseAddress('evm', p.address)!.key).toHaveLength(20)
    expect(parseAddress('evm', p.address.slice(0, -2))).toBeNull()
    const sol = generateKeyPairSync('ed25519')
      .publicKey.export({ format: 'der', type: 'spki' })
      .subarray(12)
    expect(parseAddress('solana', base58.encode(sol))!.key).toHaveLength(32)
    expect(parseAddress('solana', base58.encode(sol.subarray(1)))).toBeNull()
    expect(
      parseAddress('tron', 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')!.key
    ).toHaveLength(20)
    // A 64-byte EVM signature is not an EVM signature.
    expect(
      checkChainProof(
        { ...p, signature: p.signature.slice(0, -2) },
        DOMAIN,
        NOW
      )
    ).toEqual({ ok: false, code: 'signature_malformed' })
  })

  it('an EVM or TRON message signature recovers with v 27, 28, 0 or 1 and nothing else', () => {
    expect(recoveryId(27)).toBe(0)
    expect(recoveryId(28)).toBe(1)
    expect(recoveryId(0)).toBe(0)
    expect(recoveryId(1)).toBe(1)
    expect(recoveryId(29)).toBe(-1)
    expect(recoveryId(37)).toBe(-1)
    expect(recoveryId(2)).toBe(-1)
    // The host: the same signature with v as 0/1 verifies, with 29 or an
    // EIP-155 v it does not.
    const p = evmSigned()
    expect(checkChainProof(p, DOMAIN, NOW).ok).toBe(true)
    const tail = (v: number) =>
      p.signature.slice(0, -2) + v.toString(16).padStart(2, '0')
    expect(
      checkChainProof({ ...p, signature: tail(p.rec[0]) }, DOMAIN, NOW).ok
    ).toBe(true)
    for (const v of [29, 37])
      expect(
        checkChainProof({ ...p, signature: tail(v) }, DOMAIN, NOW).ok
      ).toBe(false)
  })

  it('the message has eight lines and names a 64-hex nonce', () => {
    expect(SPEC.MESSAGE_LINES).toBe(8)
    expect(SPEC.NONCE_HEX_CHARS).toBe(64)
    expect(nonceLengthOk(64)).toBe(true)
    expect(nonceLengthOk(63)).toBe(false)
    expect(nonceLengthOk(65)).toBe(false)
    expect(nonceLengthOk(0)).toBe(false)
    // The host's text, line by line from the spec's strings.
    const lines = bindMessage({
      domain: DOMAIN,
      chain: 'tron',
      address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      nonce: NONCE,
      issuedAt: new Date(NOW).toISOString(),
    }).split('\n')
    expect(lines).toHaveLength(SPEC.MESSAGE_LINES)
    expect(lines[0]).toBe(`${DOMAIN} ${SPEC.MESSAGE_INTENT}`)
    expect(lines[2]).toBe(SPEC.MESSAGE_NO_SPEND)
    expect(lines[6]).toBe(`${SPEC.LABEL_NONCE}${NONCE}`)
    expect(isNonceShape(NONCE)).toBe(true)
    expect(isNonceShape(NONCE.slice(1))).toBe(false)
    expect(isNonceShape(NONCE.toUpperCase())).toBe(false)
  })

  it('a proof is fresh for 15 minutes and a minute ahead', () => {
    expect(SPEC.PROOF_TTL_MS).toBe(900000)
    expect(SPEC.CLOCK_SKEW_MS).toBe(60000)
    expect(proofExpired(0)).toBe(false)
    expect(proofExpired(900000)).toBe(false)
    expect(proofExpired(900001)).toBe(true)
    expect(proofFromFuture(-60000)).toBe(false)
    expect(proofFromFuture(-60001)).toBe(true)
    expect(proofFromFuture(900001)).toBe(false)
    // The host re-exports the window it times TON proofs and nonces with.
    expect(PROOF_TTL_MS).toBe(SPEC.PROOF_TTL_MS)
    const at = (issuedMs: number) =>
      checkChainProof(evmSigned({ issuedMs }), DOMAIN, NOW)
    expect(at(NOW - SPEC.PROOF_TTL_MS).ok).toBe(true)
    expect(at(NOW - SPEC.PROOF_TTL_MS - 1)).toEqual({
      ok: false,
      code: 'proof_expired',
    })
    expect(at(NOW + SPEC.CLOCK_SKEW_MS).ok).toBe(true)
    expect(at(NOW + SPEC.CLOCK_SKEW_MS + 1)).toEqual({
      ok: false,
      code: 'proof_from_future',
    })
    // An age beyond i32 is clamped, not thrown.
    expect(at(0)).toEqual({ ok: false, code: 'proof_expired' })
  })

  it('a person holds at most five open nonces', () => {
    expect(SPEC.MAX_OPEN_CHALLENGES).toBe(5)
    expect(SPEC.ISSUE_UNDER_PERSON_LOCK).toBe(true)
    expect(mayIssue(0)).toBe(true)
    expect(mayIssue(4)).toBe(true)
    expect(mayIssue(5)).toBe(false)
    expect(mayIssue(6)).toBe(false)
    // The cap the routes enforce (tri-wallet.test.ts "caps the challenges").
    expect(MAX_OPEN_CHALLENGES).toBe(SPEC.MAX_OPEN_CHALLENGES)
  })

  it('only the person binds, and an address has one person', () => {
    expect(SPEC.BIND_NEEDS_PERSON).toBe(true)
    expect(SPEC.ONE_PERSON_PER_ADDRESS).toBe(true)
    expect(mayBind(true, false)).toBe(true)
    expect(mayBind(false, false)).toBe(false)
    expect(mayBind(true, true)).toBe(false)
    expect(mayBind(false, true)).toBe(false)
    // End to end: tri-wallet.test.ts "keeps the bind, challenge and list
    // routes behind the person" and "refuses an EVM address another person
    // holds".
  })

  it("the wallet browser proposes once and only the person's confirmation binds", () => {
    expect(SPEC.NONCE_IN_FRAGMENT).toBe(true)
    expect(SPEC.PROPOSAL_NEEDS_CONFIRM).toBe(true)
    expect(mayPropose(true, true, false)).toBe(true)
    expect(mayPropose(false, true, false)).toBe(false)
    expect(mayPropose(true, false, false)).toBe(false)
    expect(mayPropose(true, true, true)).toBe(false)
    expect(mayConfirm(true, true, true)).toBe(true)
    expect(mayConfirm(false, true, true)).toBe(false)
    expect(mayConfirm(true, false, true)).toBe(false)
    expect(mayConfirm(true, true, false)).toBe(false)
    expect(proposalBinds(false)).toBe(false)
    expect(proposalBinds(true)).toBe(true)
    // Only /message and /propose pass the guard; the player mounts the
    // wallet-browser page at the spec's path and carries the nonce in the
    // fragment (end to end: tri-wallet.test.ts "a wallet browser proposes
    // once, binds nothing, and the person confirms").
    expect([...TRI_WALLET_PUBLIC_PATHS].sort()).toEqual([
      '/api/tri/wallet/message',
      '/api/tri/wallet/propose',
    ])
    const player = join(__dirname, '..', '..', '..', 'player', 'src')
    const app = readFileSync(join(player, 'App.tsx'), 'utf8')
    expect(app).toContain(`path="${SPEC.HANDOFF_PATH}"`)
    const lib = readFileSync(join(player, 'lib', 'triChains.ts'), 'utf8')
    expect(lib).toContain(`'${SPEC.HANDOFF_PATH}'`)
    expect(lib).toMatch(/#c=\$\{/)
  })

  it('a caller without a person gets thirty calls a minute, and a dead nonce costs no curve', () => {
    expect(SPEC.PUBLIC_CALLS_PER_WINDOW).toBe(30)
    expect(SPEC.PUBLIC_WINDOW_MS).toBe(60000)
    expect(SPEC.PUBLIC_CALLERS_TRACKED).toBe(10000)
    expect(mayCallPublic(1)).toBe(true)
    expect(mayCallPublic(30)).toBe(true)
    expect(mayCallPublic(31)).toBe(false)
    expect(SPEC.NONCE_BEFORE_SIGNATURE).toBe(true)
    expect(checksSignature(true, false)).toBe(true)
    expect(checksSignature(false, false)).toBe(false)
    expect(checksSignature(true, true)).toBe(false)
    // The host's counter: one window per PUBLIC_WINDOW_MS, per caller, and
    // the oldest caller let go past PUBLIC_CALLERS_TRACKED.
    resetPublicCallsForTests()
    let n = 0
    for (let i = 0; i < 31; i++) n = countPublicCall('a', NOW)
    expect(n).toBe(31)
    expect(mayCallPublic(n)).toBe(false)
    expect(countPublicCall('a', NOW + SPEC.PUBLIC_WINDOW_MS)).toBe(1)
    for (let i = 0; i < SPEC.PUBLIC_CALLERS_TRACKED + 5; i++)
      countPublicCall(`c${i}`, NOW)
    // 'a' was among the oldest and was let go: it starts over.
    expect(countPublicCall('a', NOW + SPEC.PUBLIC_WINDOW_MS)).toBe(1)
    resetPublicCallsForTests()
    // End to end: tri-wallet.test.ts "the public doors hold each caller to
    // a budget".
  })

  it('TRI is paid on TON only until the bridge is live', () => {
    expect(SPEC.PAYOUT_CHAIN).toBe(SPEC.CHAIN_TON)
    expect(SPEC.BRIDGE_LIVE).toBe(false)
    expect(paidOn(SPEC.CHAIN_TON)).toBe(true)
    expect(paidOn(SPEC.CHAIN_EVM)).toBe(false)
    expect(paidOn(SPEC.CHAIN_SOLANA)).toBe(false)
    expect(paidOn(SPEC.CHAIN_TRON)).toBe(false)
    expect(paidOn(0)).toBe(false)
  })

  it('a binding and an unbinding commit all their writes or none', () => {
    expect(bindCommits(true, true, true)).toBe(true)
    expect(bindCommits(false, true, true)).toBe(false)
    expect(bindCommits(true, false, true)).toBe(false)
    expect(bindCommits(true, true, false)).toBe(false)
    expect(bindCommits(false, false, false)).toBe(false)
    expect(unbindCommits(true, true)).toBe(true)
    expect(unbindCommits(true, false)).toBe(false)
    expect(unbindCommits(false, true)).toBe(false)
    // On a real Postgres, with a failure injected at every write:
    // tri-wallet.pg.test.ts "rolls back every write when any one fails".
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(3)
    const spec = readFileSync(join(__dirname, 'tri-wallet-chains.t27'), 'utf8')
    const notes = [...spec.matchAll(/^\/\/ v(\d+) \(/gm)].map(m => Number(m[1]))
    expect(Math.max(...notes)).toBe(SPEC.VERSION)
  })
})
