import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(__dirname, 'render-server.ts'), 'utf8')
const start = source.indexOf("req.url === '/upload'")
const end = source.indexOf('// List S3 assets', start)
const upload = source.slice(start, end)

describe('authenticated asset upload boundary', () => {
  it('rejects declared and streamed bodies without buffering the request', () => {
    expect(upload).toContain("req.headers['content-length']")
    expect(upload).toContain('declaredSize > maxSize')
    expect(upload).toContain('uploadRequestToS3(')
    expect(upload).not.toContain('Buffer.concat')
    expect(upload).not.toContain('chunks.push')
    expect(source).toContain("path.join(os.tmpdir(), 'vibee-upload-')")
    expect(source).toContain('fs.createWriteStream(tempFile')
    expect(source).toContain('Body: fs.createReadStream(tempFile)')
    expect(source).toContain('ContentLength: receivedBytes()')
    expect(source).toContain('queueSize: 1')
    expect(source).toContain('fs.promises.rm(tempDir')
    expect(upload).toContain('res.writeHead(413')
  })

  it('limits concurrent direct callers before consuming their request bodies', () => {
    expect(upload).toContain('uploadConcurrency.tryAcquire()')
    expect(upload).toContain('res.writeHead(429')
    expect(upload).toContain("'Retry-After': '5'")
    expect(upload).toContain('releaseUpload()')
  })

  it('does not let a client filename create an arbitrary object path', () => {
    expect(upload).toMatch(/path\s*\.basename\(rawFilename\)/)
    expect(upload).toContain(".replace(/[^a-zA-Z0-9._-]+/g, '-')")
    expect(upload).toContain('.slice(0, 160)')
  })
})
