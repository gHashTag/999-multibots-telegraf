import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

/*
 * THE EXIT CODE IS THE PRODUCT OF A GATE, AND THIS ONE'S RED PATH HAD NEVER RUN.
 *
 * Five invariants, every violation historical: every execution against
 * production has taken the green branch. A gate proven only on green is a gate
 * nobody has seen work -- the same shape as a test that has never failed.
 *
 * So the script reads its rows from a file when LEDGER_ROWS_FILE is set, and
 * these four cases run the real script as a process and read the real exit
 * code. Three distinct outcomes, because two of them are not the same thing:
 *
 *   1  a violation inside the window
 *   0  nothing broken, or nothing asked (no --gate)
 *   2  could not check at all -- which is NOT a clean ledger
 */
const SCRIPT = path.join(process.cwd(), 'scripts/ledger-integrity.cjs')
let dir: string

const row = {
  id: 1,
  type: 'MONEY_INCOME',
  status: 'COMPLETED',
  stars: 5,
  inv_id: 'A',
  operation_id: 'o',
  payment_date: '2026-09-01',
  telegram_id: '1',
  description: 'Payment via Telegram',
}

const write = (name: string, rows: unknown[]) => {
  const p = path.join(dir, name)
  fs.writeFileSync(p, JSON.stringify(rows))
  return p
}

const run = (rowsFile: string | null, args: string[] = []) =>
  spawnSync(process.execPath, [SCRIPT, ...args], {
    env: {
      ...process.env,
      SUPABASE_URL: 'x',
      SUPABASE_SERVICE_KEY: 'y',
      ...(rowsFile ? { LEDGER_ROWS_FILE: rowsFile } : {}),
    },
    encoding: 'utf8',
  })

beforeAll(() => {
  // A unique directory per run: a fixed name under the temp dir is shared
  // between sessions, and that has already cost this project a commit message
  // from another repository.
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-gate-'))
})
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('the ledger gate goes red on a violation, and only then', () => {
  it('exits 1 when a row inside the window breaks an invariant', () => {
    const f = write('planted.json', [
      { ...row, type: 'MONEY_OUTCOME', stars: -5, description: 'x' },
    ])
    expect(run(f, ['--gate']).status).toBe(1)
  })

  it('exits 0 when the same violation is older than the window', () => {
    const f = write('old.json', [
      {
        ...row,
        type: 'MONEY_OUTCOME',
        stars: -5,
        description: 'x',
        payment_date: '2025-01-01',
      },
    ])
    const r = run(f, ['--gate'])
    expect(r.status).toBe(0)
    // and it still says the scar is there, rather than hiding it
    expect(r.stdout).toContain('healed')
  })

  it('exits 0 on clean rows', () => {
    expect(run(write('clean.json', [row]), ['--gate']).status).toBe(0)
  })

  it('reports without failing when --gate was not asked for', () => {
    const f = write('planted2.json', [
      { ...row, type: 'MONEY_OUTCOME', stars: -5, description: 'x' },
    ])
    expect(run(f).status).toBe(0)
  })

  it('exits 2 when it could not check, which is not a clean ledger', () => {
    const r = spawnSync(process.execPath, [SCRIPT, '--gate'], {
      env: {
        ...process.env,
        SUPABASE_URL: '',
        SUPABASE_SERVICE_KEY: '',
        SUPABASE_SERVICE_ROLE_KEY: '',
      },
      encoding: 'utf8',
    })
    expect(r.status).toBe(2)
  })

  it('says out loud when the rows did not come from the ledger', () => {
    const r = run(write('clean2.json', [row]))
    expect(r.stdout).toContain('NOT FROM THE LEDGER')
  })
})
