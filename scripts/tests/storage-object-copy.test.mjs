#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { copyMissingObjects } = require('../storage-migration/copy-missing.cjs')
const {
  appendLedgerRecord,
  createLedger,
} = require('../storage-migration/object-ledger.cjs')
const {
  createObjectManifest,
} = require('../storage-migration/object-manifest.cjs')
const {
  reconcileObjectManifests,
} = require('../storage-migration/object-reconcile.cjs')

const bytes = Buffer.from('safe-object')
const digest = createHash('sha256').update(bytes).digest('hex')
const sourceEntry = {
  bucket: 'images',
  key: 'owner/asset.png',
  size: String(bytes.length),
  sha256: digest,
  mime: 'image/png',
  version: 'source-v1',
  orphanState: 'unknown',
}

const manifest = (side, entries) =>
  createObjectManifest({
    side,
    capturedAt: '2026-08-25T00:00:00.000Z',
    entries,
  })

const setup = () => {
  const source = manifest('source', [sourceEntry])
  const destination = manifest('destination', [])
  const reconciliation = reconcileObjectManifests(source, destination)
  const ledger = createLedger({
    sourceSeal: source.seal,
    destinationSeal: destination.seal,
    createdAt: '2026-08-25T00:00:00.000Z',
  })
  return { source, destination, reconciliation, ledger }
}

const body = value => Readable.from([value])

test('dry run performs no reads or writes and reports only counts', async () => {
  const state = setup()
  let calls = 0
  const store = new Proxy(
    {},
    {
      get() {
        return () => {
          calls += 1
        }
      },
    }
  )

  const result = await copyMissingObjects({
    ...state,
    sourceStore: store,
    destinationStore: store,
    apply: false,
  })

  assert.equal(calls, 0)
  assert.deepEqual(result.summary, {
    planned: 1,
    copied: 0,
    recoveredEqual: 0,
    skippedFromLedger: 0,
    failed: 0,
  })
  assert.doesNotMatch(JSON.stringify(result.summary), /owner|asset/)
})

test('apply verifies source, uses create-only put, verifies destination, and resumes', async () => {
  const state = setup()
  const calls = []
  let destinationBytes = null
  const sourceStore = {
    async getObject(input) {
      calls.push(['source.get', input])
      return {
        body: body(bytes),
        contentLength: bytes.length,
        contentType: 'image/png',
        version: 'source-v1',
      }
    },
  }
  const destinationStore = {
    async headObject(input) {
      calls.push(['destination.head', input])
      if (!destinationBytes) {
        const error = new Error('not found')
        error.code = 'NotFound'
        throw error
      }
      return {
        contentLength: destinationBytes.length,
        contentType: 'image/png',
      }
    },
    async putObject(input) {
      calls.push(['destination.put', { ...input, body: '<stream>' }])
      assert.equal(input.ifNoneMatch, '*')
      assert.equal(input.contentLength, bytes.length)
      assert.equal(input.metadata.sha256, digest)
      const chunks = []
      for await (const chunk of input.body) chunks.push(Buffer.from(chunk))
      destinationBytes = Buffer.concat(chunks)
    },
    async getObject(input) {
      calls.push(['destination.get', input])
      return {
        body: body(destinationBytes),
        contentLength: destinationBytes.length,
        contentType: 'image/png',
      }
    },
  }

  const applied = await copyMissingObjects({
    ...state,
    sourceStore,
    destinationStore,
    apply: true,
  })
  assert.deepEqual(applied.summary, {
    planned: 1,
    copied: 1,
    recoveredEqual: 0,
    skippedFromLedger: 0,
    failed: 0,
  })
  assert.equal(calls.filter(([name]) => name === 'destination.put').length, 1)

  const resumed = await copyMissingObjects({
    ...state,
    ledger: applied.ledger,
    sourceStore,
    destinationStore,
    apply: true,
  })
  assert.equal(resumed.summary.skippedFromLedger, 1)
  assert.equal(calls.filter(([name]) => name === 'destination.put').length, 1)
  assert.equal(calls.filter(([name]) => name === 'destination.head').length, 2)
  assert.equal(calls.filter(([name]) => name === 'destination.get').length, 2)
})

