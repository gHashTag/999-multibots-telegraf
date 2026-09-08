/**
 * WHAT STATEMENT DOES THIS LINE LIVE INSIDE?
 *
 * Structural tests keep asking "is X inside a try / a finally / this env gate",
 * and keep answering it with a regex that demands the two constructs TOUCH:
 *
 *     /try \{\s*pool = getPool\(\)/
 *
 * That is a claim about layout, not about the program. It holds until somebody
 * adds a log line or a comment at the top of the block -- a legitimate edit --
 * and then the test reports the property missing when it is right there. It
 * happened for real: #2220 put a helper between `if (process.env.X === '1') {`
 * and `const startAutopilot`, and the contract check called the switch missing
 * for four days (#2228).
 *
 * Containment is established here the way the language establishes it: walk up
 * from the line until one is less indented, and that is the statement it lives
 * in. Deliberately textual -- a parser is a heavier dependency than these
 * checks are worth, and indentation in this repository is machine-enforced by
 * prettier, so it is a fact about the file rather than a hope.
 *
 * WHAT IT MUST NOT DO is answer "the nearest try anywhere above". A needle that
 * sits in no try at all must come back with whatever really encloses it, so a
 * test can fail on it; grabbing the nearest matching line up the file would
 * pass with the try deleted.
 */

/** Every line index whose text contains the needle. */
function linesWith(lines, needle) {
  const out = []
  lines.forEach((l, i) => {
    if (l.includes(needle)) out.push(i)
  })
  return out
}

const indentOf = l => l.length - l.trimStart().length

/**
 * The opening line of the statement enclosing each occurrence of `needle`,
 * trimmed. One entry per occurrence, in file order; an occurrence at top level
 * yields null.
 */
function enclosingStatements(src, needle) {
  const lines = String(src).split('\n')
  return linesWith(lines, needle).map(at => {
    const inner = indentOf(lines[at])
    for (let i = at - 1; i >= 0; i--) {
      const line = lines[i]
      if (!line.trim()) continue
      // Still inside the block, or deeper in a nested one.
      if (indentOf(line) >= inner) continue
      return line.trim()
    }
    return null
  })
}

/**
 * True when SOME occurrence of `needle` sits directly inside a statement whose
 * opening line matches `pattern`.
 *
 * "Some", not "every", because a needle usually also appears in its own
 * declaration: `checkInFlight = false` is both the reset inside `finally` and
 * the `let` that created it.
 */
function enclosedBy(src, needle, pattern) {
  return enclosingStatements(src, needle).some(
    l => l !== null && pattern.test(l)
  )
}

module.exports = { enclosingStatements, enclosedBy }
