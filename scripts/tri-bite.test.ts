/**
 * tri bite (bin/helpers/bite.sh): do the new tests go red on the previous
 * version of the module? Runs in a throwaway copy; the working tree is never
 * touched.
 */
import { spawn, spawnSync } from 'node:child_process'
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

// Blockers found by the reviewer bee on #3462: each was a WRONG verdict (or a
// write into the real tree), not a cautious 2.
describe('tri bite -- review of #3462', () => {
  const minus = 'add() { echo $(($1 - $2)); }\n'
  const plus = 'add() { echo $(($1 + $2)); }\n'
  // Single quotes: the names below carry a double quote and a backslash.
  const check = (f: string) => `. './${f}'; [ "$(add 2 3)" = 5 ] || exit 1\n`

  function twoVersions(name: string) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tri-bite-'))
    dirs.push(dir)
    git(dir, 'init', '-q', '-b', 'main')
    fs.writeFileSync(path.join(dir, name), minus)
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'v1')
    git(dir, 'tag', 'v1')
    fs.writeFileSync(path.join(dir, name), plus)
    fs.writeFileSync(path.join(dir, 't.sh'), check(name))
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'v2')
    return dir
  }

  it('names git would quote (non-ASCII, a double quote) are swapped', () => {
    for (const name of ['модуль.sh', 'a"b.sh', 'a\\b.sh']) {
      const dir = twoVersions(name)
      const r = bite(dir, 'v1', name, '--', 'bash', 't.sh')
      expect(r.stdout, name).toMatch(/BITES/)
      expect(r.status, name).toBe(0)
    }
  })

  it('never writes through a symlink into the real tree', () => {
    const dir = twoVersions('impl.sh')
    // A link with an ABSOLUTE target into the real checkout, and a directory
    // link the same way.
    fs.symlinkSync(path.join(dir, 'impl.sh'), path.join(dir, 'link.sh'))
    fs.symlinkSync(dir, path.join(dir, 'up'))
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'links')
    const before = fs.readFileSync(path.join(dir, 'impl.sh'), 'utf8')
    bite(dir, 'v1', 'link.sh', '--', 'bash', 't.sh')
    const r = bite(dir, 'v1', 'up/impl.sh', '--', 'bash', 't.sh')
    expect(r.stdout).toMatch(/goes through the symlink up/)
    expect(r.status).toBe(2)
    expect(fs.readFileSync(path.join(dir, 'impl.sh'), 'utf8')).toBe(before)
    expect(git(dir, 'status', '--porcelain')).toBe('')
  })

  it('a symlink at the old revision comes back as a symlink', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tri-bite-'))
    dirs.push(dir)
    git(dir, 'init', '-q', '-b', 'main')
    fs.writeFileSync(path.join(dir, 'right.sh'), plus)
    fs.symlinkSync('right.sh', path.join(dir, 'add.sh'))
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'v1')
    git(dir, 'tag', 'v1')
    fs.rmSync(path.join(dir, 'add.sh'))
    fs.writeFileSync(path.join(dir, 'add.sh'), plus)
    fs.writeFileSync(path.join(dir, 't.sh'), check('add.sh'))
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'v2')
    // Right at v1 as well (through the link): the truth is "does not bite".
    const r = bite(dir, 'v1', 'add.sh', '--', 'bash', 't.sh')
    expect(r.stdout).toMatch(/\(symlink\)/)
    expect(r.status).toBe(1)
  })

  it('TERM during the old run is cannot tell, never BITES', async () => {
    const dir = twoVersions('add.sh')
    const child = spawn(
      'bash',
      [
        BITE,
        'v1',
        'add.sh',
        '--',
        'bash',
        '-c',
        'grep -q "+" add.sh || sleep 4',
      ],
      { cwd: dir }
    )
    let out = ''
    child.stdout.on('data', d => (out += d))
    setTimeout(() => child.kill('SIGTERM'), 1500)
    const code = await new Promise<number | null>(res =>
      child.on('close', c => res(c))
    )
    expect(out).not.toMatch(/BITES/)
    expect(code).toBe(2)
  }, 20000)

  it('the old run does not see what the first run wrote', () => {
    const dir = twoVersions('add.sh')
    // A test that trusts a cache it leaves in the tree.
    const cached =
      '[ -f ok.cache ] && exit 0; . ./add.sh; [ "$(add 2 3)" = 5 ] && touch ok.cache'
    const r = bite(dir, 'v1', 'add.sh', '--', 'bash', '-c', cached)
    expect(r.status).toBe(0)
  })

  it('a deleted tracked file (sorting last) does not stop the copy', () => {
    const dir = twoVersions('add.sh')
    fs.writeFileSync(path.join(dir, 'zzz.sh'), 'x\n')
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'zzz')
    fs.rmSync(path.join(dir, 'zzz.sh'))
    const r = bite(dir, 'v1', 'add.sh', '--', 'bash', 't.sh')
    expect(r.stdout).not.toMatch(/could not copy/)
    expect(r.status).toBe(0)
  })

  it('a directory holding a single file is still refused', () => {
    const dir = twoVersions('add.sh')
    fs.mkdirSync(path.join(dir, 'one'))
    fs.writeFileSync(path.join(dir, 'one/only.sh'), 'x\n')
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'one')
    const r = bite(dir, 'v1', 'one', '--', 'true')
    expect(r.stdout).toMatch(/directory/)
    expect(r.status).toBe(2)
  })

  it('a test killed by TERM on the old code is cannot tell, not a red', () => {
    const dir = twoVersions('add.sh')
    // The test process dies by TERM itself (a timeout wrapper, an OOM killer):
    // exit 143 is not a verdict.
    const r = bite(
      dir,
      'v1',
      'add.sh',
      '--',
      'bash',
      '-c',
      'grep -q "+" add.sh || kill -TERM $$'
    )
    expect(r.stdout).toMatch(/interrupted \(exit 143\)/)
    expect(r.status).toBe(2)
  })

  it('a path with ./ or ../ swaps the file, not removes it', () => {
    const dir = repo()
    for (const name of ['./add.sh', '../lib/add.sh']) {
      const r = bite(path.join(dir, 'lib'), 'v1', name, '--', 'bash', 'test.sh')
      expect(r.stdout, name).toMatch(/lib\/add\.sh <- v1/)
      expect(r.status, name).toBe(0)
    }
  })

  it('a directory at the old revision is refused by name', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tri-bite-'))
    dirs.push(dir)
    git(dir, 'init', '-q', '-b', 'main')
    fs.mkdirSync(path.join(dir, 'm'))
    fs.writeFileSync(path.join(dir, 'm/x'), 'x\n')
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'v1')
    git(dir, 'tag', 'v1')
    git(dir, 'rm', '-rq', 'm')
    fs.writeFileSync(path.join(dir, 'm'), 'now a file\n')
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'v2')
    const r = bite(dir, 'v1', 'm', '--', 'true')
    expect(r.stdout).toMatch(/is a tree at v1/)
    expect(r.status).toBe(2)
  })
})

