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
 * NOTHING IS DELETED BY THIS FILE. It classifies; removal is the caller's
 * explicit act, and a tree holding uncommitted work is never proposed for it --
 * someone else's unsaved work is not mine to discard, even when it looks
 * superseded. Both trees left behind by the first sweep held an OLD copy of a
 * command that main already carries in a better form, and they were still kept.
 */

const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')

const git = (args, cwd = ROOT) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' })

/** Branch names whose pull request is merged, straight from GitHub. */
function mergedBranches() {
  try {
    const out = execFileSync(
      'gh',
      [
        'pr',
        'list',
        '--state',
        'merged',
        '--limit',
        '300',
        '--json',
        'headRefName',
        '-q',
        '.[].headRefName',
      ],
      { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }
    )
    return new Set(
      out
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean)
    )
  } catch {
    return null
  }
}

/** Every worktree except the main checkout: path, branch, dirty, ahead. */
function worktrees() {
  const out = []
  let cur = null
  for (const line of git(['worktree', 'list', '--porcelain']).split('\n')) {
    if (line.startsWith('worktree ')) cur = { dir: line.slice(9), branch: null }
    else if (line.startsWith('branch '))
      cur.branch = line.slice(7).replace('refs/heads/', '')
    else if (line.startsWith('detached')) cur.branch = null
    else if (line === '' && cur) {
      out.push(cur)
      cur = null
    }
  }
  if (cur) out.push(cur)
  const mainDir = out.length ? out[0].dir : ROOT
  return out
    .filter(w => w.dir !== mainDir)
    .map(w => {
      let dirty = -1
      let ahead = -1
      try {
        dirty = git(['status', '--porcelain'], w.dir)
          .split('\n')
          .filter(Boolean).length
      } catch {
        /* the directory may be gone; prune will report it */
      }
      try {
        if (w.branch)
          ahead = Number(
            git(['rev-list', '--count', `origin/main..${w.branch}`]).trim()
          )
      } catch {
        /* branch may not exist on the remote */
      }
      return { ...w, dirty, ahead }
    })
}

/**
 * finished  merged PR (or nothing beyond main) AND nothing uncommitted
 * holds     uncommitted work -- never proposed for removal
 * active    no merged PR and commits beyond main -- someone's work in progress
 */
function classify(trees, merged) {
  const rows = trees.map(w => {
    if (w.dirty > 0) return { ...w, state: 'holds' }
    const isMerged = w.branch && merged && merged.has(w.branch)
    if (isMerged || w.ahead === 0) return { ...w, state: 'finished' }
    return { ...w, state: 'active' }
  })
  return rows
}

function selfCheck() {
  const merged = new Set(['loop/done'])
  const rows = classify(
    [
      { dir: '/a', branch: 'loop/done', dirty: 0, ahead: 1 },
      { dir: '/b', branch: 'loop/wip', dirty: 0, ahead: 1 },
      { dir: '/c', branch: 'loop/done', dirty: 2, ahead: 1 },
      { dir: '/d', branch: 'loop/empty', dirty: 0, ahead: 0 },
    ],
    merged
  )
  const state = d => rows.find(r => r.dir === d).state
  const want = {
    '/a': 'finished',
    '/b': 'active',
    '/c': 'holds',
    '/d': 'finished',
  }
  for (const [dir, expected] of Object.entries(want))
    if (state(dir) !== expected)
      throw new Error(
        `selfCheck: ${dir} classified ${state(dir)}, expected ${expected}`
      )
  // The one that matters: a MERGED branch with uncommitted work is "holds",
  // never "finished". Deleting a tree because its PR landed is how unsaved
  // work disappears.
  if (state('/c') !== 'holds') throw new Error('selfCheck: dirty beats merged')
  return true
}

function main() {
  selfCheck()
  console.log('самопроверка: несохранённое перевешивает влитый PR')

  const merged = mergedBranches()
  if (!merged) {
    console.error(
      '\nне удалось спросить GitHub о влитых PR. Здесь НЕЛЬЗЯ подставить\n' +
        '`git merge-base --is-ancestor`: репозиторий сливает squash, и тогда\n' +
        'ветка НИКОГДА не предок main -- ответ будет «не влито» про всё.'
    )
    process.exit(2)
  }

  const rows = classify(worktrees(), merged)
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
  for (const r of rows) {
    const unsaved = r.dirty > 0 ? '  несохранённых файлов: ' + r.dirty : ''
    console.log('  ' + LABEL[r.state] + (r.branch || '(detached)') + unsaved)
  }

  if (by('finished').length) {
    console.log('\nубрать завершённые (ветки и коммиты останутся):')
    for (const r of by('finished'))
      console.log(`  git worktree remove --force '${r.dir}'`)
  }
  console.log(
    '\nдержащие несохранённое не предлагаются НИКОГДА, даже с влитым PR.'
  )
}

if (require.main === module) main()
module.exports = { classify, selfCheck }
