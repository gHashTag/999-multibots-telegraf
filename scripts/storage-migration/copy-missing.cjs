'use strict'

const { createHash, randomUUID } = require('node:crypto')
const { createReadStream, createWriteStream } = require('node:fs')
const { mkdir, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { Readable, Transform } = require('node:stream')
const { pipeline } = require('node:stream/promises')
const { isDeepStrictEqual } = require('node:util')
const {
  appendLedgerRecord,
  normalizeVerifiedLedger,
} = require('./object-ledger.cjs')
const { normalizeVerifiedObjectManifest } = require('./object-manifest.cjs')
const {
  normalizeReconciliation,
  reconcileObjectManifests,
  summarizeReconciliation,
} = require('./object-reconcile.cjs')

const DEFAULT_MAX_OBJECT_BYTES = 512n * 1024n * 1024n
const DEFAULT_DEADLINE_MS = 60_000

class MigrationObjectError extends Error {
  constructor(reason) {
    super(`Migration object failed (${reason})`)
    this.name = 'MigrationObjectError'
    this.reason = reason
  }
}

function fail(reason) {
  throw new MigrationObjectError(reason)
}

function httpStatusCode(error) {
  const value =
    error?.$metadata?.httpStatusCode ?? error?.statusCode ?? error?.status
  const number = Number(value)
  return Number.isInteger(number) ? number : null
}

function isAuthorizationFailure(error) {
  const status = httpStatusCode(error)
  if (status === 401 || status === 403) return true
  return (
    ['AccessDenied', 'Unauthorized', 'Forbidden'].includes(error?.code) ||
    ['AccessDenied', 'Unauthorized', 'Forbidden'].includes(error?.name)
  )
}

function isNotFound(error) {
  if (isAuthorizationFailure(error)) return false
  const status = httpStatusCode(error)
  if (status !== null) return status === 404
  return (
    error?.code === 'NotFound' ||
    error?.code === 'NoSuchKey' ||
    error?.name === 'NotFound'
  )
}

function isPreconditionFailed(error) {
  if (isAuthorizationFailure(error)) return false
  const status = httpStatusCode(error)
  if (status !== null) return status === 412
  return (
    error?.code === 'PreconditionFailed' || error?.name === 'PreconditionFailed'
  )
}

function toNodeReadable(body) {
  if (body instanceof Readable) return body
  if (body && typeof body.getReader === 'function' && Readable.fromWeb) {
    return Readable.fromWeb(body)
  }
  if (
    body &&
    (typeof body[Symbol.asyncIterator] === 'function' ||
      typeof body[Symbol.iterator] === 'function')
  ) {
    return Readable.from(body)
  }
  fail('invalid_body')
}

function destroyBody(body) {
  try {
    const stream = toNodeReadable(body)
    if (!stream.destroyed) stream.destroy()
  } catch {
    // Resource disposal never exposes provider/body details.
  }
}

function abortable(operation, signal, reason = 'deadline') {
  if (signal.aborted) return Promise.reject(new MigrationObjectError(reason))
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new MigrationObjectError(reason))
    signal.addEventListener('abort', onAbort, { once: true })
    Promise.resolve(operation)
      .then(resolve, reject)
      .finally(() => {
        signal.removeEventListener('abort', onAbort)
      })
  })
}

function checkedLength(value, maxBytes) {
  if (
    (typeof value !== 'number' &&
      typeof value !== 'bigint' &&
      typeof value !== 'string') ||
    !/^(?:0|[1-9][0-9]*)$/.test(String(value))
  ) {
    fail('invalid_length')
  }
  const length = BigInt(value)
  if (length > maxBytes) fail('object_too_large')
  return length
}

function contentType(value) {
  if (typeof value !== 'string' || value.trim() === '') fail('invalid_mime')
  return value.split(';', 1)[0].trim().toLowerCase()
}

async function hashBody(
  response,
  { maxBytes, expectedSize, outputPath, signal }
) {
  const source = toNodeReadable(response.body)
  const streams = [source]
  try {
    const declared = checkedLength(response.contentLength, maxBytes)
    if (declared !== expectedSize) fail('size_drift')
    const hash = createHash('sha256')
    let observed = 0n
    const meter = new Transform({
      transform(chunk, _encoding, callback) {
        const bytes = Buffer.from(chunk)
        observed += BigInt(bytes.length)
        if (observed > maxBytes || observed > expectedSize) {
          callback(new MigrationObjectError('body_too_large'))
          return
        }
        hash.update(bytes)
        callback(null, bytes)
      },
    })
    const sink = outputPath
      ? createWriteStream(outputPath, { flags: 'wx', mode: 0o600 })
      : new Transform({
          transform(chunk, _encoding, callback) {
            callback()
          },
        })
    streams.push(meter, sink)
    await pipeline(...streams, { signal })
    if (observed !== expectedSize) fail('body_truncated')
    return {
      sha256: hash.digest('hex'),
      size: observed,
      mime: contentType(response.contentType),
    }
  } catch (error) {
    if (error instanceof MigrationObjectError) throw error
    if (signal.aborted) fail('deadline')
    fail('body_read')
  } finally {
    for (const stream of streams) {
      if (typeof stream.destroy === 'function' && !stream.destroyed)
        stream.destroy()
    }
  }
}

