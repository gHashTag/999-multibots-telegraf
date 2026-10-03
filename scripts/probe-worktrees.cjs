#!/usr/bin/env node
/**
 * WHICH WORKTREES ARE FINISHED, AND WHICH STILL HOLD WORK.
 *
 * Worktrees accumulate: one per loop iteration, and nothing removes them.
 * Measured before the first sweep: 25 trees on 25 branches. That is not merely
 * untidy -- a stale tree is an environment where a stale answer can be
 * measured, and iteration 156 lost a whole cycle to exactly that: a "regression
 * on clean main" that existed only inside one old tree.
 *
 * THE QUESTION MUST MATCH THE MERGE STYLE. This repository SQUASH-merges, and a
 * squash merge creates a NEW commit -- the branch tip never becomes an ancestor
 * of main. So `git merge-base --is-ancestor <branch> main` answers "not merged"
 * for every finished branch. The first sweep asked exactly that and reported 21
 * of 22 finished branches as unmerged; asking GitHub for merged PRs flipped the
 * answer completely. Ancestry is the right question for merge commits and the
 * wrong one here.
 *
 * AND THE ANSWER MUST BE BY COMMIT, NOT BY NAME. Until 03.10.2026 a tree was
 * "finished" when its branch NAME matched a merged PR. A branch that got new
 * commits after its PR merged kept the name and lost the work's only marker;
 * a detached tree had no name at all and was "in progress" forever (13 of 65
 * on 03.10, mostly bees' review copies). Now a tree is finished when its HEAD
 * IS a merged PR's head commit, or is contained in one, or is already in
 * origin/main. Same rule `tri` uses for branch cleanup (tip == headRefOid).
 *
 * WHAT --apply REMOVES, AND WHAT IT NEVER TOUCHES. Without flags nothing is
 * deleted. With --apply only trees that are finished AND:
 *   - clean (no uncommitted or untracked file) -- re-checked right before;
 *   - not locked (`git worktree lock` is the owner saying "keep");
 *   - no process has its working directory inside (a live session);
 *   - not touched in the last hour (a session between two commands);
 *   - no other worktree nested inside (removing the parent deletes the child);
 *   - every IGNORED file is one we can regenerate (node_modules, caches,
 *     dist, logs), and none of those folders hides a secret-looking file
 *     (.env*, *.pem, *.key, *.p8, *.p12). An ignored `.env` is someone's
 *     local file, not ours -- including `logs/.env`: plain `--ignored`
 *     collapses a folder whose files are all ignored into one `logs/` line,
 *     and the bee reviewing #3474 removed a `logs/.env` that way. Ignored
 *     files are listed with `--ignored=matching`, and empty ignored folders
 *     are harmless.
 * On 03.10 the old proposal list carried `git worktree remove --force` for a
 * tree holding an ignored .env AND a nested worktree; --force deletes both
 * silently. Removal runs WITHOUT --force, so git's own clean check covers the
 * gap after our re-check. Branches stay. A finished detached tree's commits
 * are already upstream (as the same commit or the same patch).
 */

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const GH = process.env.TRI_GH || 'gh'
const RECENT_MIN = Number(process.env.TRI_WT_RECENT_MIN || 60)

const git = (args, cwd = ROOT) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' })

const ok = (args, cwd = ROOT) => {
  try {
    git(args, cwd)
    return true
  } catch {
    return false
  }
}

/** Files nobody can rebuild, wherever they sit. */
const SECRET = [/^\.env/, /\.(pem|key|p8|p12)$/]

/** Ignored entries we can rebuild, matched per path component. */
const REGENERABLE = [
  /^node_modules$/,
  /^\.vite-cache$/,
  /^\.vite$/,
  /^dist$/,
  /^build$/,
  /^logs$/,
  /^coverage$/,
  /^__pycache__$/,
  /^\.turbo$/,
  /^\.DS_Store$/,
  /\.xcodeproj$/,
  /\.log$/,
]

