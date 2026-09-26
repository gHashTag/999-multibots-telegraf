import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The coding scientist's code_run needs Deno in the service image. If this
 * line goes missing the tool would say "not installed" in production while
 * every unit test here stays green (they inject a fake exec). So the image is
 * asserted directly, the same guard hdl-run-in-the-image.test.ts keeps for
 * verilator/iverilog/yosys.
 */
describe('the render image', () => {
  it('installs Deno for code_run', () => {
    const dockerfile = readFileSync(`${__dirname}/Dockerfile`, 'utf8')
    expect(dockerfile).toMatch(/deno/i)
    // Pinned, not "latest": a silent major bump could change the sandbox flags.
    expect(dockerfile).toMatch(/DENO_VERSION=v\d+\.\d+\.\d+/)
    // On PATH so execFile finds it by name.
    expect(dockerfile).toMatch(/\/usr\/local\/bin/)
  })

  it('installs python3 and util-linux (unshare/prlimit) for the python sandbox', () => {
    const dockerfile = readFileSync(`${__dirname}/Dockerfile`, 'utf8')
    // Without these, code_run's py branch says "not installed" and the coder
    // must answer "did not run" rather than run python unsandboxed.
    expect(dockerfile).toMatch(/python3/)
    expect(dockerfile).toMatch(/util-linux/)
  })
})
