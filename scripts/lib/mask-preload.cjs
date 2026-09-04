/**
 * Preload that makes every source read return MASKED code.
 *
 * WHY
 *
 * it.176 found a measuring tool that classified guards by the text it found
 * ("mentions the tracked listing, does not mention --others") instead of by
 * what the guard actually reads. It reported 5 blind where 4 were, and the
 * number reached a published report. That is the sixth occurrence of "a
 * matcher knows a spelling, not a thing", and the first with a MEASURER as
 * the victim.
 *
 * Reading twenty tools by hand to look for the seventh is slow and unreliable.
 * This asks all of them one question at once, from the outside:
 *
 *   does this tool's answer change when comments and string bodies stop
 *   looking like code?
 *
 * A tool whose numbers move is not automatically wrong -- a tool that reports
 * on user-facing MESSAGES should read strings. But every tool that classifies
 * CODE and moves is asking a question about text where it means to ask one
 * about code, which is exactly the defect.
 *
 * Usage:
 *   NODE_OPTIONS="--require ./scripts/lib/mask-preload.cjs" ./tri <verb>
 *
 * blank() preserves length, so offsets and line numbers stay identical and a
 * diff of the two runs shows only genuine classification changes.
 */

const fs = require('fs')
const path = require('path')

const { blank } = require(path.join(__dirname, 'blank-code.cjs'))

const SOURCE = /\.(ts|mts|cts|tsx|js|mjs|cjs|jsx)$/

const realReadFileSync = fs.readFileSync

fs.readFileSync = function (file, options) {
  const out = realReadFileSync.call(this, file, options)
  if (typeof out !== 'string') return out
  const name = typeof file === 'string' ? file : ''
  if (!SOURCE.test(name)) return out
  // NEVER mask a tool's own source. require() loads modules THROUGH
  // readFileSync, so masking anything under scripts/ hands node a file whose
  // string literals and regex bodies have been blanked -- it then dies inside
  // the tool with a syntax error that looks like a finding. That happened to
  // `tri scopes` on the first run of this preload: the crash was reported as
  // "the verdict moved", when the instrument had simply broken the tool.
  if (name.includes(`${path.sep}scripts${path.sep}`)) return out
  if (name.includes('node_modules')) return out
  // A worktree runs tools from its own root; exclude the CLI itself too.
  if (name.endsWith(`${path.sep}tri`)) return out
  try {
    return blank(out)
  } catch {
    return out
  }
}