/**
 * Rebuildable by name: the entry itself or any folder above it matches
 * (`--ignored=matching` lists files deep inside build output). A secret-
 * looking name is never rebuildable, wherever it sits -- except inside
 * node_modules, which npm rewrites whole.
 */
const regenerable = entry => {
  const parts = entry.replace(/\/+$/, '').split('/')
  if (parts.includes('node_modules')) return true
  if (SECRET.some(re => re.test(parts[parts.length - 1]))) return false
  return parts.some(c => REGENERABLE.some(re => re.test(c)))
}

/**
 * First secret-looking file under an ignored folder we would call
 * regenerable, or null. Symlinks are not followed (a worktree's node_modules
 * is often a link into the main checkout); the walk is bounded, and a folder
 * too big to walk counts as holding one.
 */
function hiddenSecret(dir, budget = { left: 20000 }) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return null
  }
  for (const e of entries) {
    if (--budget.left < 0) return dir + ' (too big to check)'
    const p = path.join(dir, e.name)
    if (e.isSymbolicLink()) continue
    if (e.isDirectory()) {
      if (e.name === 'node_modules') continue
      const hit = hiddenSecret(p, budget)
      if (hit) return hit
    } else if (SECRET.some(re => re.test(e.name))) return p
  }
  return null
}

/** Why an ignored entry must stay, or null when it can go with the tree. */
function ignoredRisk(treeDir, entry) {
  const full = path.join(treeDir, entry)
  let st
  try {
    st = fs.lstatSync(full)
  } catch {
    return null
  }
  if (st.isDirectory() && !st.isSymbolicLink()) {
    let empty = false
    try {
      empty = fs.readdirSync(full).length === 0
    } catch {
      /* unreadable: judged by name below */
    }
    if (empty) return null
  }
  if (!regenerable(entry)) return entry
  if (entry.split('/').includes('node_modules')) return null
  if (st.isDirectory() && !st.isSymbolicLink()) {
    const hit = hiddenSecret(full)
    if (hit) return path.relative(treeDir, hit)
  }
  return null
}

/** Merged PRs from GitHub: head commit -> PR number, and branch -> numbers. */
function mergedPrs() {
  try {
    const out = execFileSync(
      GH,
      [
        'pr',
        'list',
        '--state',
        'merged',
        '--limit',
        '300',
        '--json',
        'number,headRefName,headRefOid',
      ],
      { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }
    )
    const byOid = new Map()
    const byName = new Map()
    for (const pr of JSON.parse(out)) {
      byOid.set(pr.headRefOid, pr.number)
      if (!byName.has(pr.headRefName)) byName.set(pr.headRefName, [])
      byName.get(pr.headRefName).push({ n: pr.number, oid: pr.headRefOid })
    }
    return { byOid, byName }
  } catch {
    return null
  }
}

/** Working directories of every running process; null when lsof fails. */
function processDirs() {
  try {
    const out = execFileSync('lsof', ['-d', 'cwd', '-Fn'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    })
    return out
      .split('\n')
      .filter(l => l.startsWith('n/'))
      .map(l => l.slice(1))
  } catch (e) {
    // lsof exits 1 when some processes are unreadable but still prints the
    // rest; anything else (a killed lsof, an overflowed buffer) is partial
    if (e.status === 1 && e.stdout)
      return String(e.stdout)
        .split('\n')
        .filter(l => l.startsWith('n/'))
        .map(l => l.slice(1))
    return null
  }
}

const inside = (child, parent) =>
  child === parent ||
  child.startsWith(parent.endsWith('/') ? parent : parent + '/')

function listTrees() {
  const out = []
  let cur = null
  for (const line of git(['worktree', 'list', '--porcelain']).split('\n')) {
    if (line.startsWith('worktree '))
      cur = { dir: line.slice(9), branch: null, head: null, locked: false }
    else if (!cur) continue
    else if (line.startsWith('HEAD ')) cur.head = line.slice(5)
    else if (line.startsWith('branch '))
      cur.branch = line.slice(7).replace('refs/heads/', '')
    else if (line === 'locked' || line.startsWith('locked ')) cur.locked = true
    else if (line === '') {
      out.push(cur)
      cur = null
    }
  }
  if (cur) out.push(cur)
  return out
}

