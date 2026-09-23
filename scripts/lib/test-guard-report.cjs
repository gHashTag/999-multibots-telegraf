/**
 * WHERE THE TEST GATE LEAVES ITS REPORT -- ONE FILE PER WORKING TREE.
 *
 * Measured 2026-09-23. A push from the worktree `signed-training-zips-wt` was
 * refused with "there are failing tests that were not in the baseline". The
 * report left behind named 23 failing files, and every one of them was under
 * a DIFFERENT worktree (`link-leftovers-wt`): a sibling session pushing at the
 * same time had written its failures into the same file, and they blocked a
 * branch that did not contain the code that broke them.
 *
 * WHY IT COLLIDED. The gate wrote to `<root>/node_modules/.cache/...`, and
 * `root` really is each worktree's own directory -- but on this machine every
 * worktree's `node_modules` is a symlink to the main checkout's, because a
 * real install costs gigabytes per tree. So a path that looks per-worktree
 * resolves to ONE shared file for all of them.
 *
 * WHY IT IS WORSE THAN A CRASH. The failure is silent and shaped exactly like
 * a genuine regression, so the obvious reaction is to hunt for a bug in a diff
 * that never had one. A gate that lies in that direction teaches "push again
 * until it passes", and that habit lets real breakage through.
 *
 * THE KEY is the working tree's own git directory, which git gives out per
 * tree (`.git/worktrees/<name>` for a linked worktree, `<root>/.git` for the
 * main checkout) and never shares. It is hashed rather than used verbatim: a
 * worktree name may contain anything a directory name may, and a report path
 * is not the place to find that out. The root is hashed in with it, so two
 * checkouts that somehow report the same git dir still get their own file.
 *
 * The file stays inside `node_modules/.cache`, which is already ignored.
 */
const { createHash } = require('crypto')
const { resolve } = require('path')

/** Separates the two parts of the key: a byte no path can contain. */
const SEP = '\0'

/**
 * A short, filesystem-safe key for one working tree.
 *
 * `gitDir` is whatever `git rev-parse --git-dir` said, absolute or relative;
 * it is resolved against the root so one tree cannot key two ways. When git
 * could not be asked at all, the root alone still separates trees -- what is
 * shared between them is `node_modules`, a symlink, not the root.
 */
function worktreeKey(root, gitDir) {
  const where = gitDir ? resolve(root, String(gitDir)) : ''
  return createHash('sha256')
    .update(resolve(root) + SEP + where)
    .digest('hex')
    .slice(0, 12)
}

/**
 * The report path for this tree, and its confirm-pass sibling.
 *
 * Both names carry the same key: the second pass re-runs what the first one
 * found, so a crossed pair would be the same bug with one more step in it.
 */
function reportPaths(root, gitDir) {
  const key = worktreeKey(root, gitDir)
  const at = name => resolve(root, 'node_modules', '.cache', name)
  return {
    key,
    out: at('test-guard.' + key + '.json'),
    confirm: at('test-guard.' + key + '.confirm.json'),
  }
}

/**
 * Does this report describe THIS tree?
 *
 * The unique path above is the fix; this is the alarm for the day it stops
 * working -- a stale file from an older version of the gate, a root that
 * moved, a key that collides. A foreign name is never silently trusted,
 * because trusting one is exactly how a sibling's failures blocked an
 * innocent push.
 *
 * Returns the foreign names, so the caller can say where they came from
 * instead of reporting them as the pusher's own breakage.
 */
function foreignResults(root, results) {
  const here = resolve(root)
  return (results || [])
    .map(r => String((r && r.name) || ''))
    .filter(name => name && !name.startsWith(here + '/'))
}

module.exports = { worktreeKey, reportPaths, foreignResults }
