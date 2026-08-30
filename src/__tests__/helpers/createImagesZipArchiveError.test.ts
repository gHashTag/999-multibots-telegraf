/**
 * createImagesZip piped an archiver into a write stream and only handled the
 * WRITE stream's 'error' event -- the archiver's own 'error' event had NO
 * listener. archiver emits an 'error' EVENT (separate from finalize()'s promise
 * rejection) on a bad buffer / zlib failure; an EventEmitter 'error' with no
 * listener becomes an uncaughtException that crashes the whole process, killing
 * every bot (same class as #1234). The images come from user uploads
 * (uploadTrainFluxModelScene), so a malformed buffer is a live trigger.
 *
 * Fix: register archive.on('error', reject) (and output error/close) inside one
 * Promise BEFORE pipe/append/finalize, and use finalize().catch(reject). Then any
 * archiver error rejects the promise (caught by the caller) instead of crashing.
 *
 * Source seam: an archive 'error' listener exists and appears before finalize.
 * Mutation (removing it) fails the test.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

const code = () =>
  stripComments(
    fs.readFileSync(
      path.join(
        __dirname,
        '..',
        '..',
        'helpers',
        'images',
        'createImagesZip.ts'
      ),
      'utf8'
    )
  )

describe('createImagesZip handles the archiver error event (no process crash)', () => {
  it("registers archive.on('error', ...) before finalize", () => {
    const s = code()
    const onError = s.search(/archive\.on\(\s*['"]error['"]/)
    expect(
      onError,
      "no archive.on('error') listener -- an archiver error crashes the process"
    ).toBeGreaterThan(-1)
    const finalize = s.indexOf('archive.finalize(')
    expect(finalize, 'no archive.finalize call').toBeGreaterThan(-1)
    expect(
      onError < finalize,
      "archive 'error' listener is registered after finalize -- too late to catch append/finalize errors"
    ).toBe(true)
  })
})
