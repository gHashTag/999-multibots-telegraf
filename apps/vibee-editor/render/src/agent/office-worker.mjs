/**
 * THE THREAD AN OFFICE FILE IS PARSED IN -- see `officeTextIsolated` in
 * media-extract.ts and the protocol in isolated-reader.ts.
 *
 * Plain JavaScript on purpose. A worker thread does not inherit the
 * TypeScript loader the server runs under, so this file asks tsx for exactly
 * one module, office-text.ts, which imports nothing but Node. Whatever that
 * module does with the bytes, it does it here: out of time or out of heap,
 * this thread is terminated and the server goes on.
 */
import { parentPort } from 'node:worker_threads'
import { tsImport } from 'tsx/esm/api'

const { officeText } = await tsImport('./office-text.ts', import.meta.url)

parentPort.on('message', message => {
  const { id, job } = message ?? {}
  let result
  try {
    // A Buffer arrives as a plain Uint8Array; the parser reads Buffer methods.
    const bytes = Buffer.from(
      job.bytes.buffer,
      job.bytes.byteOffset,
      job.bytes.byteLength
    )
    result = officeText(bytes, String(job.ext))
  } catch {
    result = { ok: false, reason: 'damaged' }
  }
  parentPort.postMessage({ id, result })
})
parentPort.postMessage({ ready: true })
