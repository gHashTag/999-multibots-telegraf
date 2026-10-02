/**
 * DECLARED, BUT NOT INSTALLED -- AND NOT A FALSE ALARM FOR A HOISTED PACKAGE.
 *
 * scripts/deps-absent.cjs feeds `tri deps` and the verify preflight. Its first
 * draft looked only in the directory's own node_modules and reported
 * @ton/core and @ton/crypto as absent from render, though node finds both in
 * the root's. These pin both halves: absent is named, hoisted is not.
 */
import { afterAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { absentFrom, installDrift, driftLine } = require('./deps-absent.cjs')

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deps-absent-'))
const pkg = (dir: string, deps: Record<string, string>) => {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ dependencies: deps })
  )
}
const install = (dir: string, name: string) =>
  pkg(path.join(dir, 'node_modules', name), {})

const app = path.join(root, 'apps', 'one')
pkg(root, { own: '1' })
install(root, 'own')
install(root, 'hoisted')
pkg(app, { local: '1', hoisted: '1', gone: '1', '@scope/gone': '1' })
install(app, 'local')

afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

describe('deps-absent', () => {
  it('names a declared package node cannot find', () => {
    expect(absentFrom(app)).toEqual(['gone', '@scope/gone'])
  })

  it('finds a package hoisted to a parent node_modules', () => {
    expect(absentFrom(app)).not.toContain('hoisted')
  })

  it('is silent when everything declared is installed', () => {
    expect(absentFrom(root)).toEqual([])
  })

  it('has nothing to say about a directory without a package.json', () => {
    expect(absentFrom(path.join(root, 'nowhere'))).toEqual([])
  })
})

describe('installDrift', () => {
  const other = path.join(root, 'other')
  const tree = path.join(root, 'tree')
  pkg(other, { kept: '1', bumped: '1', dropped: '1' })
  fs.mkdirSync(path.join(other, 'node_modules'))
  pkg(tree, { kept: '1', bumped: '2', added: '1' })
  fs.symlinkSync(
    path.join(other, 'node_modules'),
    path.join(tree, 'node_modules')
  )

  it('names what a linked install declares differently, before anything is absent', () => {
    const d = installDrift(tree)
    expect(d.from).toBe(fs.realpathSync(other))
    expect(d.changed).toEqual([
      'bumped 1 -> 2',
      'added - -> 1',
      'dropped 1 -> -',
    ])
  })

  it('is silent for a tree with its own install', () => {
    expect(installDrift(root)).toBeNull()
  })

  it('is silent when the linked package.json agrees', () => {
    const twin = path.join(root, 'twin')
    pkg(twin, { kept: '1', bumped: '1', dropped: '1' })
    fs.symlinkSync(
      path.join(other, 'node_modules'),
      path.join(twin, 'node_modules')
    )
    expect(installDrift(twin)).toBeNull()
  })

  it('keeps a report line short', () => {
    const line = driftLine({
      from: '/m',
      changed: ['a', 'b', 'c', 'd', 'e', 'f'],
    })
    expect(line).toBe('installed from /m: a, b, c, d (+2 more)')
  })
})
