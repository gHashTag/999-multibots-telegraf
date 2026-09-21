import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EXTERNAL_TOOLS } from './src/agent/media-extract'

/**
 * EVERY READER'S BINARY IS IN THE IMAGE.
 *
 * The file readers spawn `pdftotext`, `bsdtar` and `ffmpeg`. A laptop that
 * happens to have them passes every test; a production image without them
 * refuses every PDF with "the reader is not installed". Nothing but this file
 * connects the two, so it reads the apt line of the render Dockerfile -- the
 * image Railway builds (render/railway.toml) -- and holds it to the list the
 * code itself declares.
 */
const dockerfile = readFileSync(
  new URL('./Dockerfile', import.meta.url),
  'utf8'
)

/** The packages of the one `apt-get install` line, continuation lines joined. */
function aptPackages(text: string): Set<string> {
  const joined = text.replace(/\\\n/g, ' ')
  const line = /apt-get install[^\n&]*/.exec(joined)?.[0] ?? ''
  return new Set(line.split(/\s+/).filter(w => w && !w.startsWith('-')))
}

describe('the render image carries the file readers', () => {
  it('installs the package of every binary the readers spawn', () => {
    const installed = aptPackages(dockerfile)
    expect(Object.keys(EXTERNAL_TOOLS).sort()).toEqual([
      'bsdtar',
      'ffmpeg',
      'pdftotext',
    ])
    for (const [tool, pkg] of Object.entries(EXTERNAL_TOOLS)) {
      expect(installed, `${tool} needs ${pkg} in render/Dockerfile`).toContain(
        pkg
      )
    }
  })
})