async function inspectDestination(destinationStore, entry, options) {
  let head
  try {
    head = await abortable(
      destinationStore.headObject({
        bucket: entry.bucket,
        key: entry.key,
        signal: options.signal,
      }),
      options.signal
    )
  } catch (error) {
    if (error instanceof MigrationObjectError) throw error
    if (isNotFound(error)) return { state: 'missing' }
    fail('destination_head')
  }
  checkedLength(head.contentLength, options.maxBytes)
  let response
  try {
    response = await abortable(
      destinationStore.getObject({
        bucket: entry.bucket,
        key: entry.key,
        signal: options.signal,
      }),
      options.signal
    )
  } catch (error) {
    if (error instanceof MigrationObjectError) throw error
    fail('destination_get')
  }
  const verified = await hashBody(response, {
    ...options,
    expectedSize: BigInt(entry.size),
  })
  const equal = verified.sha256 === entry.sha256 && verified.mime === entry.mime
  return { state: equal ? 'equal' : 'conflict' }
}

async function cleanupDirectory(objectDirectory, removeDirectory, deadlineMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), deadlineMs)
  try {
    await abortable(
      Promise.resolve().then(() =>
        removeDirectory(objectDirectory, { recursive: true, force: true })
      ),
      controller.signal,
      'cleanup'
    )
  } catch {
    fail('cleanup')
  } finally {
    clearTimeout(timer)
  }
}

async function copyOne({
  entry,
  sourceStore,
  destinationStore,
  tempRoot,
  maxBytes,
  deadlineMs,
  removeDirectory,
}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), deadlineMs)
  const objectDirectory = join(tempRoot, `object-${randomUUID()}`)
  const spoolPath = join(objectDirectory, 'payload')
  let uploadBody = null
  try {
    await mkdir(objectDirectory, { recursive: false, mode: 0o700 })
    let sourceResponse
    try {
      sourceResponse = await abortable(
        sourceStore.getObject({
          bucket: entry.bucket,
          key: entry.key,
          version: entry.version,
          signal: controller.signal,
        }),
        controller.signal
      )
    } catch (error) {
      if (error instanceof MigrationObjectError) throw error
      fail('source_get')
    }
    if (entry.version !== null && sourceResponse.version !== entry.version) {
      destroyBody(sourceResponse.body)
      fail('source_version_drift')
    }
    const verifiedSource = await hashBody(sourceResponse, {
      maxBytes,
      expectedSize: BigInt(entry.size),
      outputPath: spoolPath,
      signal: controller.signal,
    })
    if (
      verifiedSource.sha256 !== entry.sha256 ||
      verifiedSource.mime !== entry.mime
    ) {
      fail('source_drift')
    }

    const existing = await inspectDestination(destinationStore, entry, {
      maxBytes,
      signal: controller.signal,
    })
    if (existing.state === 'equal') return 'recovered_equal'
    if (existing.state === 'conflict') fail('destination_conflict')

    try {
      uploadBody = createReadStream(spoolPath)
      await abortable(
        destinationStore.putObject({
          bucket: entry.bucket,
          key: entry.key,
          body: uploadBody,
          contentLength: Number(BigInt(entry.size)),
          contentType: entry.mime,
          ifNoneMatch: '*',
          metadata: { sha256: entry.sha256 },
          signal: controller.signal,
        }),
        controller.signal
      )
    } catch (error) {
      if (error instanceof MigrationObjectError) throw error
      if (!isPreconditionFailed(error)) fail('destination_put')
      const raced = await inspectDestinationAfterRace(destinationStore, entry, {
        maxBytes,
        signal: controller.signal,
      })
      if (raced.state !== 'equal') fail('destination_race_conflict')
      return 'recovered_equal'
    } finally {
      if (uploadBody && !uploadBody.destroyed) uploadBody.destroy()
    }

    const postWrite = await inspectDestinationAfterRace(
      destinationStore,
      entry,
      {
        maxBytes,
        signal: controller.signal,
      }
    )
    if (postWrite.state !== 'equal') fail('post_write_verify')
    return 'copied_verified'
  } finally {
    clearTimeout(timer)
    if (uploadBody && !uploadBody.destroyed) uploadBody.destroy()
    await cleanupDirectory(objectDirectory, removeDirectory, deadlineMs)
  }
}