describe('tri bite -- review 2 of #3462', () => {
  it('a path through a directory link is refused, not a false BITES', () => {
    // lib -> src, and the code is the same at v1 and now: the honest answer is
    // "does not bite", the old one was "removed (absent at v1)" and BITES.
    const dir = repo()
    git(dir, 'mv', 'lib', 'src')
    fs.symlinkSync('src', path.join(dir, 'lib'))
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'link')
    git(dir, 'tag', '-f', 'v1')
    const r = bite(
      dir,
      'v1',
      'lib/add.sh',
      '--',
      'bash',
      '-c',
      'cd src && bash test.sh'
    )
    expect(r.stdout).toMatch(/goes through the symlink lib/)
    expect(r.stdout).not.toMatch(/BITES/)
    expect(r.status).toBe(2)
  })

  it('another letter case is cannot tell on any disk, never BITES', () => {
    // On a case-blind disk lib/Add.sh opens lib/add.sh, and the swap removed
    // the real module from the copy.
    const dir = repo()
    git(dir, 'tag', '-f', 'v1')
    const r = bite(
      dir,
      'v1',
      'lib/Add.sh',
      '--',
      'bash',
      '-c',
      'cd lib && bash test.sh'
    )
    expect(r.stdout).not.toMatch(/BITES/)
    expect(r.status).toBe(2)
    if (fs.existsSync(path.join(dir, 'lib/ADD.sh'))) {
      expect(r.stdout).toMatch(/exactly that name|spelled otherwise on disk/)
    }
  })

  it('a link to a directory of the checkout gets no new directory', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tri-bite-'))
    dirs.push(dir)
    git(dir, 'init', '-q', '-b', 'main')
    fs.mkdirSync(path.join(dir, 'lib/new'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'lib/new/x.sh'), 'x\n')
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'v1')
    git(dir, 'tag', 'v1')
    git(dir, 'rm', '-rq', 'lib')
    fs.mkdirSync(path.join(dir, 'real'))
    fs.writeFileSync(path.join(dir, 'real/keep'), 'k\n')
    fs.symlinkSync(path.join(dir, 'real'), path.join(dir, 'lib'))
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'v2')
    const r = bite(dir, 'v1', 'lib/new/x.sh', '--', 'true')
    expect(r.status).toBe(2)
    expect(fs.existsSync(path.join(dir, 'real/new'))).toBe(false)
    expect(git(dir, 'status', '--porcelain')).toBe('')
  })
})

