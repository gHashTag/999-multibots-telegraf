/**
 * THE SHARED PACKAGE IS COMPILED AS PART OF THIS SERVER, SO IT MUST SEE THIS
 * SERVER'S DEPENDENCIES.
 *
 * `tsconfig.json` maps `@vibee/atoms` to `../packages/vibee-atoms/src`, and
 * tsx follows that map at RUNTIME -- so those files are loaded from
 * /workspace/packages in the image, never from the copy `npm ci
 * --install-links` puts inside render/node_modules. Node then resolves their
 * bare imports by walking UP from /workspace/packages, where nothing is
 * installed.
 *
 * Measured 2026-09-23: the atoms barrel began re-exporting `storage.ts`,
 * which imports `jotai/utils`. The render server died at startup with
 * "Cannot find module 'jotai/utils'"; two deploys in a row FAILED and
 * /health kept answering 200 from the previous image, so main looked alive
 * while nothing it merged was being deployed.
 *
 * Two things are pinned here, because either one alone would have let it
 * through: the image gives that source a place to resolve from, and every
 * package it asks for is one this server actually installs.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const here = resolve(import.meta.dirname)
const ATOMS = resolve(here, '..', 'packages', 'vibee-atoms', 'src')
const dockerfile = readFileSync(resolve(here, 'Dockerfile'), 'utf8')
const pkg = JSON.parse(readFileSync(resolve(here, 'package.json'), 'utf8'))

describe('the image', () => {
  it('gives /workspace/packages somewhere to resolve from', () => {
    /*
     * A link to the server's own node_modules, or an install at /workspace:
     * either answers the question. What must not happen is neither, which is
     * the state that shipped the outage.
     */
    const line = dockerfile
      .split('\n')
      .find(l => /^RUN .*\/workspace\/node_modules/.test(l))
    expect(line, 'nothing creates /workspace/node_modules').toBeTruthy()
  })

  it('does it AFTER the install, or it would link to nothing', () => {
    const install = dockerfile.indexOf('npm ci --install-links')
    const link = dockerfile.search(/^RUN .*\/workspace\/node_modules/m)
    expect(install).toBeGreaterThan(-1)
    expect(link).toBeGreaterThan(install)
  })
})

/** Every bare package the shared source imports, ignoring type-only imports. */
function bareImportsOf(dir: string): Set<string> {
  const out = new Set<string>()
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, name.name)
    if (name.isDirectory()) {
      for (const one of bareImportsOf(path)) out.add(one)
      continue
    }
    if (!/\.(ts|tsx)$/.test(name.name) || /\.test\.tsx?$/.test(name.name))
      continue
    const src = readFileSync(path, 'utf8')
    for (const m of src.matchAll(
      /^\s*import\s+(?!type\s)[^'"]*from\s+['"]([^'"]+)['"]/gm
    )) {
      const spec = m[1]
      if (spec.startsWith('.') || spec.startsWith('/')) continue
      // "jotai/utils" is the package "jotai"; "@scope/name/sub" is "@scope/name".
      const parts = spec.split('/')
      out.add(spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0])
    }
  }
  return out
}

describe('what the shared package asks for', () => {
  const installed = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ])

  it('is installed by this server -- including jotai, the one that broke it', () => {
    const missing = [...bareImportsOf(ATOMS)].filter(
      name => !installed.has(name)
    )
    expect(
      missing,
      'the render loads this source at runtime and cannot resolve these'
    ).toEqual([])
    // Named on purpose: this is the import that took production down, and a
    // test that only computes a set would pass if the walker quietly found
    // nothing at all.
    expect(bareImportsOf(ATOMS).has('jotai')).toBe(true)
    expect(installed.has('jotai')).toBe(true)
  })
})