test('conflicts, forbidden HEAD, and source drift fail without PUT', async () => {
  for (const scenario of ['conflict', 'forbidden', 'source-drift']) {
    const state = setup()
    let putCalls = 0
    const destinationStore = {
      async headObject() {
        if (scenario === 'forbidden') {
          const error = new Error('secret provider detail')
          error.code = 'AccessDenied'
          throw error
        }
        const error = new Error('not found')
        error.code = 'NotFound'
        throw error
      },
      async putObject() {
        putCalls += 1
      },
    }
    const sourceStore = {
      async getObject() {
        const value =
          scenario === 'source-drift' ? Buffer.from('changed') : bytes
        return {
          body: body(value),
          contentLength: value.length,
          contentType: 'image/png',
          version: 'source-v1',
        }
      },
    }
    if (scenario === 'conflict') {
      destinationStore.headObject = async () => ({
        contentLength: bytes.length,
        contentType: 'image/png',
      })
      destinationStore.getObject = async () => ({
        body: body(Buffer.from('conflicting')),
        contentLength: Buffer.byteLength('conflicting'),
        contentType: 'image/png',
      })
    }

    await assert.rejects(
      copyMissingObjects({
        ...state,
        sourceStore,
        destinationStore,
        apply: true,
      }),
      error => {
        assert.match(error.message, /migration object failed/i)
        assert.doesNotMatch(error.message, /owner|asset|secret provider detail/)
        return true
      }
    )
    assert.equal(putCalls, 0)
  }
})

test('create-only race is recovered only when destination verifies equal', async () => {
  for (const equal of [true, false]) {
    const state = setup()
    const sourceStore = {
      async getObject() {
        return {
          body: body(bytes),
          contentLength: bytes.length,
          contentType: 'image/png',
          version: 'source-v1',
        }
      },
    }
    const destinationStore = {
      async headObject() {
        const error = new Error('not found')
        error.code = 'NotFound'
        throw error
      },
      async putObject() {
        const error = new Error('precondition')
        error.code = 'PreconditionFailed'
        throw error
      },
      async getObject() {
        const value = equal ? bytes : Buffer.from('race-conflict')
        return {
          body: body(value),
          contentLength: value.length,
          contentType: 'image/png',
        }
      },
    }

    if (equal) {
      const result = await copyMissingObjects({
        ...state,
        sourceStore,
        destinationStore,
        apply: true,
      })
      assert.equal(result.summary.recoveredEqual, 1)
    } else {
      await assert.rejects(
        copyMissingObjects({
          ...state,
          sourceStore,
          destinationStore,
          apply: true,
        }),
        /migration object failed/i
      )
    }
  }
})

test('every hung store and body phase stops at a referenced finite deadline', async () => {
  for (const phase of [
    'source-get',
    'source-body',
    'destination-head',
    'destination-get',
    'destination-body',
    'destination-put',
    'post-write-get',
    'post-write-body',
  ]) {
    const state = setup()
    const never = () => new Promise(() => {})
    let hungBody = null
    let uploadBody = null
    const sourceStore = {
      async getObject() {
        if (phase === 'source-get') return never()
        if (phase === 'source-body') {
          hungBody = new Readable({ read() {} })
        }
        return {
          body: hungBody ?? body(bytes),
          contentLength: bytes.length,
          contentType: 'image/png',
          version: 'source-v1',
        }
      },
    }
    const destinationStore = {
      async headObject() {
        if (phase === 'destination-head') return never()
        if (phase === 'destination-get' || phase === 'destination-body') {
          return { contentLength: bytes.length, contentType: 'image/png' }
        }
        const error = new Error('not found')
        error.code = 'NotFound'
        throw error
      },
      async getObject() {
        if (phase === 'destination-get' || phase === 'post-write-get')
          return never()
        if (phase === 'destination-body' || phase === 'post-write-body') {
          hungBody = new Readable({ read() {} })
          return {
            body: hungBody,
            contentLength: bytes.length,
            contentType: 'image/png',
          }
        }
        return {
          body: body(bytes),
          contentLength: bytes.length,
          contentType: 'image/png',
        }
      },
      async putObject(input) {
        uploadBody = input.body
        if (phase === 'destination-put') return never()
        for await (const _chunk of input.body) {
          // Consume the create-only upload before post-write verification.
        }
      },
    }

    const startedAt = Date.now()
    await assert.rejects(
      copyMissingObjects({
        ...state,
        sourceStore,
        destinationStore,
        apply: true,
        deadlineMs: 25,
      }),
      /migration object failed \(deadline\)/i
    )
    assert.ok(Date.now() - startedAt < 2_000)
    if (hungBody)
      assert.equal(hungBody.destroyed, true, `${phase} body must be destroyed`)
    if (uploadBody)
      assert.equal(
        uploadBody.destroyed,
        true,
        `${phase} upload must be destroyed`
      )
  }
})