function minutesSinceTouched(dir) {
  try {
    const gd = git(['rev-parse', '--absolute-git-dir'], dir).trim()
    let newest = 0
    for (const f of ['index', 'HEAD', 'logs/HEAD']) {
      try {
        newest = Math.max(newest, fs.statSync(path.join(gd, f)).mtimeMs)
      } catch {
        /* a fresh tree may lack logs */
      }
    }
    return newest ? (Date.now() - newest) / 60000 : Infinity
  } catch {
    return Infinity
  }
}

/** Facts about every worktree except the main checkout (or just `only`). */
function gather(procs, only = null) {
  const all = listTrees()
  const mainDir = all.length ? all[0].dir : ROOT
  return all
    .filter(w => w.dir !== mainDir && (!only || w.dir === only))
    .map(w => {
      let dirty = -1
      let ignored = []
      try {
        // --no-optional-locks: never take index.lock in someone's live tree;
        // -unormal: a showUntrackedFiles=no config must not hide work;
        // --ignored=matching: list `logs/.env`, not just `logs/`;
        // -z: raw paths (porcelain quotes a name with a space, and a quoted
        // name would not be found on disk and would pass as harmless)
        const st = git(
          [
            '--no-optional-locks',
            'status',
            '--porcelain',
            '-z',
            '--ignored=matching',
            '-unormal',
          ],
          w.dir
        )
          .split('\0')
          .filter(Boolean)
        dirty = st.filter(l => !l.startsWith('!! ')).length
        ignored = st.filter(l => l.startsWith('!! ')).map(l => l.slice(3))
      } catch {
        /* the directory may be gone; `git worktree prune` reports it */
      }
      let ahead = -1
      if (w.head)
        try {
          ahead = Number(
            git(['rev-list', '--count', `origin/main..${w.head}`]).trim()
          )
        } catch {
          /* commit unknown here */
        }
      const nested = all
        .filter(o => o.dir !== w.dir && inside(o.dir, w.dir))
        .map(o => o.dir)
      return {
        ...w,
        dirty,
        ahead,
        nested,
        unsafeIgnored: ignored.map(e => ignoredRisk(w.dir, e)).filter(Boolean),
        busy: procs ? procs.filter(p => inside(p, w.dir)).length : null,
        touchedMin: minutesSinceTouched(w.dir),
        containedIn: oid => ok(['merge-base', '--is-ancestor', w.head, oid]),
        // every commit beyond main already landed as the same patch (a
        // rebased copy: the PR head moved on, this tree kept the old SHA)
        patchesUpstream: () => {
          try {
            const lines = git(['cherry', 'origin/main', w.head])
              .split('\n')
              .filter(Boolean)
            return lines.length > 0 && lines.every(l => l.startsWith('- '))
          } catch {
            return false
          }
        },
      }
    })
}

/**
 * finished  HEAD is a merged PR's head, inside one, already in origin/main,
 *           or every commit beyond main is already there as the same patch
 *           -- and nothing uncommitted
 * holds     uncommitted work, or locked -- never proposed for removal
 * active    anything else: commits nobody merged yet
 */
