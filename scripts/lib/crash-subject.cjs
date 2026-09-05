/**
 * Makes a structural test's SUBJECT unreadable, leaving the test itself
 * loadable.
 *
 * A ratchet that reads source files as text must go red when those files
 * cannot be read: if it still passes, its verdict did not depend on the thing
 * it claims to guard. Test files, node_modules and scripts/ are spared so
 * vitest keeps working and the signal is "the subject vanished" rather than
 * "nothing loads".
 *
 * WHAT IT CANNOT JUDGE, and this matters more than what it can:
 *
 *   - behavioural tests (vi.mock + calling the unit) -- they never read source
 *   - subjects that are not .ts/.js text: railway.toml, *.md, the tri script
 *   - tests reading through scripts/, which is spared on purpose
 *   - assertions over literal fixtures, whose subject is a string in the test
 *
 * For those, "survived" means the instrument does not apply -- not that the
 * test is vacuous. it.192 ran it over 99 money ratchets: 312 of 369 assertions
 * reddened, and every one of the 57 survivors turned out to be out of reach,
 * not hollow.
 */

const fs = require('fs')
const real = fs.readFileSync
fs.readFileSync = function (file, options) {
  const n = typeof file === 'string' ? file : ''
  if (
    /\.(ts|tsx|js|cjs|mjs)$/.test(n) &&
    !n.includes('node_modules') &&
    !n.includes('/scripts/') &&
    !/\.test\.tsx?$/.test(n) &&
    !n.includes('/.vite') &&
    !n.includes('vitest')
  )
    throw new Error('subject unreadable (probe)')
  return real.call(this, file, options)
}
