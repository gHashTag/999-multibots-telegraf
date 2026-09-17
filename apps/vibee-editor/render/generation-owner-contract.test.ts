import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(__dirname, 'render-server.ts'), 'utf8')

describe('generation job owner contract', () => {
  it('uses one verified owner namespace for native, web, and internal callers', () => {
    expect(source).toContain('function generationOwnerId(req: IncomingMessage)')
    /*
     * THE DIGEST MOVED WHERE IT CAN BE RUN.
     *
     * This used to match the sha-256 line inside the server, which is the
     * shape that goes red on a refactor and stays silent on a substitution.
     * The property -- an internal caller gets a namespace and never its own
     * key -- is now asserted by calling it, in
     * src/auth/service-owner.test.ts.
     *
     * Two things still belong here, and only here: that the server CALLS the
     * extracted function, and that it has not grown a second copy of the
     * digest. Neither is observable any other way while importing this file
     * starts a server.
     */
    expect(source).toContain('serviceOwnerFromKey(')
    expect(source).not.toContain("createHash('sha256').update(internalKey)")
    expect(source).toContain('const jobOwner = generationOwnerId(req)')
    expect(source).toContain("const job = startJob('video', jobOwner, prompt)")
    expect(source).toContain('const who = generationOwnerId(req)')
    expect(source).not.toContain(
      "startJob('video', verifiedViewerId(req) ?? '', prompt)"
    )
  })

  it('never stores a raw internal key as the owner', () => {
    const ownerFunction = source.slice(
      source.indexOf('function generationOwnerId'),
      source.indexOf(
        '/**\n * Прокси-картинки',
        source.indexOf('function generationOwnerId')
      )
    )
    expect(ownerFunction).toContain("createHash('sha256')")
    expect(ownerFunction).not.toMatch(/return\s+internalKey/)
    expect(ownerFunction).not.toMatch(/return\s+rawInternalKey/)
  })
})
