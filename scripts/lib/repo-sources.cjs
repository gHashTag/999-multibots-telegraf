/**
 * The file population a whole-tree guard should judge.
 *
 * WHY THIS EXISTS
 *
 * it.174 shipped a file that reddened main while the gate had said green. The
 * gate was not wrong -- it judged a tree the file was not in yet. Guard
 * populations came from `git ls-files`, which does not list untracked paths,
 * so the one guard that had to judge the new file could not see it. The order
 * that produced this ("write it, run the gate, then git add") is the ordinary
 * one, so the defect is not discipline: a green gate over an incomplete
 * population is indistinguishable from a green gate over a complete one.
 *
 * Measured at the time: five guards took their population from `git ls-files`
 * and NONE passed --others, the secrets guard among them. A new file carrying
 * a secret passed the gate silently until it reached the index.
 *
 * WHY -z
 *
 * `git ls-files` without -z escapes non-ASCII names into "scripts/\320\237...",
 * which no longer opens, so an existsSync filter drops the file in silence.
 * That cost 50 files and hid a live service-role key; no-silent-blindness
 * exists because of it and polices plain `git ls-files`. Both calls here use
 * -z for that reason.
 */

const { execFileSync } = require('child_process')

const zsplit = out => out.split('\0').filter(Boolean)

/** Files git tracks. */
function tracked(cwd) {
  return zsplit(
    execFileSync('git', ['ls-files', '-z'], { cwd, encoding: 'utf8' })
  )
}

/** Files present but not tracked, honouring .gitignore. */
function untracked(cwd) {
  return zsplit(
    execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], {
      cwd,
      encoding: 'utf8',
    })
  )
}

/**
 * Everything a guard should judge: what is committed AND what is present and
 * would be committed. Order is tracked-first, then untracked; both sorted so
 * a failure message is stable between runs.
 */
function repoFiles(cwd) {
  return [...tracked(cwd).sort(), ...untracked(cwd).sort()]
}

/**
 * Refuses to run with a reader that cannot see. A guard whose population
 * silently empties reports "no offenders" -- the same words a healthy
 * repository produces, which is the failure this whole file is about.
 */
function selfCheck(cwd) {
  const t = tracked(cwd)
  if (t.length < 300) {
    throw new Error(
      `repo-sources selfCheck: tracked list is ${t.length}, expected >300 -- ` +
        `the population collapsed, so any "clean" verdict is meaningless`
    )
  }
  const all = repoFiles(cwd)
  if (all.length < t.length) {
    throw new Error(
      `repo-sources selfCheck: combined (${all.length}) is smaller than ` +
        `tracked (${t.length})`
    )
  }
  // The untracked call must be a real query, not a stub returning [].
  const u = untracked(cwd)
  if (all.length !== t.length + u.length) {
    throw new Error(
      `repo-sources selfCheck: combined ${all.length} != ${t.length}+${u.length}`
    )
  }
}

module.exports = { repoFiles, tracked, untracked, selfCheck }
