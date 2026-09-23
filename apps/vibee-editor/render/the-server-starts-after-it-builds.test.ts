import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A BUILD THAT PASSES AND A SERVER THAT DOES NOT START.
 *
 * MEASURED 2026-09-23. vibee-render built cleanly, pushed its image, and then
 * died on every boot:
 *
 *   Error: Cannot find module 'jotai/utils'
 *     requireStack: /workspace/packages/vibee-atoms/src/storage.ts
 *                   /workspace/packages/vibee-atoms/src/index.ts
 *                   /workspace/render/src/constants/captions.ts
 *                   ... /workspace/render/render-server.ts
 *
 * Nothing in this repository had changed: the Dockerfile relies on
 * `--install-links` to COPY the local @vibee/atoms package into
 * render/node_modules, where jotai is resolvable, while the lockfile records
 * that same dependency as `link: true`. When npm honours the lockfile instead,
 * resolution walks up from /workspace/packages/vibee-atoms/src, finds no
 * node_modules on the way, and the process exits before it opens a port.
 *
 * It failed at 13:42 and was still failing three hours later, invisibly: the
 * previous image kept answering /health, so production looked fine while no
 * deploy could reach it.
 *
 * This test pins the second half of the fix -- the copy at the path that
 * resolution actually looks at -- because the first half is a flag whose
 * behaviour has already changed once underneath us.
 */

const DOCKERFILE = readFileSync(join(__dirname, 'Dockerfile'), 'utf8')

describe('the render image can start, not only build', () => {
  it('installs jotai where a linked @vibee/atoms resolves it', () => {
    expect(DOCKERFILE).toMatch(/RUN npm i --prefix \/workspace[^\n]*\bjotai@/)
  })

  it('keeps --install-links too: the copy is still the fast path', () => {
    expect(DOCKERFILE).toContain('npm ci --install-links')
    // Order matters: the fallback is for the case where the line above did
    // not copy, so it has to run after it.
    expect(DOCKERFILE.indexOf('npm i --prefix /workspace')).toBeGreaterThan(
      DOCKERFILE.indexOf('npm ci --install-links')
    )
  })

  it('names the module the server actually failed on', () => {
    // Somebody reading this line in a year needs to know which import chain
    // it is protecting, not just that a package is installed twice.
    expect(DOCKERFILE).toContain("Cannot find module 'jotai/utils'")
  })

  it('and the chain still starts where it started: the atoms index', () => {
    // If the render ever stops importing @vibee/atoms at startup, this whole
    // guard is dead weight and should go with it.
    const captions = readFileSync(
      join(__dirname, 'src', 'constants', 'captions.ts'),
      'utf8'
    )
    expect(captions).toContain('@vibee/atoms')
  })
})
