/**
 * tri bite (bin/helpers/bite.sh): do the new tests go red on the previous
 * version of the module? Runs in a throwaway copy; the working tree is never
 * touched.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BITE = path.join(ROOT, 'bin/helpers/bite.sh')

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

function git(cwd: string, ...args: string[]) {
  const r = spawnSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
    { cwd, encoding: 'utf8' }
  )
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout.trim()
}

// A repo whose module was wrong at v1 and right at HEAD. The test asserts the
// right answer, so it is green now and red on v1.
function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tri-bite-'))
  dirs.push(dir)
  git(dir, 'init', '-q', '-b', 'main')
  fs.mkdirSync(path.join(dir, 'lib'))
  fs.writeFileSync(
    path.join(dir, 'lib/add.sh'),
    'add() { echo $(($1 - $2)); }\n'
  )
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'v1')
  git(dir, 'tag', 'v1')
  fs.writeFileSync(
    path.join(dir, 'lib/add.sh'),
    'add() { echo $(($1 + $2)); }\n'
  )
  fs.writeFileSync(
    path.join(dir, 'lib/test.sh'),
    '. ./add.sh; [ "$(add 2 3)" = 5 ] && echo pass || { echo fail; exit 1; }\n'
  )
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'v2')
  return dir
}

function bite(cwd: string, ...args: string[]) {
  return spawnSync('bash', [BITE, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 30000,
  })
}

describe('tri bite', () => {
  it('bites: green now, red with the module at the old revision (0)', () => {
    const dir = repo()
    const r = bite(dir, 'v1', 'lib/add.sh', '--', 'bash', 'lib/test.sh')
    // The command runs at the repo root here, so the test's ./add.sh misses;
    // run from lib/ instead, where it belongs.
    expect(r.status).toBe(2)
    const s = bite(
      path.join(dir, 'lib'),
      'v1',
      'add.sh',
      '--',
      'bash',
      'test.sh'
    )
    expect(s.stdout).toMatch(/BITES: red on v1/)
    expect(s.status).toBe(0)
  })

  it('does not bite: green on the old revision too (1)', () => {
    const dir = repo()
    const r = bite(
      path.join(dir, 'lib'),
      'HEAD',
      'add.sh',
      '--',
      'bash',
      'test.sh'
    )
    expect(r.stdout).toMatch(/DOES NOT BITE/)
    expect(r.status).toBe(1)
  })

  it('red on the current tree is cannot tell, not a bite (2)', () => {
    const dir = repo()
    const r = bite(path.join(dir, 'lib'), 'v1', 'add.sh', '--', 'false')
    expect(r.stdout).toMatch(/red already on the current tree/)
    expect(r.status).toBe(2)
  })

  it('uses the uncommitted test and leaves the working tree as it was', () => {
    const dir = repo()
    // A new test not committed yet, and an edit to a tracked file.
    fs.writeFileSync(
      path.join(dir, 'lib/new.sh'),
      '. ./add.sh; [ "$(add 1 1)" = 2 ] || exit 1\n'
    )
    fs.appendFileSync(path.join(dir, 'lib/add.sh'), '# edited\n')
    const before = git(dir, 'status', '--porcelain')
    const sum = fs.readFileSync(path.join(dir, 'lib/add.sh'), 'utf8')
    const r = bite(
      path.join(dir, 'lib'),
      'v1',
      'add.sh',
      '--',
      'bash',
      'new.sh'
    )
    expect(r.stdout).toMatch(/\+ uncommitted/)
    expect(r.status).toBe(0)
    expect(git(dir, 'status', '--porcelain')).toBe(before)
    expect(fs.readFileSync(path.join(dir, 'lib/add.sh'), 'utf8')).toBe(sum)
  })

  it('a file absent at the old revision is removed from the copy', () => {
    const dir = repo()
    const r = bite(
      path.join(dir, 'lib'),
      'v1',
      'test.sh',
      '--',
      'test',
      '-f',
      'test.sh'
    )
    expect(r.stdout).toMatch(/lib\/test.sh removed \(absent at v1\)/)
    expect(r.status).toBe(0)
  })

  it('refuses bad arguments, an unknown revision and a directory (2)', () => {
    const dir = repo()
    expect(bite(dir, 'v1', 'lib/add.sh').status).toBe(2)
    expect(bite(dir, 'nope', 'lib/add.sh', '--', 'true').stdout).toMatch(
      /unknown revision/
    )
    expect(bite(dir, 'v1', 'lib', '--', 'true').stdout).toMatch(/directory/)
    expect(bite(dir, 'v1', 'missing.sh', '--', 'true').status).toBe(2)
  })
})