test('oversized declared source fails before body consumption or destination write', async () => {
  const state = setup()
  let bodyRead = false
  let destinationCalls = 0
  const oversizedBody = new Readable({
    read() {
      bodyRead = true
      this.push(bytes)
      this.push(null)
    },
  })
  const sourceStore = {
    async getObject() {
      return {
        body: oversizedBody,
        contentLength: bytes.length,
        contentType: 'image/png',
        version: 'source-v1',
      }
    },
  }
  const destinationStore = new Proxy(
    {},
    {
      get() {
        return async () => {
          destinationCalls += 1
        }
      },
    }
  )

  await assert.rejects(
    copyMissingObjects({
      ...state,
      sourceStore,
      destinationStore,
      apply: true,
      maxObjectBytes: bytes.length - 1,
    }),
    /migration object failed \(object_too_large\)/i
  )
  assert.equal(bodyRead, false)
  assert.equal(oversizedBody.destroyed, true)
  assert.equal(destinationCalls, 0)
})

test('copy rejects toJSON reconciliation bypass and executes no forged candidate', async () => {
  const state = setup()
  const forged = structuredClone(state.reconciliation)
  forged.entries[0].source = {
    ...forged.entries[0].source,
    key: 'attacker/forged.png',
  }
  forged.toJSON = () => state.reconciliation
  let calls = 0
  const store = new Proxy(
    {},
    {
      get() {
        return async () => {
          calls += 1
        }
      },
    }
  )

  await assert.rejects(
    copyMissingObjects({
      ...state,
      reconciliation: forged,
      sourceStore: store,
      destinationStore: store,
      apply: true,
    }),
    /canonical|reconciliation does not match sealed manifests/i
  )
  assert.equal(calls, 0)
})

