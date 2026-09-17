#!/usr/bin/env node
/**
 * Guard: no Cyrillic in code comments or commit messages.
 *
 * The bot is bilingual, so Cyrillic INSIDE string literals (user-facing RU/EN
 * text like `isRu ? '<ru>' : '<en>'`) is allowed. This gate rejects Cyrillic
 * only OUTSIDE string literals — comments and identifiers — for newly added
 * code, plus any Cyrillic in the commit message.
 *
 * Ratchet, not migration: it inspects only what the commit ADDS (the staged
 * diff), so the repository's existing Russian comments and .md docs are left
 * alone. Nothing here ends in `|| true`: a broken check stops the commit.
 *
 * Escape hatch: put the marker  cyrillic-ok  on a line to allow it.
 *
 * Modes:
 *   node scripts/no-cyrillic-guard.cjs staged      # pre-commit: added code lines
 *   node scripts/no-cyrillic-guard.cjs msg <file>  # commit-msg: message body
 *
 * The Cyrillic range is written with \u escapes (not literal letters) so this
 * file does not trip its own gate.
 */
'use strict'

const { execSync } = require('node:child_process')
const fs = require('node:fs')

const CYRILLIC = /[\u0400-\u04FF]/
/*
 * SWIFT IS IN THE LIST BECAUSE IT WAS THE HOLE.
 *
 * On 2026-09-07 a Swift test file shipped with Cyrillic test names --
 * "testБерётсяХвост..." -- and this guard said nothing, because .swift was not
 * in the list and lefthook's glob did not mention it either. The owner caught
 * it by eye. A gate that covers four of five languages is a gate people trust
 * for the fifth.
 *
 * Both places have to agree: this regex and the `no-cyrillic` glob in
 * lefthook.yml. The glob decides which files reach the script at all.
 */
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|swift)$/
const SWIFT_EXT = /\.swift$/
const MARKER = 'cyrillic-ok'
/*
 * THE DIRECTIONAL FORM, BORROWED FROM ESLINT.
 *
 * `eslint-disable-next-line` exists because a trailing comment has nowhere to
 * go on plenty of lines -- JSX children, a line a formatter owns, a line inside
 * an argument list. This gate had only the trailing form and hit exactly that
 * wall. The answer other linters settled on decades ago is an explicit
 * directive on the line ABOVE, and it costs one more constant here.
 *
 * Explicit beats the shape heuristic below wherever the author can reach: the
 * heuristic guesses, this one is written down.
 */
const NEXT_LINE = 'cyrillic-ok-next-line'

// Remove complete quoted literals (single, double, template), honouring
// backslash escapes. Cyrillic that lived inside a string is gone after this;
// whatever Cyrillic remains sat in a comment or an identifier.
function stripStrings(line, swift) {
  let out = line
  // Swift has no single-quoted strings and no backticks-as-strings (backticks
  // quote an identifier there). Applying the JavaScript rules would treat an
  // apostrophe as an opening quote and swallow the rest of the line -- hiding
  // whatever followed, which is the opposite of what a guard is for.
  if (!swift) {
    out = out
      .replace(/`(?:[^`\\]|\\.)*`/g, '')
      .replace(/'(?:[^'\\]|\\.)*'/g, '')
  }
  return out.replace(/"(?:[^"\\]|\\.)*"/g, '')
}

// Where a // line comment begins, ignoring a // that sits inside a string
// literal (the // in "http://…" is not a comment). Returns the index, or -1.
// This scan is why the comment is separated from the code BEFORE strings are
// stripped: stripStrings would erase a quoted Russian word inside a comment such
// as  // see '<ru>'  and let the comment through. A quoted word in a comment is
// still a comment, not a UI string.
function lineCommentStart(line, swift) {
  let quote = null
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quote) {
      if (c === '\\') {
        i++
        continue
      }
      if (c === quote) quote = null
    } else if (c === '"' || (!swift && (c === "'" || c === '`'))) {
      quote = c
    } else if (c === '/' && line[i + 1] === '/') {
      return i
    }
  }
  return -1
}

// Cyrillic is allowed only inside string literals (bilingual UI text). It is a
// violation in a // comment — even wrapped in quotes — or in a code identifier.
function cyrillicOutsideStrings(line, swift) {
  const at = lineCommentStart(line, swift)
  const code = at === -1 ? line : line.slice(0, at)
  const comment = at === -1 ? '' : line.slice(at)
  if (CYRILLIC.test(comment)) return true
  return CYRILLIC.test(stripStrings(code, swift))
}