function classify(trees, merged) {
  return trees.map(w => {
    if (w.dirty > 0)
      return { ...w, state: 'holds', why: `несохранённых файлов: ${w.dirty}` }
    if (w.dirty < 0)
      return { ...w, state: 'active', why: 'не прочитать (каталога нет?)' }
    if (w.locked)
      return { ...w, state: 'holds', why: 'заперто (git worktree lock)' }
    if (w.head && merged.byOid.has(w.head))
      return {
        ...w,
        state: 'finished',
        why: `= голова влитого PR #${merged.byOid.get(w.head)}`,
      }
    if (w.ahead === 0)
      return { ...w, state: 'finished', why: 'уже в origin/main' }
    const sameName = (w.branch && merged.byName.get(w.branch)) || []
    for (const pr of sameName)
      if (w.containedIn && w.containedIn(pr.oid))
        return { ...w, state: 'finished', why: `внутри влитого PR #${pr.n}` }
    if (w.patchesUpstream && w.patchesUpstream())
      return {
        ...w,
        state: 'finished',
        why: 'те же правки уже в origin/main (git cherry)',
      }
    if (sameName.length)
      return {
        ...w,
        state: 'active',
        why: `голова не та, что влита в PR #${sameName[0].n} -- имя то же, коммиты другие`,
      }
    return {
      ...w,
      state: 'active',
      why: w.ahead > 0 ? `${w.ahead} коммит(ов) не в main` : '',
    }
  })
}

/** Why a finished tree must still stay; empty when --apply may remove it. */
function blockers(r, recentMin = RECENT_MIN) {
  const b = []
  if (r.state !== 'finished') return ['не завершено']
  if (r.busy === null) b.push('не знаю, кто внутри (lsof не ответил)')
  else if (r.busy > 0) b.push(`внутри работает процесс (${r.busy})`)
  if (r.touchedMin < recentMin)
    b.push(`трогали ${Math.round(r.touchedMin)} мин назад`)
  if (r.nested.length) b.push(`внутри другое дерево: ${r.nested[0]}`)
  if (r.unsafeIgnored.length)
    b.push(
      `игнорируемое, которое не пересобрать: ${r.unsafeIgnored.slice(0, 3).join(', ')}`
    )
  return b
}

function selfCheck() {
  const merged = {
    byOid: new Map([['aaa', 1]]),
    byName: new Map([
      ['loop/done', [{ n: 1, oid: 'aaa' }]],
      ['loop/older', [{ n: 2, oid: 'ccc' }]],
    ]),
  }
  const t = (dir, over) => ({
    dir,
    branch: null,
    head: 'zzz',
    dirty: 0,
    ahead: 1,
    locked: false,
    nested: [],
    unsafeIgnored: [],
    busy: 0,
    touchedMin: 999,
    containedIn: () => false,
    ...over,
  })
  const rows = classify(
    [
      t('/a', { branch: 'loop/done', head: 'aaa' }),
      t('/b', { branch: 'loop/wip' }),
      t('/c', { branch: 'loop/done', head: 'aaa', dirty: 2 }),
      t('/d', { branch: 'loop/empty', ahead: 0 }),
      t('/e', { branch: 'loop/done', head: 'bbb' }),
      t('/f', { head: 'aaa' }),
      t('/g', {
        branch: 'loop/older',
        head: 'old',
        containedIn: oid => oid === 'ccc',
      }),
      t('/h', { head: 'aaa', locked: true }),
      t('/i', { branch: 'loop/wip2', patchesUpstream: () => true }),
    ],
    merged
  )
  const state = d => rows.find(r => r.dir === d).state
  const want = {
    '/a': 'finished',
    '/b': 'active',
    '/c': 'holds',
    '/d': 'finished',
    '/e': 'active',
    '/f': 'finished',
    '/g': 'finished',
    '/h': 'holds',
    '/i': 'finished',
  }
  for (const [dir, expected] of Object.entries(want))
    if (state(dir) !== expected)
      throw new Error(
        `selfCheck: ${dir} classified ${state(dir)}, expected ${expected}`
      )
  // The ones that matter: a MERGED branch with uncommitted work is "holds";
  // a merged NAME with a new tip is work, not a leftover.
  const fin = rows.find(r => r.dir === '/a')
  if (blockers(fin, 60).length)
    throw new Error('selfCheck: a clean finished tree is blocked')
  for (const over of [
    { busy: 1 },
    { busy: null },
    { touchedMin: 5 },
    { nested: ['/a/x'] },
    { unsafeIgnored: ['.env'] },
  ])
    if (!blockers({ ...fin, ...over }, 60).length)
      throw new Error('selfCheck: blocker ignored: ' + JSON.stringify(over))
  if (
    regenerable('.env') ||
    regenerable('logs/.env') ||
    regenerable('src') ||
    !regenerable('apps/x/node_modules/') ||
    !regenerable('apps/x/node_modules/y/src') ||
    !regenerable('dist/assets/a.js')
  )
    throw new Error('selfCheck: regenerable list')
  return true
}