test('cleanup failure is redacted, fatal, and cannot append a success record', async () => {
  const state = setup()
  const tempRoot = await mkdtemp(join(tmpdir(), 'storage-cleanup-contract-'))
  let nowCalls = 0
  try {
    const sourceStore = {
      async getObject() {
        return {
          body: body(bytes),
          contentLength: bytes.length,
          contentType: 'image/png',
          version: 'source-v1',
        }
      },
    }
    const destinationStore = {
      async headObject() {
        return { contentLength: bytes.length, contentType: 'image/png' }
      },
      async getObject() {
        return {
          body: body(bytes),
          contentLength: bytes.length,
          contentType: 'image/png',
        }
      },
    }

    await assert.rejects(
      copyMissingObjects({
        ...state,
        sourceStore,
        destinationStore,
        apply: true,
        tempRoot,
        removeDirectory: async () => {
          throw new Error('provider-secret cleanup detail')
        },
        now: () => {
          nowCalls += 1
          return '2026-08-25T00:01:00.000Z'
        },
      }),
      error => {
        assert.match(error.message, /migration object failed \(cleanup\)/i)
        assert.doesNotMatch(error.message, /provider-secret/)
        return true
      }
    )
    assert.equal(nowCalls, 0)
    assert.equal(state.ledger.records.length, 0)
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
})

test('authorization status dominates ambiguous not-found and precondition signals', async () => {
  for (const phase of ['head', 'put']) {
    const state = setup()
    let putCalls = 0
    let getCalls = 0
    const sourceStore = {
      async getObject() {
        return {
          body: body(bytes),
          contentLength: bytes.length,
          contentType: 'image/png',
          version: 'source-v1',
        }
      },
    }
    const destinationStore = {
      async headObject() {
        const error = new Error('ambiguous provider detail')
        error.code = 'NotFound'
        error.$metadata = { httpStatusCode: phase === 'head' ? 403 : 404 }
        throw error
      },
      async putObject() {
        putCalls += 1
        const error = new Error('ambiguous provider detail')
        error.code = 'PreconditionFailed'
        error.$metadata = { httpStatusCode: 401 }
        throw error
      },
      async getObject() {
        getCalls += 1
        return {
          body: body(bytes),
          contentLength: bytes.length,
          contentType: 'image/png',
        }
      },
    }

    await assert.rejects(
      copyMissingObjects({
        ...state,
        sourceStore,
        destinationStore,
        apply: true,
      }),
      error => {
        assert.match(error.message, /migration object failed/i)
        assert.doesNotMatch(error.message, /ambiguous provider detail/)
        return true
      }
    )
    assert.equal(putCalls, phase === 'head' ? 0 : 1)
    assert.equal(getCalls, 0)
  }
})

test('ledger records must be a subset of source-only reconciliation entries', async () => {
  const state = setup()
  const extraneousLedger = appendLedgerRecord(state.ledger, {
    objectId: 'f'.repeat(64),
    action: 'copied_verified',
    recordedAt: '2026-08-25T00:01:00.000Z',
  })
  let calls = 0
  const store = new Proxy(
    {},
    {
      get() {
        return async () => {
          calls += 1
        }
      },
    }
  )

  await assert.rejects(
    copyMissingObjects({
      ...state,
      ledger: extraneousLedger,
      sourceStore: store,
      destinationStore: store,
      apply: true,
    }),
    /ledger.*source-only|subset/i
  )
  assert.equal(calls, 0)
})

test('completed ledger objects are reverified before they are skipped', async () => {
  for (const destinationState of ['missing', 'equal', 'conflict']) {
    const state = setup()
    const completedLedger = appendLedgerRecord(state.ledger, {
      objectId: state.reconciliation.entries[0].objectId,
      action: 'copied_verified',
      recordedAt: '2026-08-25T00:01:00.000Z',
    })
    let sourceCalls = 0
    let headCalls = 0
    let getCalls = 0
    let putCalls = 0
    const sourceStore = {
      async getObject() {
        sourceCalls += 1
        throw new Error(
          'source must not be read for completed ledger verification'
        )
      },
    }
    const destinationStore = {
      async headObject() {
        headCalls += 1
        if (destinationState === 'missing') {
          const error = new Error('not found')
          error.code = 'NotFound'
          throw error
        }
        const value =
          destinationState === 'equal' ? bytes : Buffer.from('conflict!!!')
        return { contentLength: value.length, contentType: 'image/png' }
      },
      async getObject() {
        getCalls += 1
        const value =
          destinationState === 'equal' ? bytes : Buffer.from('conflict!!!')
        return {
          body: body(value),
          contentLength: value.length,
          contentType: 'image/png',
        }
      },
      async putObject() {
        putCalls += 1
      },
    }

    const operation = copyMissingObjects({
      ...state,
      ledger: completedLedger,
      sourceStore,
      destinationStore,
      apply: true,
    })
    if (destinationState === 'equal') {
      const result = await operation
      assert.equal(result.summary.skippedFromLedger, 1)
    } else {
      await assert.rejects(
        operation,
        /ledger.*destination|migration object failed/i
      )
    }
    assert.equal(sourceCalls, 0)
    assert.equal(headCalls, 1)
    assert.equal(getCalls, destinationState === 'missing' ? 0 : 1)
    assert.equal(putCalls, 0)
  }
})
