#!/usr/bin/env node
// tri ton-verify -- prove the USDT (jetton) payment parser against REAL chain
// data, with an INDEPENDENT oracle, in one command.
//
// WHY THIS EXISTS. parseJettonAmount read readUInt32BE(0) of a base64 BoC -- the
// BoC magic 0xB5EE9C72, never the op -- so it returned 0 for EVERY transfer and
// getJettonTransactions dropped every incoming USDT payment: paid on-chain,
// credited nobody (#2147). No test called the parser and no chain fixture
// existed, so the break was invisible. This tool makes "does the parser see
// real payments?" a one-command check, for #2147 and for any future TON change:
//   * v2 getTransactions on the JETTON WALLET = exactly what production reads
//     (getJettonTransactions -> getJettonWalletAddress). The REAL parser
//     (src/core/ton/jettonBody.ts, imported, not copied) runs on each in_msg.
//   * v3 jetton/transfers = an INDEPENDENT decoder (TON Center's own indexer)
//     used as the oracle: amount, source jetton wallet, decoded memo, time.
// A transfer is CORROBORATED when the parser agrees with v3 on all four points.
//
// TRAPS this encodes (both were false rulers in the first capture attempt):
//   * v3 `destination` is the OWNER address; its page carries
//     transfer_notification (0x7362d09c), not internal_transfer. The
//     internal_transfer lives on the owner's JETTON WALLET (v3 jetton/wallets).
//   * v2 returns friendly EQ... addresses, v3 raw 0:HEX -- compare via
//     Address.parse().toRawString(), never as strings.
//
// Usage:
//   node .claude/loop-opus/ton-verify.mjs <jetton-wallet>       verify this jetton wallet
//   node .claude/loop-opus/ton-verify.mjs --owner <address>     resolve its USDT jetton wallet first
//   node .claude/loop-opus/ton-verify.mjs                       uses --owner $TON_WALLET_ADDRESS
//   options: --limit N (page size, default 50) --json --self-check
// Exit codes (a non-zero is NEVER a pass):
//   0 every in-window v3 transfer corroborated (>=1)
//   1 MISMATCH: parser disagrees with the oracle on some point
//   2 UNAVAILABLE: network/API failure (not evidence of anything)
//   3 NO-TRANSFERS: the oracle shows no incoming transfers to compare
//   4 PARSER-BLIND: oracle shows transfers, parser produced 0 internal_transfers
//     (the #2147 failure class)

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Address, beginCell } from '@ton/core'

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '..',
  '..'
)
const USDT_MASTER = 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs'
const V2 = 'https://toncenter.com/api/v2'
const V3 = 'https://toncenter.com/api/v3'
const INTERNAL_TRANSFER_OP = 0x178d4519
const MAX_DT_S = 120

const sleep = ms => new Promise(r => setTimeout(r, ms))
export const rawAddr = a => {
  try {
    return Address.parse(String(a)).toRawString().toUpperCase()
  } catch {
    return null
  }
}

async function getJson(url, tries = 3) {
  let last = ''
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' } })
      if (r.ok) return r.json()
      last = `HTTP ${r.status}`
    } catch (e) {
      last = e.message
    }
    if (i + 1 < tries) await sleep(1500 * (i + 1))
  }
  throw new Error(`${last} for ${url}`)
}

/**
 * Load the REAL parser from src (Node >= 22.6 type-stripping). Never a copy.
 * TON_VERIFY_PARSER=<file> points at a parser that is not merged yet (e.g. a
 * draft branch's jettonBody.ts extracted into the repo tree so @ton/core resolves).
 */
async function loadParser() {
  const file =
    process.env.TON_VERIFY_PARSER ||
    path.join(ROOT, 'src/core/ton/jettonBody.ts')
  if (!fs.existsSync(file))
    throw new Error(
      `parser not on this checkout: ${file} (src/core/ton/jettonBody.ts lands with #2147; set TON_VERIFY_PARSER to verify an unmerged one)`
    )
  const mod = await import(pathToFileURL(file).href)
  if (typeof mod.parseJettonInternalTransfer !== 'function')
    throw new Error('parser export missing')
  return mod.parseJettonInternalTransfer
}

/**
 * Corroborate ONE oracle transfer against the parsed v2 page.
 * Pure: no I/O. Returns { status, detail } where status is
 * 'OK' | 'MISMATCH' | 'NOT-IN-PAGE'.
 */
