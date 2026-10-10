/**
 * A second process for tri-wallet.pg.test.ts: issues N challenges for one
 * person in parallel against the same Postgres and prints how many it got.
 * The cap of five must hold across processes, not only inside one.
 */
import pg from 'pg'
import { issueChallenge } from '../src/tri-wallet'

async function main() {
  const person = process.argv[2]
  const n = Number(process.argv[3])
  const pool = new pg.Pool({
    connectionString: process.env.TRI_TEST_DATABASE_URL,
    max: n,
  })
  // Both processes start together on a signal file, so they truly overlap.
  const start = Number(process.argv[4])
  while (Date.now() < start) await new Promise(r => setTimeout(r, 5))
  const got = await Promise.all(
    Array.from({ length: n }, () => issueChallenge(pool, person, Date.now()))
  )
  process.stdout.write(JSON.stringify({ issued: got.filter(Boolean).length }))
  await pool.end()
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