async function reverifyCompletedObject({
  entry,
  destinationStore,
  maxBytes,
  deadlineMs,
}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), deadlineMs)
  try {
    const destination = await inspectDestination(destinationStore, entry, {
      maxBytes,
      signal: controller.signal,
    })
    if (destination.state === 'missing') fail('ledger_destination_missing')
    if (destination.state !== 'equal') fail('ledger_destination_conflict')
  } finally {
    clearTimeout(timer)
  }
}

async function inspectDestinationAfterRace(destinationStore, entry, options) {
  let response
  try {
    response = await abortable(
      destinationStore.getObject({
        bucket: entry.bucket,
        key: entry.key,
        signal: options.signal,
      }),
      options.signal
    )
  } catch (error) {
    if (error instanceof MigrationObjectError) throw error
    fail('destination_get')
  }
  const verified = await hashBody(response, {
    ...options,
    expectedSize: BigInt(entry.size),
  })
  return {
    state:
      verified.sha256 === entry.sha256 && verified.mime === entry.mime
        ? 'equal'
        : 'conflict',
  }
}

async function copyMissingObjects({
  source,
  destination,
  reconciliation,
  ledger,
  sourceStore,
  destinationStore,
  apply = false,
  tempRoot = tmpdir(),
  maxObjectBytes = DEFAULT_MAX_OBJECT_BYTES,
  deadlineMs = DEFAULT_DEADLINE_MS,
  removeDirectory = rm,
  now = () => new Date().toISOString(),
}) {
  const normalizedSource = normalizeVerifiedObjectManifest(source)
  const normalizedDestination = normalizeVerifiedObjectManifest(destination)
  const normalizedLedger = normalizeVerifiedLedger(ledger)
  const normalizedReconciliation = normalizeReconciliation(reconciliation)
  if (
    normalizedReconciliation.sourceSeal !== normalizedSource.seal ||
    normalizedReconciliation.destinationSeal !== normalizedDestination.seal ||
    normalizedLedger.sourceSeal !== normalizedSource.seal ||
    normalizedLedger.destinationSeal !== normalizedDestination.seal
  ) {
    throw new Error('Migration evidence is not bound to the supplied manifests')
  }
  const expectedReconciliation = reconcileObjectManifests(
    normalizedSource,
    normalizedDestination
  )
  if (!isDeepStrictEqual(normalizedReconciliation, expectedReconciliation)) {
    throw new Error('Reconciliation does not match sealed manifests')
  }
  const reconciliationSummary = summarizeReconciliation(expectedReconciliation)
  if (!reconciliationSummary.copyAllowed) {
    throw new Error(
      'Migration copy blocked by conflicts or unverifiable objects'
    )
  }
  const pending = expectedReconciliation.entries.filter(
    entry => entry.state === 'source_only'
  )
  const pendingIds = new Set(pending.map(entry => entry.objectId))
  if (
    normalizedLedger.records.some(record => !pendingIds.has(record.objectId))
  ) {
    throw new Error('Ledger records must be a subset of source-only objects')
  }
  const summary = {
    planned: pending.length,
    copied: 0,
    recoveredEqual: 0,
    skippedFromLedger: 0,
    failed: 0,
  }
  if (!apply) return { summary, ledger: normalizedLedger }

  const maxBytes = checkedLength(maxObjectBytes, BigInt('9007199254740991'))
  if (!Number.isInteger(deadlineMs) || deadlineMs < 1) {
    throw new TypeError('deadlineMs must be a positive integer')
  }
  const completed = new Set(
    normalizedLedger.records.map(record => record.objectId)
  )
  let nextLedger = normalizedLedger
  for (const candidate of pending) {
    try {
      if (completed.has(candidate.objectId)) {
        await reverifyCompletedObject({
          entry: candidate.source,
          destinationStore,
          maxBytes,
          deadlineMs,
        })
        summary.skippedFromLedger += 1
        continue
      }
      const action = await copyOne({
        entry: candidate.source,
        sourceStore,
        destinationStore,
        tempRoot,
        maxBytes,
        deadlineMs,
        removeDirectory,
      })
      nextLedger = appendLedgerRecord(nextLedger, {
        objectId: candidate.objectId,
        action,
        recordedAt: now(),
      })
      if (action === 'copied_verified') summary.copied += 1
      else summary.recoveredEqual += 1
    } catch (error) {
      summary.failed += 1
      if (error instanceof MigrationObjectError) throw error
      fail('unexpected')
    }
  }
  return { summary, ledger: nextLedger }
}

module.exports = {
  MigrationObjectError,
  copyMissingObjects,
}