export function corroborate(oracle, parsedTxs) {
  const wantAmount = String(oracle.amount)
  const wantSrc = rawAddr(oracle.source_wallet)
  const wantMemo = oracle.decoded_forward_payload?.comment ?? null
  const now = Number(oracle.transaction_now || 0)
  // candidates: same amount within the time window
  const cands = parsedTxs.filter(
    p =>
      String(p.amount) === wantAmount &&
      Math.abs((p.utime || 0) - now) <= MAX_DT_S
  )
  if (!cands.length) {
    // a same-amount tx outside the window / absent -> the page may simply be too short
    const anyAmount = parsedTxs.some(p => String(p.amount) === wantAmount)
    return {
      status: 'NOT-IN-PAGE',
      detail: anyAmount
        ? 'same amount only outside time window'
        : 'no parsed tx with this amount on the page',
    }
  }
  const exact = cands.find(
    p =>
      rawAddr(p.source) === wantSrc &&
      (wantMemo === null || p.comment === wantMemo)
  )
  if (exact)
    return {
      status: 'OK',
      detail: `amount ${wantAmount}, source ok, memo ${wantMemo === null ? 'n/a' : 'ok'}, |dt|=${Math.abs((exact.utime || 0) - now)}s`,
      tx: exact,
    }
  const c = cands[0]
  const why = []
  if (rawAddr(c.source) !== wantSrc)
    why.push(`source ${rawAddr(c.source)} != oracle ${wantSrc}`)
  if (wantMemo !== null && c.comment !== wantMemo)
    why.push(
      `memo ${JSON.stringify(c.comment)} != oracle ${JSON.stringify(wantMemo)}`
    )
  return { status: 'MISMATCH', detail: why.join('; ') || 'unknown', tx: c }
}

/** The #2147 class: oracle sees transfers, parser sees none. Pure. */
export function classify(oracleCount, parsedCount, results) {
  if (oracleCount === 0) return { code: 3, label: 'NO-TRANSFERS' }
  if (parsedCount === 0) return { code: 4, label: 'PARSER-BLIND' }
  if (results.some(r => r.status === 'MISMATCH'))
    return { code: 1, label: 'MISMATCH' }
  if (results.some(r => r.status === 'OK')) return { code: 0, label: 'OK' }
  return { code: 3, label: 'NO-TRANSFERS' } // only NOT-IN-PAGE: nothing comparable in the window
}

