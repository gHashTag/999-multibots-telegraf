import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(__dirname, 'render-server.ts'), 'utf8')

describe('generation job owner contract', () => {
  it('uses one verified owner namespace for native, web, and internal callers', () => {
    expect(source).toContain('function generationOwnerId(req: IncomingMessage)')
    expect(source).toContain("return `service:${createHash('sha256')")
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
