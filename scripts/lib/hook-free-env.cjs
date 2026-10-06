'use strict'
/**
 * THE ENVIRONMENT A TEST GETS WHEN A GIT HOOK RUNS IT.
 *
 * A hook exports GIT_DIR (and, from a worktree, GIT_INDEX_FILE and friends).
 * A test that builds a throwaway repository in a temp directory and runs git
 * there inherits it, so every one of its git calls lands on the REAL
 * repository: on 2026-10-03 the pre-push gate refused a push because three
 * tests failed only inside the hook -- the TestFlight notes test read the
 * branch's own commit, prtree cd'd into a clone that was never made. Run by
 * hand, all 47 passed. A `git config` in such a test writes to the real
 * .git/config (ship.test.ts, 2026-09-22).
 *
 * Tests used to strip these one file at a time (NO_GIT_ENV in ship.test.ts);
 * the next new test forgot. The gate strips them once, for every test it runs.
 *
 * The list is git's own (`git rev-parse --local-env-vars`): exactly the
 * variables that tie a process to one repository. Global settings such as
 * GIT_AUTHOR_NAME or GIT_SSH_COMMAND stay.
 */
const { execFileSync } = require('child_process')

const FALLBACK = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_PREFIX',
]

function localGitVars() {
  try {
    const out = execFileSync('git', ['rev-parse', '--local-env-vars'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const names = out.split('\n').filter(Boolean)
    return names.length ? names : FALLBACK
  } catch {
    return FALLBACK
  }
}

/** `env` without the variables that bind git to the hook's repository. */
function hookFreeEnv(env = process.env, names = localGitVars()) {
  const drop = new Set(names)
  return Object.fromEntries(Object.entries(env).filter(([k]) => !drop.has(k)))
}

module.exports = { hookFreeEnv, localGitVars }
