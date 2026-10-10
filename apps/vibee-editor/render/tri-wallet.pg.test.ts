import { spawn } from 'node:child_process'
import { join } from 'node:path'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  WalletRefusal,
  bindWithNonce,
  ensureTriWalletTables,
  issueChallenge,
  unbindWallet,
  type BindTarget,
  type TxPool,
} from './src/tri-wallet'

/*
 * THE WALLET'S WRITES ON A REAL POSTGRES (spec tri-wallet-chains v3).
 *
 * The fake pool in tri-wallet.test.ts has one connection and no concurrency,
 * so it cannot show a race or a rollback. These tests run against a real
 * server: TRI_TEST_DATABASE_URL (any scratch database; every table here is
 * truncated). Without it they are skipped, and say so. Run locally on
 * 2026-10-09 against embedded-postgres 18.4: before the fix, 20 parallel
 * issueChallenge calls left 7 open nonces against the cap of 5.
 */
const URL = process.env.TRI_TEST_DATABASE_URL
const NOW = () => Date.now()

const tonTarget = (n: number): BindTarget => ({
  chain: 'ton',
  network: '-3',
  address: `0:${n.toString(16).padStart(64, '0')}`,
  publicKey: 'ab'.repeat(32),
})

/** The real pool, except the first statement matching `fail` throws. */
function failing(pool: pg.Pool, fail: RegExp): TxPool {
  return {
    query: (t, p) => pool.query(t, p as unknown[]),
    async connect() {
      const c = await pool.connect()
      return {
        query: (t: string, p?: unknown[]) =>
          fail.test(t.replace(/\s+/g, ' '))
            ? Promise.reject(new Error(`injected failure at ${fail}`))
            : c.query(t, p),
        release: (e?: Error) => c.release(e),
      }
    },
  }
}