function selfCheck() {
  const fails = []
  const ok = (c, m) => {
    if (!c) fails.push(m)
  }
  // (a) address normalisation: friendly vs raw of the SAME address must compare equal
  const friendly = 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N'
  const raw = Address.parse(friendly).toRawString()
  ok(
    rawAddr(friendly) === rawAddr(raw),
    'friendly vs raw address should normalise equal'
  )
  ok(rawAddr('garbage') === null, 'garbage address should normalise to null')
  // (b) corroborate: exact agreement -> OK; wrong amount -> NOT-IN-PAGE; wrong memo -> MISMATCH; wrong source -> MISMATCH
  // raw-form addresses carry no checksum, so synthetic ones cannot be mistyped
  const src = '0:' + '11'.repeat(32)
  const other = '0:' + '22'.repeat(32)
  const parsed = [
    { amount: 5000000n, source: src, comment: 'INV-42', utime: 1000 },
  ]
  const oracle = {
    amount: '5000000',
    source_wallet: Address.parse(src).toRawString(),
    transaction_now: 1000,
    decoded_forward_payload: { comment: 'INV-42' },
  }
  ok(
    corroborate(oracle, parsed).status === 'OK',
    'exact agreement should be OK'
  )
  ok(
    corroborate({ ...oracle, amount: '4999999' }, parsed).status ===
      'NOT-IN-PAGE',
    'different amount should be NOT-IN-PAGE'
  )
  ok(
    corroborate(
      { ...oracle, decoded_forward_payload: { comment: 'INV-43' } },
      parsed
    ).status === 'MISMATCH',
    'different memo should be MISMATCH'
  )
  ok(
    corroborate({ ...oracle, source_wallet: other }, parsed).status ===
      'MISMATCH',
    'different source should be MISMATCH'
  )
  ok(
    corroborate({ ...oracle, transaction_now: 100000 }, parsed).status ===
      'NOT-IN-PAGE',
    'outside time window should be NOT-IN-PAGE'
  )
  // (c) classifier: the #2147 class fires when the oracle sees transfers and the parser none
  ok(
    classify(3, 0, []).code === 4,
    'oracle>0 & parsed==0 must be PARSER-BLIND (4)'
  )
  ok(classify(0, 0, []).code === 3, 'oracle==0 must be NO-TRANSFERS (3)')
  ok(
    classify(2, 2, [{ status: 'OK' }, { status: 'MISMATCH' }]).code === 1,
    'any MISMATCH must be 1'
  )
  ok(
    classify(2, 2, [{ status: 'OK' }, { status: 'NOT-IN-PAGE' }]).code === 0,
    'OK + NOT-IN-PAGE must be 0'
  )
  // (d) a lib-built internal_transfer body: the magic is where the old reader looked
  const body = beginCell()
    .storeUint(INTERNAL_TRANSFER_OP, 32)
    .storeUint(1n, 64)
    .storeCoins(7n)
    .storeAddress(Address.parse(src))
    .storeAddress(null)
    .storeCoins(1n)
    .storeBit(0)
    .storeUint(0, 32)
    .storeStringTail('x')
    .endCell()
  ok(
    body.toBoc().readUInt32BE(0) === 0xb5ee9c72,
    'a BoC body must start with the BoC magic'
  )
  console.log(
    fails.length
      ? 'SELF-CHECK FAILED\n  - ' + fails.join('\n  - ')
      : 'SELF-CHECK OK (address normalisation, 4-point corroboration, PARSER-BLIND classifier, BoC magic)'
  )
  process.exit(fails.length ? 1 : 0)
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('--self-check')) return selfCheck()
  const json = argv.includes('--json')
  const lim = Number(argv[argv.indexOf('--limit') + 1]) || 50
  let owner = argv.includes('--owner')
    ? argv[argv.indexOf('--owner') + 1]
    : null
  let jw = argv.find(
    a => !a.startsWith('--') && a !== owner && a !== String(lim)
  )
  if (!owner && !jw && process.env.TON_WALLET_ADDRESS)
    owner = process.env.TON_WALLET_ADDRESS
  if (!owner && !jw) {
    console.error(
      'usage: ton-verify <jetton-wallet> | --owner <address> | (TON_WALLET_ADDRESS)  [--limit N] [--json] [--self-check]'
    )
    process.exit(2)
  }

  let parse
  try {
    parse = await loadParser()
  } catch (e) {
    console.error(
      `UNAVAILABLE: cannot load src/core/ton/jettonBody.ts (${e.message}). Node >= 22.6 with type stripping is required.`
    )
    process.exit(2)
  }

  const out = {
    master: USDT_MASTER,
    owner: null,
    jettonWallet: null,
    oracleTransfers: 0,
    v2Txs: 0,
    parsedInternalTransfers: 0,
    results: [],
  }
  try {
    // resolve owner <-> jetton wallet (both needed: v3 transfers filter by owner, v2 page is the jetton wallet)
    const q = owner
      ? `owner_address=${owner}&jetton_address=${USDT_MASTER}`
      : `address=${jw}`
    const w = ((await getJson(`${V3}/jetton/wallets?${q}&limit=1`))
      .jetton_wallets || [])[0]
    if (!w) {
      console.error(
        `NO-TRANSFERS: no USDT jetton wallet found for ${owner || jw}`
      )
      process.exit(3)
    }
    jw = w.address
    owner = w.owner
    out.owner = owner
    out.jettonWallet = jw
    await sleep(1200)
    const oracle =
      (
        await getJson(
          `${V3}/jetton/transfers?address=${owner}&jetton_master=${USDT_MASTER}&direction=in&limit=${lim}&sort=desc`
        )
      ).jetton_transfers || []
    out.oracleTransfers = oracle.length
    await sleep(1200)
    const txs =
      (
        await getJson(
          `${V2}/getTransactions?address=${jw}&limit=${lim}&archival=false`
        )
      ).result || []
    out.v2Txs = txs.length
    const parsed = []
    for (const tx of txs) {
      const body = tx.in_msg?.msg_data?.body
      if (!body) continue
      const r = parse(body)
      if (r)
        parsed.push({
          amount: r.amount,
          comment: r.comment,
          source: tx.in_msg?.source,
          utime: tx.utime,
          hash: tx.transaction_id?.hash,
        })
    }
    out.parsedInternalTransfers = parsed.length
    // only oracle transfers inside the v2 page's time window are comparable
    const oldest = txs.length ? Math.min(...txs.map(t => t.utime || 0)) : 0
    const inWindow = oracle.filter(
      t => Number(t.transaction_now || 0) >= oldest - MAX_DT_S
    )
    for (const t of inWindow)
      out.results.push({
        oracleTx: t.transaction_hash,
        amount: String(t.amount),
        memo: t.decoded_forward_payload?.comment ?? null,
        ...corroborate(t, parsed),
      })
    const verdict = classify(inWindow.length, parsed.length, out.results)
    out.verdict = verdict.label
    if (json)
      console.log(
        JSON.stringify(
          out,
          (k, v) => (typeof v === 'bigint' ? String(v) : v),
          2
        )
      )
    else {
      console.log(
        `ton-verify -- owner ${owner}\n  jetton wallet ${jw}\n  oracle (v3, in, ${oracle.length} total, ${inWindow.length} inside the v2 window) | v2 page ${txs.length} txs | parser saw ${parsed.length} internal_transfer(s)`
      )
      for (const r of out.results)
        console.log(
          `  ${r.status.padEnd(11)} ${r.amount} micro-USDT ${r.memo !== null ? JSON.stringify(r.memo).slice(0, 40) : ''} -- ${r.detail}`
        )
      console.log(`verdict: ${verdict.label} (exit ${verdict.code})`)
    }
    process.exit(verdict.code)
  } catch (e) {
    console.error(`UNAVAILABLE: ${e.message}`)
    process.exit(2)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main()