function firstLine(e) {
  return String(e.stderr || e.message)
    .trim()
    .split('\n')[0]
}

function sizeMb(dir) {
  try {
    const out = execFileSync('du', ['-sk', dir], {
      encoding: 'utf8',
      stdio: 'pipe',
    })
    return Math.round(Number(out.split('\t')[0]) / 1024)
  } catch {
    return 0
  }
}

function main() {
  const apply = process.argv.includes('--apply')
  selfCheck()
  console.log(
    'самопроверка: несохранённое перевешивает влитый PR; имя -- не коммит'
  )

  const merged = mergedPrs()
  if (!merged) {
    console.error(
      '\nне удалось спросить GitHub о влитых PR. Здесь НЕЛЬЗЯ подставить\n' +
        '`git merge-base --is-ancestor`: репозиторий сливает squash, и тогда\n' +
        'ветка НИКОГДА не предок main -- ответ будет «не влито» про всё.'
    )
    process.exit(2)
  }

  const rows = classify(gather(processDirs()), merged)
  const by = s => rows.filter(r => r.state === s)
  console.log(
    `\nдеревьев (кроме главного): ${rows.length}` +
      `  завершено ${by('finished').length}` +
      `, держит работу ${by('holds').length}` +
      `, в работе ${by('active').length}\n`
  )
  const LABEL = {
    finished: 'ЗАВЕРШЕНО ',
    holds: 'ДЕРЖИТ    ',
    active: 'в работе  ',
  }
  for (const r of rows)
    console.log(
      '  ' +
        LABEL[r.state] +
        (r.branch || '(detached ' + String(r.head).slice(0, 9) + ')') +
        (r.why ? '  -- ' + r.why : '')
    )

  // deepest first: a nested tree goes before the tree that contains it
  const fin = by('finished').sort((a, b) => b.dir.length - a.dir.length)
  const free = fin.filter(r => !blockers(r).length)
  const kept = fin.filter(r => blockers(r).length)
  if (kept.length) {
    console.log('\nзавершены, но остаются:')
    for (const r of kept)
      console.log(`  ${r.dir}\n      ${blockers(r).join('; ')}`)
  }
  if (!apply) {
    if (free.length) {
      console.log(`\nможно убрать (${free.length}): tri worktrees --apply`)
      for (const r of free) console.log(`  ${r.dir}`)
    }
    console.log(
      '\nдержащие несохранённое не предлагаются НИКОГДА, даже с влитым PR.'
    )
    return
  }

  let removed = 0
  let mb = 0
  for (const r of free) {
    // the world moved since the census: ask again, right before
    const [again] = classify(gather(processDirs(), r.dir), merged)
    const still = again ? blockers(again) : ['исчезло из списка']
    if (still.length) {
      console.log(`  оставлено ${r.dir}: ${still.join('; ')}`)
      continue
    }
    const size = sizeMb(r.dir)
    try {
      git(['worktree', 'remove', r.dir])
      removed++
      mb += size
      console.log(`  убрано ${r.dir}  (${size} МБ; ${again.why})`)
    } catch (e) {
      console.log(`  НЕ убрано ${r.dir}: ${firstLine(e)}`)
    }
  }
  console.log(
    `\nубрано деревьев: ${removed}, освобождено ~${mb} МБ. Ветки на месте.`
  )
}

if (require.main === module) main()
module.exports = { classify, blockers, regenerable, selfCheck }