describe.skipIf(!URL)('tri wallet writes on a real Postgres', () => {
  let pool: pg.Pool

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: URL, max: 30 })
    await ensureTriWalletTables(pool)
  })
  afterAll(async () => {
    await pool?.end()
  })
  beforeEach(async () => {
    await pool.query(
      'TRUNCATE tri_wallet_challenges, tri_wallets, tri_wallet_events'
    )
  })

  const openNonces = async (who: string) =>
    (
      await pool.query(
        `SELECT count(*)::int n FROM tri_wallet_challenges
          WHERE telegram_id = $1 AND used_at IS NULL`,
        [who]
      )
    ).rows[0].n as number
  const walletOf = async (who: string) =>
    (
      await pool.query(
        `SELECT address FROM tri_wallets WHERE telegram_id = $1 AND chain = 'ton'`,
        [who]
      )
    ).rows.map(r => r.address)
  const events = async (who: string) =>
    (
      await pool.query(
        `SELECT action, address FROM tri_wallet_events
          WHERE telegram_id = $1 ORDER BY id`,
        [who]
      )
    ).rows
  const nonceUsed = async (nonce: string) =>
    (
      await pool.query(
        `SELECT used_at FROM tri_wallet_challenges WHERE payload = $1`,
        [nonce]
      )
    ).rows[0]?.used_at != null

  it('issues at most five nonces to one person under twenty parallel requests', async () => {
    const got = await Promise.all(
      Array.from({ length: 20 }, () => issueChallenge(pool, 'p1', NOW()))
    )
    expect(got.filter(Boolean)).toHaveLength(5)
    expect(await openNonces('p1')).toBe(5)
    // Another person is not held up by p1's lock.
    expect(await issueChallenge(pool, 'p2', NOW())).not.toBeNull()
  })

  it('holds the cap of five across two processes', async () => {
    const start = Date.now() + 1500
    const run = () =>
      new Promise<number>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [
            '--import',
            'tsx',
            join(__dirname, 'test-support', 'tri-wallet-issue-worker.ts'),
            'p-two',
            '10',
            String(start),
          ],
          {
            cwd: __dirname,
            env: { ...process.env, TRI_TEST_DATABASE_URL: URL },
          }
        )
        let out = ''
        let err = ''
        child.stdout.on('data', d => (out += d))
        child.stderr.on('data', d => (err += d))
        child.on('exit', code =>
          code === 0
            ? resolve(JSON.parse(out).issued)
            : reject(new Error(`worker exited ${code}: ${err}`))
        )
      })
    const [a, b] = await Promise.all([run(), run()])
    expect(a + b).toBe(5)
    expect(await openNonces('p-two')).toBe(5)
  }, 60_000)

  it('rolls back every write when any one fails, and a retry binds once', async () => {
    const first = (await issueChallenge(pool, 'p3', NOW()))!.payload
    await bindWithNonce(pool, 'p3', first, NOW(), tonTarget(1))
    const nonce = (await issueChallenge(pool, 'p3', NOW()))!.payload
    for (const step of [
      /^UPDATE tri_wallet_challenges SET used_at/,
      /^INSERT INTO tri_wallets /,
      /^INSERT INTO tri_wallet_events/,
      /^COMMIT$/,
    ]) {
      await expect(
        bindWithNonce(failing(pool, step), 'p3', nonce, NOW(), tonTarget(2))
      ).rejects.toThrow(/injected/)
      // Nothing of the failed bind is left: old address, open nonce, one event.
      expect(await walletOf('p3')).toEqual([tonTarget(1).address])
      expect(await nonceUsed(nonce)).toBe(false)
      expect(await events('p3')).toEqual([
        { action: 'bind', address: tonTarget(1).address },
      ])
    }
    // The same nonce now binds, exactly once.
    await bindWithNonce(pool, 'p3', nonce, NOW(), tonTarget(2))
    expect(await walletOf('p3')).toEqual([tonTarget(2).address])
    expect(await nonceUsed(nonce)).toBe(true)
    expect((await events('p3')).map(e => e.address)).toEqual([
      tonTarget(1).address,
      tonTarget(2).address,
    ])
    await expect(
      bindWithNonce(pool, 'p3', nonce, NOW(), tonTarget(3))
    ).rejects.toMatchObject({ code: 'payload_unknown' })
  })

  it('rolls back an unbinding whose event fails, and a retry removes it once', async () => {
    const n = (await issueChallenge(pool, 'p4', NOW()))!.payload
    await bindWithNonce(pool, 'p4', n, NOW(), tonTarget(4))
    await expect(
      unbindWallet(
        failing(pool, /^INSERT INTO tri_wallet_events/),
        'p4',
        'ton',
        '-3'
      )
    ).rejects.toThrow(/injected/)
    expect(await walletOf('p4')).toEqual([tonTarget(4).address])
    expect((await events('p4')).map(e => e.action)).toEqual(['bind'])
    expect(await unbindWallet(pool, 'p4', 'ton', '-3')).toBe(true)
    expect(await walletOf('p4')).toEqual([])
    expect((await events('p4')).map(e => e.action)).toEqual(['bind', 'unbind'])
  })

  it('confirms a proposal in one transaction: a failure leaves the proposal open', async () => {
    const n = (await issueChallenge(pool, 'p5', NOW()))!.payload
    await pool.query(
      `UPDATE tri_wallet_challenges
          SET proposed_chain = 'evm', proposed_network = 'eip155',
              proposed_address = $2, proposed_key = 'k', proposed_at = now()
        WHERE payload = $1`,
      [n, '0x2c7536E3605D9C16a7a3D7b1898e529396a65c23']
    )
    await expect(
      bindWithNonce(
        failing(pool, /^INSERT INTO tri_wallets /),
        'p5',
        n,
        NOW(),
        null
      )
    ).rejects.toThrow(/injected/)
    expect(await nonceUsed(n)).toBe(false)
    expect(await events('p5')).toEqual([])
    const w = await bindWithNonce(pool, 'p5', n, NOW(), null)
    expect(w).toMatchObject({ chain: 'evm', network: 'eip155' })
    // Not somebody else's yes, even with the right nonce.
    await expect(
      bindWithNonce(pool, 'p6', n, NOW(), null)
    ).rejects.toMatchObject({ code: 'proposal_unknown' })
  })

  it('a refused bind spends nothing, and two people racing for one address leave one owner', async () => {
    const mine = (await issueChallenge(pool, 'owner', NOW()))!.payload
    await bindWithNonce(pool, 'owner', mine, NOW(), tonTarget(7))
    const n = (await issueChallenge(pool, 'thief', NOW()))!.payload
    await expect(
      bindWithNonce(pool, 'thief', n, NOW(), tonTarget(7))
    ).rejects.toMatchObject({ code: 'wallet_bound_elsewhere', status: 409 })
    expect(await nonceUsed(n)).toBe(false)

    const a = (await issueChallenge(pool, 'ra', NOW()))!.payload
    const b = (await issueChallenge(pool, 'rb', NOW()))!.payload
    const results = await Promise.allSettled([
      bindWithNonce(pool, 'ra', a, NOW(), tonTarget(8)),
      bindWithNonce(pool, 'rb', b, NOW(), tonTarget(8)),
    ])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const lost = results.find(
      r => r.status === 'rejected'
    ) as PromiseRejectedResult
    expect(lost.reason).toBeInstanceOf(WalletRefusal)
    expect(lost.reason.code).toBe('wallet_bound_elsewhere')
    // The loser's nonce is still open; the owner has exactly one bind event.
    expect([await nonceUsed(a), await nonceUsed(b)].sort()).toEqual([
      false,
      true,
    ])
    const owners = await pool.query(
      `SELECT telegram_id FROM tri_wallets WHERE address = $1`,
      [tonTarget(8).address]
    )
    expect(owners.rows).toHaveLength(1)
  })
})

describe('the real-Postgres tests', () => {
  it.skipIf(!!URL)(
    'are skipped without TRI_TEST_DATABASE_URL, and say so',
    () => {
      expect(URL).toBeUndefined()
    }
  )
})
