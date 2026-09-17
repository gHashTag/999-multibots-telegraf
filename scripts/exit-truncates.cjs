#!/usr/bin/env node
/**
 * WHICH SCRIPTS LOSE THEIR OWN OUTPUT WHEN SOMETHING READS THEM.
 *
 * `process.exit()` does not wait for writes already queued on a pipe. Node's own
 * documentation says so in as many words -- "truncated and lost" -- and adds
 * that whether a write is synchronous depends on what the stream is connected
 * to. A file: synchronous, nothing lost. A pipe: 64K of buffer, then a queue,
 * and `exit` throws the queue away.
 *
 * Found the hard way on 2026-09-17: the Cyrillic gate printed 966, then 7706,
 * then 8484 of the same 8484 complaints on three consecutive runs of one script
 * against one commit. The verdict was right every time; the evidence was a
 * lottery, and half a day went into "differences between branches" that were
 * this and nothing else.
 *
 *   node scripts/exit-truncates.cjs              list the candidate sites
 *   node scripts/exit-truncates.cjs --verify <script> [args...]
 *                                                MEASURE one script: run it with
 *                                                a reader that starts late, and
 *                                                compare with a file redirect
 *
 * THE LIST IS A HYPOTHESIS, THE MEASUREMENT IS THE FINDING. A script that prints
 * two lines before exiting fits the pattern and loses nothing in practice. Only
 * `--verify` can tell them apart, and it needs a script that is safe to run.
 */
'use strict'

const fs = require('node:fs')
const { execSync } = require('node:child_process')

/**
 * `-z` AND A NUL SPLIT, BECAUSE A NEWLINE IN A NAME IS LEGAL.
 *
 * `git ls-files` separates by newline and QUOTES a name that contains one, so a
 * plain split drops that file from the population and the tool goes blind
 * without saying anything. The repository already guards against this
 * (no-silent-blindness.test.ts) and it caught these three the moment they were
 * looked at properly.
 */
const listTracked = () =>
  execSync('git ls-files -z', {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean)

const PRINT = /console\.(log|error|warn|info)\s*\(/
const EXIT = /process\.exit\s*\(/

/**
 * A print that can be BIG: one inside a loop body, or one whose argument is
 * joined from an array. Those are the two shapes that outrun a pipe buffer.
 *
 * Deliberately narrow. An earlier version in this repository counted every
 * print before an exit and produced 393 sites, which is a number nobody can act
 * on -- most of them print a sentence.
 */
function bulkPrintLines(source) {
  const lines = source.split('\n')
  const hits = []
  let depth = 0
  const loopDepth = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const opensLoop =
      /\b(for|while)\s*\(/.test(line) ||
      /\.(forEach|map|flatMap)\s*\(/.test(line)
    if (opensLoop) loopDepth.push(depth)

    if (PRINT.test(line)) {
      const inLoop = loopDepth.length > 0
      const joined =
        /\.join\s*\(/.test(line) || /\.join\s*\(/.test(lines[i + 1] ?? '')
      if (inLoop || joined)
        hits.push({ line: i + 1, text: line.trim(), inLoop })
    }

    depth += (line.match(/[{([]/g) || []).length
    depth -= (line.match(/[})\]]/g) || []).length
    while (loopDepth.length && depth <= loopDepth[loopDepth.length - 1]) {
      loopDepth.pop()
    }
  }
  return hits
}

function exitLines(source) {
  return source
    .split('\n')
    .map((l, i) => ({ line: i + 1, text: l.trim() }))
    .filter(e => EXIT.test(e.text) && !/process\.exitCode/.test(e.text))
}

function listCandidates() {
  const files = listTracked().filter(f =>
    /^(scripts|bin|tools)\/.*\.(cjs|mjs|js)$/.test(f)
  )

  const found = []
  for (const f of files) {
    let src
    try {
      src = fs.readFileSync(f, 'utf8')
    } catch {
      continue
    }
    const exits = exitLines(src)
    if (!exits.length) continue
    const bulk = bulkPrintLines(src)
    if (!bulk.length) continue
    found.push({
      file: f,
      exits: exits.length,
      bulk: bulk.length,
      first: bulk[0],
    })
  }

  found.sort((a, b) => b.bulk - a.bulk)
  for (const f of found) {
    console.log(
      `${f.file}  ${f.bulk} bulk print(s), ${f.exits} exit(s)  e.g. :${f.first.line}`
    )
  }
  console.log(
    `\n${found.length} script(s) print in bulk and then call process.exit.`
  )
  console.log(
    'This is a LIST OF SUSPECTS. Measure one with --verify before calling it a bug.'
  )
  console.log(`${files.length} script(s) scanned.`)
}

/**
 * THE MEASUREMENT, AND WHY IT USES A REAL SHELL PIPE.
 *
 * Run the script twice: once redirected to a file (writes are synchronous there,
 * so that is the whole text), and once through a real pipe whose reader sleeps
 * first, so the 64K buffer fills and the writes queue.
 *
 * The first version of this did the delay inside Node -- spawn the child, attach
 * the data listeners 400ms later. It reported that a three-line script loses all
 * three, which is false: `node three-lines.cjs | (sleep 1; cat)` prints three.
 * The delay has to happen in a SEPARATE process on the other end of a real pipe,
 * or the measurement is about Node's stream plumbing in the parent rather than
 * about the child.
 *
 * Ground truth this now matches, measured on macOS:
 *   3 lines + process.exit     -> 3 both ways, loses nothing
 *   4000 lines + process.exit  -> 4000 to a fast reader, 1960 to a slow one
 * libuv writes synchronously while the pipe has room, so a small script is safe
 * however it exits. Only past the buffer does `exit` throw work away.
 */
function verify(argv) {
  const target = argv[0]
  if (!target) {
    console.error('usage: exit-truncates.cjs --verify <script> [args...]')
    process.exitCode = 2
    return
  }
  const rest = argv
    .slice(1)
    .map(a => JSON.stringify(a))
    .join(' ')
  const cmd = `node ${JSON.stringify(target)} ${rest}`

  const count = shell => {
    try {
      return Number(
        execSync(shell, { encoding: 'utf8', shell: '/bin/sh' }).trim()
      )
    } catch (err) {
      // A gate that finds something exits non-zero; the count still reached us
      // through the pipeline, because `wc -l` is the last stage and succeeds.
      const out = String(err.stdout || '').trim()
      return Number(out) || 0
    }
  }

  const whole = count(
    `${cmd} > /tmp/exit-truncates-$$.txt 2>&1; wc -l < /tmp/exit-truncates-$$.txt; rm -f /tmp/exit-truncates-$$.txt`
  )
  const piped = count(`${cmd} 2>&1 | ( sleep 1; cat ) | wc -l`)

  console.log(`${target}`)
  console.log(`  to a file:      ${whole} line(s)`)
  console.log(`  to a slow pipe: ${piped} line(s)`)
  if (piped < whole) {
    console.log(`  LOSES ${whole - piped} line(s) when something reads it.`)
    process.exitCode = 1
  } else {
    console.log('  loses nothing.')
  }
}

const argv = process.argv.slice(2)
if (argv[0] === '--verify') verify(argv.slice(1))
else listCandidates()
