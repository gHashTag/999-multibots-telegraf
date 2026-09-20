/**
 * THE BRAKE, AGAINST A REAL DATABASE.
 *
 * Three of its guarantees live inside one SQL statement -- a link is spent
 * once, a wrong token decides nothing, the deny token denies -- and a unit
 * test cannot see them: the fake pool re-implements the semantics in
 * TypeScript, so mutating the SQL leaves it untouched. Measured: three
 * mutations that broke the statement outright survived the whole suite.
 *
 * Moving the logic out of SQL would not fix that, it would break something
 * else: read-check-write is a race, and this project has that scar already
 * (CLAUDE.md, balance deduction). So the statement stays atomic and is proven
 * here, against Postgres.
 *
 *   npx tsx scripts/browser-approvals-db-check.ts
 */
import { execFile } from 'node:child_process'
import { Client } from 'pg'
import {
  ensureApprovals,
  askFor,
  decide,
  readApproval,
  newApprovalToken,
  resetApprovalsCache,
  APPROVAL_TTL_MS,
} from '../src/browser/approvals'

const NAME = 'approvals-db-check'
const PASS = 'check-only-not-a-secret' // secret-guard-ok: throwaway container
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failures++
  console.log(
    `${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`
  )
}

const docker = (args: string[]): Promise<string> =>
  new Promise((resolve, reject) =>
    execFile('docker', args, { timeout: 120_000 }, (e, out) =>
      e ? reject(e) : resolve(String(out))
    )
  )

async function main() {
  await docker(['rm', '-f', NAME]).catch(() => undefined)
  await docker([
    'run',
    '-d',
    '--name',
    NAME,
    '-e',
    `POSTGRES_PASSWORD=${PASS}`,
    '-p',
    '127.0.0.1:0:5432',
    'postgres:16-alpine',
  ])

  let client: Client | undefined
  try {
    const mapped = await docker(['port', NAME, '5432'])
    const port = Number(mapped.split('\n')[0].trim().split(':').pop())
    for (let i = 0; i < 60; i++) {
      client = new Client({
        host: '127.0.0.1',
        port,
        user: 'postgres',
        password: PASS,
        database: 'postgres',
      })
      try {
        await client.connect()
        break
      } catch {
        await client.end().catch(() => undefined)
        client = undefined
        await sleep(1000)
      }
    }
    if (!client) throw new Error('postgres never accepted a connection')

    const pool = {
      query: (sql: string, params: unknown[] = []) =>
        client!.query(sql, params as never[]).then(r => ({ rows: r.rows })),
    }
    resetApprovalsCache()
    await ensureApprovals(pool)

    let n = 0
    const ask = (what = 'send the invoice') =>
      askFor(pool, {
        telegramId: 'tg-900000001',
        what,
        newId: newApprovalToken,
        newToken: () => `tok-${++n}-${newApprovalToken().slice(0, 8)}`,
      })

    const a = await ask()
    check(
      'the allow token allows',
      (await decide(pool, a.id, a.allowToken)) === 'allowed'
    )

    const b = await ask()
    check(
      'the deny token DENIES',
      (await decide(pool, b.id, b.denyToken)) === 'denied'
    )

    const c = await ask()
    await decide(pool, c.id, c.allowToken)
    const second = await decide(pool, c.id, c.denyToken)
    check('a link is spent ONCE', second === null, `second press: ${second}`)
    check(
      'and the first answer stands',
      (await readApproval(pool, c.id))?.state === 'allowed'
    )

    const d = await ask()
    check(
      'a wrong token decides nothing',
      (await decide(pool, d.id, 'nope')) === null
    )
    check(
      'and leaves the question open',
      (await readApproval(pool, d.id))?.state === 'pending'
    )

    check(
      'an unknown id is the same answer',
      (await decide(pool, 'nope', 'nope')) === null
    )

    const e = await ask()
    await pool.query(
      `UPDATE browser_approvals SET created_at = now() - interval '1 hour' WHERE id = $1`,
      [e.id]
    )
    const aged = await readApproval(pool, e.id)
    check(
      'silence EXPIRES, it never becomes permission',
      aged?.state === 'expired',
      String(aged?.state)
    )
    check(
      'AN OLD LINK CANNOT STILL ALLOW',
      (await decide(pool, e.id, e.allowToken)) === null,
      'this is the hole the database check was written for'
    )
    check(
      'and the question stays expired',
      (await readApproval(pool, e.id))?.state === 'expired'
    )
    void APPROVAL_TTL_MS
  } finally {
    await client?.end().catch(() => undefined)
    await docker(['rm', '-f', NAME]).catch(() => undefined)
  }

  console.log(failures ? `\n${failures} FAILED` : '\nall checks passed')
  process.exit(failures ? 1 : 0)
}

main().catch(e => {
  console.error('FAILED', e)
  process.exit(1)
})
