/**
 * WHICH OF THE PUSHED FILES ARE THIS BRANCH'S OWN CHANGE.
 *
 * `upstream..HEAD` is what a push adds to the remote branch. After the branch
 * merges main, that range also carries everything that landed on main in the
 * meantime -- and the test gate then ran main's tests as if this branch had
 * written them, and refused the push with "your edit broke it".
 *
 * Measured 27.09.2026 (story loop, turn 9): a push whose only own change was
 * one line of a .md journal was refused because
 * apps/vibee-editor/render/provider.test.ts is red on main itself since #3143;
 * the eight code files the gate "saw" were all main's.
 *
 * The rule is the one test-guard.cjs already states for a branch with no
 * upstream: the range must describe what THIS branch adds, not everything
 * that landed on main while it was being written. What the branch adds is
 * `origin/main...HEAD` (from the merge base) -- a file changed while
 * resolving a conflict differs from main, so it stays in.
 *
 * @param {string[]} pushed files in upstream..HEAD
 * @param {string[] | null} own files in origin/main...HEAD; null when git
 *   did not answer -- then the wider list stands: a gate has no business
 *   passing quietly because of its own failure.
 * @returns {string[]}
 */
function ownOnly(pushed, own) {
  if (own === null) return pushed
  const mine = new Set(own)
  return pushed.filter(f => mine.has(f))
}

module.exports = { ownOnly }
