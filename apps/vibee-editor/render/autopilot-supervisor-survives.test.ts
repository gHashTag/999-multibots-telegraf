import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { EventEmitter } from 'events'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  sliceBetween,
  sliceFrom,
} = require('../../../scripts/lib/anchored-slice.cjs')

/*
 * THE FACTORY HAS PUBLISHED NOTHING FOR 382 HOURS AND NOTHING SAID SO.
 *
 * The autopilot runs as a supervised child of this server. Two gaps kept that
 * silent, and they fail in opposite directions:
 *
 * 1. The child had an 'exit' listener and no 'error' one. ChildProcess emits
 *    'error' when the binary cannot be executed at all -- a missing tsx after
 *    a dependency change, EAGAIN, EMFILE -- and an 'error' event with NO
 *    listener is thrown. A failure to start the autopilot would have taken
 *    down the render service that supervises it, which is the opposite of what
 *    a supervisor is for.
 * 2. Neither ending left a trace anywhere a person looks. A console line in a
 *    container log is not a record; the journal, where this service already
 *    files money events needing a human, is.
 *
 * The first is provable here as behaviour: Node's own semantics, on a real
 * EventEmitter. The second is read from the source, because reaching it needs
 * a booted server and a database.
 */
const SRC = fs.readFileSync(path.join(__dirname, 'render-server.ts'), 'utf8')

describe('a supervised autopilot cannot take the server down, and cannot stop quietly', () => {
  it("Node really does throw an 'error' event that nobody listens for", () => {
    // The premise, not an assumption about it: if this ever stopped being
    // true, the rule above would be guarding nothing.
    const child = new EventEmitter()
    expect(() => child.emit('error', new Error('spawn ENOENT'))).toThrow(
      'spawn ENOENT'
    )
    const supervised = new EventEmitter()
    supervised.on('error', () => {})
    expect(() =>
      supervised.emit('error', new Error('spawn ENOENT'))
    ).not.toThrow()
  })

  it('the autopilot child listens for both endings', () => {
    const block = sliceFrom(SRC, 'const startAutopilot = ', 2500)
    expect(block, 'a spawn that cannot start would crash the server').toContain(
      "child.on('error'"
    )
    expect(block).toContain("child.on('exit'")
  })

  it('both endings reach the journal, not only the console', () => {
    const block = sliceFrom(SRC, 'const startAutopilot = ', 2500)
    const calls = [...block.matchAll(/noteAutopilotStop\(/g)]
    expect(
      calls.length,
      'each ending must record, not just log'
    ).toBeGreaterThanOrEqual(2)
    const note = sliceBetween(
      SRC,
      'const noteAutopilotStop',
      'const startAutopilot'
    )
    expect(note).toContain("severity: 'attention'")
  })

  it('recording a stop can never itself become the failure', () => {
    // The journal lives in the same database the autopilot needs. A write that
    // threw here would replace one silent failure with two.
    /*
     * The closing anchor matters more here than the opening one. `try {` and
     * `catch` occur all over a 410KB file, so if `const startAutopilot` ever
     * disappeared the region would run from noteAutopilotStop to end of file
     * -- measured at 5,990 characters instead of 517 -- and BOTH assertions
     * below would still pass, on text that is not this function. sliceBetween
     * refuses that.
     */
    const note = sliceBetween(
      SRC,
      'const noteAutopilotStop',
      'const startAutopilot'
    )
    expect(note).toContain('try {')
    expect(note).toContain('catch')
  })
})
