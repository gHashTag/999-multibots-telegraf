/**
 * A WORKER THAT MISBEHAVES ON REQUEST, for isolated-reader.test.ts.
 *
 * It speaks the protocol of src/agent/isolated-reader.ts and does, to the
 * thread it runs in, what a hostile file can make a parser do: spin forever,
 * or allocate until the heap is gone. The test proves the server's thread
 * does not notice either.
 */
import { parentPort } from 'node:worker_threads'

parentPort.on('message', ({ id, job }) => {
  if (job === 'spin') {
    for (;;) {
      /* a parser that never finds its closing tag */
    }
  }
  if (job === 'hog') {
    const kept = []
    for (;;) kept.push(new Array(1024 * 1024).fill(kept.length))
  }
  if (job === 'late-throw') {
    // Answers, THEN dies -- while no job is waiting on this thread.
    parentPort.postMessage({ id, result: `echo:${job}` })
    setTimeout(() => {
      throw new Error('died between jobs')
    }, 20)
    return
  }
  if (job === 'silent') {
    parentPort.postMessage({ id })
    return
  }
  parentPort.postMessage({ id, result: `echo:${job}` })
})
parentPort.postMessage({ ready: true })