describe('tri bite -- review 3 of #3462', () => {
  it('a directory in another letter case is cannot tell, never BITES', () => {
    // On a case-blind disk git lists LIB/add.sh as untracked, so the exact
    // name check passed and the swap removed the real lib/add.sh.
    const dir = repo()
    git(dir, 'tag', '-f', 'v1')
    for (const name of ['LIB/add.sh', 'Lib/add.sh']) {
      const r = bite(
        dir,
        'v1',
        name,
        '--',
        'bash',
        '-c',
        'cd lib && bash test.sh'
      )
      expect(r.stdout).not.toMatch(/BITES/)
      expect(r.status).toBe(2)
      if (fs.existsSync(path.join(dir, 'LIB'))) {
        expect(r.stdout).toMatch(/spelled otherwise on disk/)
      }
    }
  })

  it('a file under node_modules at <rev> is not written into the tree', () => {
    // node_modules is a directory in the tree and a link in the copy: the
    // swap wrote through it into the real node_modules.
    const dir = repo()
    fs.mkdirSync(path.join(dir, 'node_modules/pkg'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'node_modules/pkg/old.sh'), 'old\n')
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'vendored')
    git(dir, 'tag', 'v0')
    git(dir, 'rm', '-rq', '--cached', 'node_modules')
    fs.rmSync(path.join(dir, 'node_modules/pkg/old.sh'))
    fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n')
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'ignored')
    const r = bite(dir, 'v0', 'node_modules/pkg/old.sh', '--', 'true')
    expect(r.status).toBe(2)
    expect(r.stdout).toMatch(/link node_modules in the copy/)
    expect(fs.existsSync(path.join(dir, 'node_modules/pkg/old.sh'))).toBe(false)
  })
})

describe('tri bite -- review 4 of #3462', () => {
  it('the old file is written as a checkout writes it (filters applied)', () => {
    // Stored with PLUS for +, smudged back on checkout: the raw blob does not
    // run, and the run said BITES against HEAD itself.
    const dir = repo()
    git(dir, 'config', 'filter.plus.smudge', 'sed s/PLUS/+/g')
    git(dir, 'config', 'filter.plus.clean', 'sed s/+/PLUS/g')
    fs.writeFileSync(
      path.join(dir, '.gitattributes'),
      'lib/add.sh filter=plus\n'
    )
    git(dir, 'add', '--renormalize', '.')
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'filtered')
    expect(git(dir, 'cat-file', 'blob', 'HEAD:lib/add.sh')).toMatch(/PLUS/)
    const r = bite(
      path.join(dir, 'lib'),
      'HEAD',
      'add.sh',
      '--',
      'bash',
      'test.sh'
    )
    expect(r.stdout).not.toMatch(/BITES/)
    expect(r.status).toBe(1)
  })

  it('a file under a workspace link of node_modules is cannot tell', () => {
    // node_modules/pkg -> ../packages/pkg resolves into the real tree from
    // the copy too, so the old file would never be loaded.
    const dir = repo()
    fs.mkdirSync(path.join(dir, 'packages/pkg'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'packages/pkg/add.sh'), 'v1\n')
    fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n')
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'pkg')
    git(dir, 'tag', 'v3')
    fs.writeFileSync(path.join(dir, 'packages/pkg/add.sh'), 'v2\n')
    git(dir, 'commit', '-qam', 'pkg 2')
    fs.mkdirSync(path.join(dir, 'node_modules'))
    fs.symlinkSync('../packages/pkg', path.join(dir, 'node_modules/pkg'))
    const r = bite(dir, 'v3', 'packages/pkg/add.sh', '--', 'true')
    expect(r.status).toBe(2)
    expect(r.stdout).toMatch(/workspace link/)
  })
})