// A merge commit stages every line the merged branch brings in, so the ratchet
// would fire on other people's already-reviewed code: merging main into a
// branch flagged 610 lines, none of them written by the merging author. That
// contradicts what this guard is for — it inspects what a commit ADDS, and a
// merge adds nothing new here; those lines were gated on their own commits.
//
// `git rev-parse --git-path` rather than a literal .git/MERGE_HEAD: agents in
// this repo work from worktrees, where .git is a file and that path does not
// exist. Hard-coding it would silently disable this check for exactly the
// people the convention tells to use worktrees.
function mergeInProgress() {
  try {
    const p = execSync('git rev-parse --git-path MERGE_HEAD', {
      encoding: 'utf8',
    }).trim()
    return fs.existsSync(p)
  } catch {
    return false
  }
}

/**
 * WHICH RANGE THE CHECK READS.
 *
 * `staged` is right inside a commit hook and useless anywhere else: outside a
 * commit the index is empty, so the check passes by construction. `tri gate`
 * called it that way and reported a clean run while inspecting nothing --
 * measured 2026-08-29, zero staged files and a green line on a branch that did
 * carry Russian comments.
 *
 * `range` compares against the upstream, or origin/main for a branch not yet
 * pushed -- the same window the secret guard uses.
 */
function rangeDiffCommand() {
  // stderr ignored: a branch with no upstream makes git print a fatal that is
  // not an error here, it is the reason to fall through to origin/main.
  const sh = c =>
    execSync(c, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  try {
    const upstream = sh(
      "git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}'"
    )
    if (upstream) return `git diff --unified=0 --no-color ${upstream}...HEAD`
  } catch {
    /* no upstream yet */
  }
  try {
    const base = sh('git merge-base origin/main HEAD')
    if (base) return `git diff --unified=0 --no-color ${base}..HEAD`
  } catch {
    /* no origin/main either */
  }
  return 'git diff --cached --unified=0 --no-color'
}

/**
 * Maximal runs of Cyrillic letters on a line: the units a reflow preserves.
 * "const \u0441\u043b\u043e\u0432\u0430\u043c\u0438 =" yields one run; a new sentence yields several.
 */
function cyrillicRuns(line) {
  return line.match(/[\u0400-\u04FF]+/g) || []
}

/**
 * A LINE THE FORMATTER REWROTE IS NOT A NEW VIOLATION.
 *
 * This is a ratchet on what a commit ADDS, and a reflowed line is an added
 * line. One file in apps/vibee-editor/player predates the current prettier
 * config; the pre-commit hook formats every staged file, so ANY edit to it
 * rewrites 74 untouched lines, twelve of which carry Cyrillic identifiers
 * (\u043f\u043e\u0447\u0435\u043c\u0443\u041d\u0435\u043b\u044c\u0437\u044f and friends) that predate this guard. The result was a file
 * that could not be modified at all: the identifiers are used across other
 * files so renaming them is not a local change, and the offending lines are
 * JSX, where a // marker cannot go.
 *
 * So: exempt an added line when EVERY Cyrillic run on it also appears among
 * the lines this same commit REMOVES from that same file. A reflow removes
 * the old line and adds the new one, so its runs are all present. Genuinely
 * new Cyrillic brings at least one run that nothing is replacing -- a pure
 * insertion has no removed lines at all and is never exempt.
 *
 * The loosening this admits, stated rather than hidden: a new comment whose
 * every Cyrillic word also occurs on some line the commit deletes would pass.
 * That is narrow, and it is the price of not having a file the gates lock.
 */
function isReflowOfExistingCyrillic(line, removedText) {
  if (!removedText) return false
  const runs = cyrillicRuns(line)
  if (!runs.length) return false
  return runs.every(r => removedText.includes(r))
}

/**
 * A MARKER THE FORMATTER MOVED IS STILL THIS LINE'S MARKER.
 *
 * The escape hatch is a comment on the offending line. For a Cyrillic-named
 * helper called across several lines there is nowhere to put it: a comment
 * written after the opening `(` is moved by prettier down onto a line of its
 * own, and the line left behind -- the bare `name(` -- is a changed line
 * carrying unmarked Cyrillic. Writing the marker there does not merely fail,
 * it CREATES the complaint, and writing it a second time duplicates the
 * comment.
 *
 * Measured on apps/vibee-editor/render/pairing-e2e.test.ts, 2026-09-17: five
 * attempts, each one reintroducing the same line. An escape hatch a formatter
 * can close is not an escape hatch.
 *
 * HOW NARROW, AND WHY THAT NARROW.
 *
 * The first version of this accepted a marker on either neighbouring line.
 * Run across all 1107 branches in the repository that version turned four
 * branches from blocked to clean, and every one of them was an accident: a
 * Cyrillic word inside a REGEX literal (which nothing here strips) and a
 * Cyrillic object key, each sitting next to a marker written for something
 * else. A neighbour's marker is not consent.
 *
 * So the rule matches one shape and nothing else: a line that is exactly a
 * call opening -- an identifier and `(`, nothing after it -- with a
 * comment-only marker line directly below, in the same hunk. That is what the
 * formatter's move leaves behind, and it matched none of the 130 branches that
 * the gate blocks today.
 */
const CALL_OPENED = /^\s*[\p{L}_$][\p{L}\p{N}_$]*\($/u

function directiveAbove(added, i) {
  const prev = added[i - 1]
  if (!prev || prev.hunk !== added[i].hunk) return false
  return /^\s*(\/\/|\*|\/\*)/.test(prev.line) && prev.line.includes(NEXT_LINE)
}

function markerMovedOutOfCall(added, i) {
  if (!CALL_OPENED.test(added[i].line)) return false
  const next = added[i + 1]
  if (!next || next.hunk !== added[i].hunk) return false
  return /^\s*\/\//.test(next.line) && next.line.includes(MARKER)
}

/**
 * EVERY ADDED LINE WITH CYRILLIC OUTSIDE A LITERAL, AND WHY IT PASSED OR DID NOT.
 *
 * The gate and `tri cyrillic` read the same records, so the explanation cannot
 * drift from the decision. When this was only a list of blocked lines, a night
 * went into guessing WHICH of the two exemptions had failed and why; the answer
 * was in the data all along, it was simply not printed.
 *
 * A record is `{ file, line, hunk, exempt }`, where `exempt` is null for a
 * blocked line and otherwise names the rule that let it through.
 */
function scanDiff(diff) {
  // First pass: what this commit REMOVES, per file. Needed before the added
  // lines are judged, so it cannot be folded into the loop below.
  const removedByFile = new Map()
  {
    let f = null
    for (const raw of diff.split('\n')) {
      const m = raw.startsWith('+++ ') && raw.match(/^\+\+\+ b\/(.*)$/)
      if (m) {
        f = m[1]
        continue
      }
      if (raw.startsWith('diff --git')) {
        f = null
        continue
      }
      if (f && raw.startsWith('-') && !raw.startsWith('---')) {
        removedByFile.set(f, (removedByFile.get(f) || '') + raw.slice(1) + '\n')
      }
    }
  }

  const records = []

  /*
   * Added lines, in order, per file, tagged with the hunk they belong to.
   *
   * Order and adjacency are what the marker rule below needs, and adjacency is
   * only meaningful INSIDE one hunk: the last line of one hunk and the first of
   * the next sit side by side in the diff and far apart in the file.
   */
  const addedByFile = new Map()
  {
    let f = null
    let hunk = 0
    for (const raw of diff.split('\n')) {
      if (raw.startsWith('diff --git')) {
        f = null
        continue
      }
      if (raw.startsWith('+++')) {
        const m = raw.match(/^\+\+\+ b\/(.*)$/)
        f = m && CODE_EXT.test(m[1]) ? m[1] : null
        continue
      }
      if (raw.startsWith('@@')) {
        hunk++
        continue
      }
      if (f && raw.startsWith('+')) {
        if (!addedByFile.has(f)) addedByFile.set(f, [])
        addedByFile.get(f).push({ line: raw.slice(1), hunk })
      }
    }
  }

  for (const [file, added] of addedByFile) {
    const swift = SWIFT_EXT.test(file)
    const removed = removedByFile.get(file)
    let inMultiline = false

    for (let i = 0; i < added.length; i++) {
      const line = added[i].line
      /*
       * Swift multiline strings ("""), tracked across the added lines.
       *
       * They hold UI text, so their contents are a string literal like any
       * other -- but a line-by-line scan sees bare words. Two files in this
       * repository use them today. An odd number of `"""` on a line flips the
       * state; while inside, the line is skipped.
       *
       * The diff can omit context lines, so this state can be wrong. It errs
       * toward SKIPPING, which risks a miss rather than a false accusation:
       * a guard that cries wolf gets switched off, and this one already spent
       * a day switched off for a different reason.
       */
      if (swift) {
        const fences = (line.match(/"""/g) || []).length
        if (inMultiline) {
          if (fences % 2 === 1) inMultiline = false
          continue
        }
        if (fences % 2 === 1) {
          inMultiline = true
          continue
        }
      }
      if (!cyrillicOutsideStrings(line, swift)) continue
      const hunk = added[i].hunk
      let exempt = null
      if (line.includes(MARKER)) exempt = 'marker'
      else if (isReflowOfExistingCyrillic(line, removed)) exempt = 'reflow'
      else if (directiveAbove(added, i)) exempt = 'next-line'
      else if (markerMovedOutOfCall(added, i)) exempt = 'moved-marker'
      records.push({ file, line, hunk, exempt })
    }
  }

  return { records, removedByFile }
}

function checkStaged(mode = 'staged') {
  if (mergeInProgress()) {
    console.log(
      'no-cyrillic-guard: merge in progress, skipping the staged check ' +
        '(the incoming lines were gated on their own commits).'
    )
    return
  }

  const cmd =
    mode === 'range'
      ? rangeDiffCommand()
      : 'git diff --cached --unified=0 --no-color'
  let diff = ''
  try {
    diff = execSync(cmd, { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 })
  } catch (err) {
    console.error(`no-cyrillic-guard: failed to read the ${mode} diff`)
    process.exitCode = 2
    return
  }

  const { records } = scanDiff(diff)
  const violations = records
    .filter(r => !r.exempt)
    .map(r => ({ file: r.file, text: r.line.trim() }))

  if (violations.length) {
    console.error(
      '\nCyrillic found outside string literals (comment or identifier).'
    )
    console.error(
      'Write code comments in English. Cyrillic is allowed only inside string'
    )
    console.error(
      'literals (UI text). To allow one line on purpose, add  ' +
        MARKER +
        '  to it.\n'
    )
    for (const v of violations) {
      console.error('  ' + v.file + ':  ' + v.text)
    }
    console.error('\n' + violations.length + ' line(s) blocked.')
    /*
     * exitCode, NOT exit(). THE GATE WAS TRUNCATING ITS OWN EVIDENCE.
     *
     * `process.exit` discards writes still queued on a pipe, and stderr IS a
     * pipe under lefthook and under every tool that reads this output. Measured
     * 2026-09-17 on a branch with 8484 complaints: three consecutive runs of the
     * SAME script on the SAME commit printed 966, 7706 and 8484 lines. Redirected
     * to a file -- where writes are synchronous -- all of them printed 8484.
     *
     * The verdict was never wrong, but the evidence was a lottery, and anything
     * reading this text (`tri gate` prints the first five) was reading a random
     * sample. Setting the code and letting the process end flushes everything.
     */
    process.exitCode = 1
  }
}

function checkMessage(pathArg) {
  if (!pathArg) {
    console.error('no-cyrillic-guard: commit-message file path is missing')
    process.exitCode = 2
    return
  }
  let content = ''
  try {
    content = fs.readFileSync(pathArg, 'utf8')
  } catch (err) {
    // No message file to read - nothing to block.
    return
  }

  // Drop everything from the verbose-commit scissors line onward (it carries a
  // diff that may legitimately contain Russian strings), then drop git's own
  // '#' comment lines.
  const beforeScissors = content.split(/^#?\s*-{2,}\s*>8\s*-{2,}.*$/m)[0]
  const body = beforeScissors
    .split('\n')
    .filter(l => !l.startsWith('#'))
    .join('\n')

  if (CYRILLIC.test(body)) {
    console.error(
      '\nThe commit message contains Cyrillic. Write commit messages in English.\n'
    )
    process.exitCode = 1
  }
}

if (require.main === module) {
  const mode = process.argv[2]
  if (mode === 'staged' || mode === 'range') {
    checkStaged(mode)
  } else if (mode === 'msg') {
    checkMessage(process.argv[3])
  } else {
    console.error('usage: no-cyrillic-guard.cjs staged | range | msg <file>')
    process.exitCode = 2
  }
}

module.exports = {
  NEXT_LINE,
  scanDiff,
  stripStrings,
  lineCommentStart,
  cyrillicOutsideStrings,
  cyrillicRuns,
  isReflowOfExistingCyrillic,
}
