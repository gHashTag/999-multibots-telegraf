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
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/
const MARKER = 'cyrillic-ok'

// Remove complete quoted literals (single, double, template), honouring
// backslash escapes. Cyrillic that lived inside a string is gone after this;
// whatever Cyrillic remains sat in a comment or an identifier.
function stripStrings(line) {
  return line
    .replace(/`(?:[^`\\]|\\.)*`/g, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, '')
    .replace(/"(?:[^"\\]|\\.)*"/g, '')
}

function checkStaged() {
  let diff = ''
  try {
    diff = execSync('git diff --cached --unified=0 --no-color', {
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
    })
  } catch (err) {
    console.error('no-cyrillic-guard: failed to read the staged diff')
    process.exit(2)
  }

  const violations = []
  let file = null
  let scan = false

  for (const raw of diff.split('\n')) {
    if (raw.startsWith('diff --git')) {
      file = null
      scan = false
      continue
    }
    if (raw.startsWith('+++ ')) {
      const m = raw.match(/^\+\+\+ b\/(.*)$/)
      file = m ? m[1] : null
      scan = !!file && CODE_EXT.test(file)
      continue
    }
    if (!scan) continue
    if (raw.startsWith('+') && !raw.startsWith('+++')) {
      const line = raw.slice(1)
      if (line.includes(MARKER)) continue
      if (CYRILLIC.test(stripStrings(line))) {
        violations.push({ file, text: line.trim() })
      }
    }
  }

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
    process.exit(1)
  }
}

function checkMessage(pathArg) {
  if (!pathArg) {
    console.error('no-cyrillic-guard: commit-message file path is missing')
    process.exit(2)
  }
  let content = ''
  try {
    content = fs.readFileSync(pathArg, 'utf8')
  } catch (err) {
    // No message file to read — nothing to block.
    process.exit(0)
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
    process.exit(1)
  }
}

const mode = process.argv[2]
if (mode === 'staged') {
  checkStaged()
} else if (mode === 'msg') {
  checkMessage(process.argv[3])
} else {
  console.error('usage: no-cyrillic-guard.cjs staged | msg <file>')
  process.exit(2)
}
