import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * hdl_run answers "not installed" when the image lacks its tools, and the
 * engineers then can only say "не запускалось". The image must carry them.
 */
describe('the render image', () => {
  it('installs verilator, iverilog and yosys for hdl_run', () => {
    const docker = readFileSync(`${__dirname}/Dockerfile`, 'utf8')
    const apt = docker.slice(
      docker.indexOf('apt-get install'),
      docker.indexOf('rm -rf /var/lib/apt/lists')
    )
    for (const pkg of ['iverilog', 'verilator', 'yosys'])
      expect(apt, pkg).toMatch(new RegExp(`\\b${pkg}\\b`))
  })
})
