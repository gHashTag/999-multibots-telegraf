#!/usr/bin/env node
'use strict'

const {
  ReconciliationError,
  reconcileDocument,
} = require('./reconciliation-core.cjs')

const MAX_INPUT_BYTES = 16 * 1024 * 1024

function emit(stream, value) {
  stream.write(`${JSON.stringify(value)}\n`)
}

function publicError(error) {
  if (error instanceof ReconciliationError) return error.toJSON()
  return {
    code: 'E_INTERNAL',
    message: 'reconciliation failed safely',
    details: {},
  }
}

async function readStdin() {
  process.stdin.setEncoding('utf8')
  let text = ''
  let bytes = 0
  for await (const chunk of process.stdin) {
    bytes += Buffer.byteLength(chunk, 'utf8')
    if (bytes > MAX_INPUT_BYTES) {
      throw new ReconciliationError(
        'E_INPUT_TOO_LARGE',
        'JSON input exceeds the dry-run limit'
      )
    }
    text += chunk
  }
  return text
}

async function main(argv = process.argv.slice(2)) {
  if (argv.length > 1 || (argv.length === 1 && argv[0] !== '-')) {
    emit(process.stderr, {
      ok: false,
      error: {
        code: 'E_USAGE',
        message: 'pass the reconciliation JSON on stdin',
        details: {},
      },
    })
    return 2
  }

  try {
    const raw = await readStdin()
    let document
    try {
      document = JSON.parse(raw)
    } catch {
      throw new ReconciliationError('E_JSON_INVALID', 'stdin is not valid JSON')
    }
    emit(process.stdout, { ok: true, result: reconcileDocument(document) })
    return 0
  } catch (error) {
    emit(process.stderr, { ok: false, error: publicError(error) })
    return 1
  }
}

if (require.main === module) {
  main().then(code => {
    process.exitCode = code
  })
}

module.exports = { main }