describe('tri bite -- review 5 of #3462', () => {
  it('the old file is written by the attributes of <rev>, not of today', () => {
    // At v4 add.sh was checked out with CRLF; the attribute is gone now. A
    // checkout of v4 writes CR, today's attributes would not.
    const dir = repo()
    fs.writeFileSync(path.join(dir, '.gitattributes'), 'lib/add.sh eol=crlf\n')
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'crlf')
    git(dir, 'tag', 'v4')
    fs.rmSync(path.join(dir, '.gitattributes'))
    git(dir, 'commit', '-qam', 'no attributes')
    const r = bite(
      dir,
      'v4',
      'lib/add.sh',
      '--',
      'bash',
      '-c',
      "! grep -q $'\\r' lib/add.sh"
    )
    expect(r.stdout).toMatch(/BITES/)
    expect(r.status).toBe(0)
  })

  it('a package with its own node_modules is linked into the copies', () => {
    // sub/node_modules holds what the test of sub/ loads; without it the
    // first copy was red, and every run of such a package said cannot tell.
    // `|| exit 3`: a missing sourced file does not stop bash by itself.
    const dir = repo()
    fs.mkdirSync(path.join(dir, 'sub'))
    fs.writeFileSync(path.join(dir, 'sub/package.json'), '{}\n')
    fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n')
    fs.writeFileSync(
      path.join(dir, 'sub/test.sh'),
      '. ../lib/add.sh; . node_modules/dep/ok.sh || exit 3; [ "$(add 2 3)" = 5 ] || exit 1\n'
    )
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'sub')
    fs.mkdirSync(path.join(dir, 'sub/node_modules/dep'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'sub/node_modules/dep/ok.sh'), 'true\n')
    const r = bite(
      path.join(dir, 'sub'),
      'v1',
      '../lib/add.sh',
      '--',
      'bash',
      'test.sh'
    )
    expect(r.stdout).toMatch(/BITES/)
    expect(r.status).toBe(0)
  })

  it('a link straight to the named file is a workspace link too', () => {
    const dir = repo()
    fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n')
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'ignore')
    fs.mkdirSync(path.join(dir, 'node_modules'))
    fs.symlinkSync('../lib/add.sh', path.join(dir, 'node_modules/add.sh'))
    const r = bite(dir, 'v1', 'lib/add.sh', '--', 'true')
    expect(r.status).toBe(2)
    expect(r.stdout).toMatch(/workspace link/)
  })

  it('green on <rev> with a link back into the tree is cannot tell', () => {
    // node_modules/pkg -> ../packages/pkg reaches the real tree; a file
    // there may load the named one by a relative path.
    const dir = repo()
    fs.mkdirSync(path.join(dir, 'packages/pkg'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'packages/pkg/index.sh'), 'true\n')
    fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n')
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'pkg')
    fs.mkdirSync(path.join(dir, 'node_modules'))
    fs.symlinkSync('../packages/pkg', path.join(dir, 'node_modules/pkg'))
    const r = bite(dir, 'v1', 'lib/add.sh', '--', 'true')
    expect(r.status).toBe(2)
    expect(r.stdout).toMatch(
      /links back into the tree \(node_modules\/pkg -> packages\/pkg\)/
    )
    expect(r.stdout).not.toMatch(/DOES NOT BITE/)
  })
  it('a link from one node_modules into another is not a link into the tree', () => {
    // pnpm-style: sub/node_modules/dep -> ../../node_modules/dep. Installed
    // code, not the tree's own; a green on <rev> stays "does not bite".
    const dir = repo()
    fs.mkdirSync(path.join(dir, 'sub'))
    fs.writeFileSync(path.join(dir, 'sub/package.json'), '{}\n')
    fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n')
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'sub')
    fs.mkdirSync(path.join(dir, 'node_modules/dep'), { recursive: true })
    fs.mkdirSync(path.join(dir, 'sub/node_modules'))
    fs.symlinkSync(
      '../../node_modules/dep',
      path.join(dir, 'sub/node_modules/dep')
    )
    const r = bite(dir, 'v1', 'lib/add.sh', '--', 'true')
    expect(r.stdout).toMatch(/DOES NOT BITE/)
    expect(r.status).toBe(1)
  })
})
