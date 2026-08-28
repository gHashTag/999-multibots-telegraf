import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

/**
 * findSelfLoops must recognise a node_modules that points at itself, and must
 * NOT flag a healthy one.
 *
 * WHY. verify.cjs calls this as a preflight so a self-referential node_modules
 * symlink is named — "node_modules -> itself" — instead of surfacing as
 * thirteen steps that each fail to spawn (exit -1, 0.0s). That diagnosis is
 * only worth anything if the detector both fires on the real fault and stays
 * quiet on a normal tree; this pins both directions against real symlinks in a
 * temp fixture.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { findSelfLoops } = require(
  path.join(process.cwd(), 'scripts/heal-node-modules.cjs')
)

const made: string[] = []
function tmpBase(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'selfloop-'))
  made.push(d)
  return d
}

afterEach(() => {
  while (made.length)
    fs.rmSync(made.pop() as string, { recursive: true, force: true })
})

describe('findSelfLoops detects a self-referential node_modules', () => {
  it('flags node_modules that symlinks to itself', () => {
    const base = tmpBase()
    const nm = path.join(base, 'node_modules')
    fs.symlinkSync(nm, nm) // absolute target == the link itself
    const loops = findSelfLoops(base)
    expect(loops.map((l: { dir: string }) => l.dir)).toContain('.')
  })

  it('is quiet when node_modules is a real directory', () => {
    const base = tmpBase()
    fs.mkdirSync(path.join(base, 'node_modules'))
    expect(findSelfLoops(base)).toEqual([])
  })

  it('is quiet when there is no node_modules at all', () => {
    const base = tmpBase()
    expect(findSelfLoops(base)).toEqual([])
  })

  it('does not flag a symlink that points somewhere else', () => {
    const base = tmpBase()
    const real = path.join(base, 'real-modules')
    fs.mkdirSync(real)
    fs.symlinkSync(real, path.join(base, 'node_modules'))
    expect(findSelfLoops(base)).toEqual([])
  })
})
