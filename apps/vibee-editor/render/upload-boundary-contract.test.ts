import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(__dirname, 'render-server.ts'), 'utf8')
const start = source.indexOf("req.url === '/upload'")
const end = source.indexOf('// List S3 assets', start)
const upload = source.slice(start, end)

describe('authenticated asset upload boundary', () => {
  it('rejects declared and streamed bodies before retaining more than 100 MB', () => {
    expect(upload).toContain("req.headers['content-length']")
    expect(upload).toContain('declaredSize > maxSize')
    expect(upload).toContain('receivedSize > maxSize')
    expect(upload).toContain('chunks.length = 0')
    expect(upload).toContain('res.writeHead(413')
  })

  it('does not let a client filename create an arbitrary object path', () => {
    expect(upload).toMatch(/path\s*\.basename\(rawFilename\)/)
    expect(upload).toContain(".replace(/[^a-zA-Z0-9._-]+/g, '-')")
    expect(upload).toContain('.slice(0, 160)')
  })
})
