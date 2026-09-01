#!/usr/bin/env node

import pg from 'pg'

const connectionString =
  process.env.DATABASE_PRIVATE_URL || process.env.DATABASE_URL || ''

if (!connectionString) {
  console.error(
    'agent conversation schema preflight: database is not configured'
  )
  process.exit(2)
}

const client = new pg.Client({
  connectionString,
  ssl: connectionString.includes('localhost')
    ? undefined
    : { rejectUnauthorized: false },
})

try {
  await client.connect()
  const { rows } = await client.query(`
    SELECT table_name, column_name
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN (
         'agent_conversation_messages',
         'agent_conversation_state'
       )
  `)
  const present = new Set(
    rows.map(row => `${row.table_name}.${row.column_name}`)
  )
  const required = [
    'agent_conversation_messages.id',
    'agent_conversation_messages.telegram_id',
    'agent_conversation_messages.channel',
    'agent_conversation_messages.external_id',
    'agent_conversation_messages.role',
    'agent_conversation_messages.content',
    'agent_conversation_messages.metadata',
    'agent_conversation_messages.created_at',
    'agent_conversation_state.telegram_id',
    'agent_conversation_state.epoch',
    'agent_conversation_state.cleared_at',
  ]
  if (!required.every(column => present.has(column))) {
    console.error('agent conversation schema preflight: migration is missing')
    process.exitCode = 3
  } else {
    console.log('agent conversation schema preflight: ok')
  }
} catch {
  console.error('agent conversation schema preflight: database check failed')
  process.exitCode = 4
} finally {
  await client.end().catch(() => undefined)
}
