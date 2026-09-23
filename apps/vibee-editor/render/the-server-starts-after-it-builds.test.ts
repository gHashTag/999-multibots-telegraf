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
 * It failed at 13:42 and was still failing three hours later, INVISIBLY: the
 * previous image kept answering /health, so production looked fine while no
 * deploy could reach it. That is the reason this file exists at all -- the
 * only signal was that merged work was not live.
 *
 * WHAT IS PINNED HERE, AND WHY IT IS NOT THE FLAG. `--install-links` is a flag
 * whose behaviour has already changed underneath us once; the thing that has
 * to be true is narrower and mechanical: source loaded from /workspace must be
 * able to resolve this application's dependencies. These tests pin THAT, not
 * the particular npm invocation that achieved it on the day.
 *
 * (An earlier version of this file pinned one specific line -- an extra
 * `npm i --prefix /workspace jotai`. It was replaced by a symlink that fixes
 * the whole class rather than one package, and the test went on asserting a
 * line that no longer existed. A test that names the remedy instead of the
 * requirement goes red on a better fix.)
 */

const DOCKERFILE = readFileSync(join(__dirname, 'Dockerfile'), 'utf8')

describe('the render image can start, not only build', () => {
  it('gives /workspace a node_modules, because tsx loads source from there', () => {
    // tsconfig maps '@vibee/atoms' to '../packages/vibee-atoms/src', so at
    // RUNTIME those files are read from /workspace/packages -- never from the
    // copy inside render/node_modules. Resolution walks up and must find
    // something.
    expect(DOCKERFILE).toMatch(
      /RUN ln -sfn \/workspace\/render\/node_modules \/workspace\/node_modules/
    )
  })

  it('keeps --install-links, and the link comes after it', () => {
    expect(DOCKERFILE).toContain('npm ci --install-links')
    // The link points AT render/node_modules, so that directory has to be
    // populated first or it points at nothing.
    expect(
      DOCKERFILE.indexOf('ln -sfn /workspace/render/node_modules')
    ).toBeGreaterThan(DOCKERFILE.indexOf('npm ci --install-links'))
  })

  it('installs the shared package’s own dependencies, dev ones included', () => {
    // In @vibee/atoms jotai is a peer dependency and a dev one, and nothing
    // else: --omit=dev installed NOTHING, and the render still could not boot.
    // Measured on the deploy that followed.
    const atoms = DOCKERFILE.indexOf('WORKDIR /workspace/packages/vibee-atoms')
    expect(atoms).toBeGreaterThan(-1)
    const line = DOCKERFILE.slice(atoms, atoms + 400).match(
      /RUN npm ci[^\n]*/
    )?.[0]
    expect(line).toBeTruthy()
    expect(line).not.toContain('--omit=dev')
  })

  it('names the module the server actually failed on', () => {
    // Somebody reading these lines in a year needs to know which import chain
    // they are protecting, not just that a path was linked.
    expect(DOCKERFILE).toContain("jotai/utils'")
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
