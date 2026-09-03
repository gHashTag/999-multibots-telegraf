/**
 * Canonical Trinity-agent transcript shared by Telegram and the Mini App.
 *
 * The verified Telegram owner is always supplied by a trusted transport. This
 * module deliberately has no request/body parsing and therefore no alternate
 * client-owned identity path.
 */

export type ConversationChannel = 'mini_app' | 'telegram'
export type ConversationRole = 'user' | 'assistant'

export interface ConversationMessage {
  id: string
  telegramId: string
  channel: ConversationChannel
  externalId: string
  role: ConversationRole
  content: string
  metadata: Record<string, unknown>
  createdAt: string
}

export interface ConversationPool {
  query(sql: string, values?: unknown[]): Promise<{ rows: any[] }>
  connect?: () => Promise<{
    query(sql: string, values?: unknown[]): Promise<{ rows: any[] }>
    release(): void
  }>
}

export interface AppendConversationMessage {
  telegramId: string
  channel: ConversationChannel
  externalId: string
  role: ConversationRole
  content: string
  metadata?: Record<string, unknown>
}

const schemaReady = new WeakSet<object>()
const MAX_CONCURRENT_OWNER_TURNS = 4
let activeOwnerTurns = 0
const ownerTurnWaiters: Array<{
  grant: () => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}> = []

async function acquireOwnerTurnSlot(): Promise<() => void> {
  if (activeOwnerTurns < MAX_CONCURRENT_OWNER_TURNS) {
    activeOwnerTurns += 1
    return releaseOwnerTurnSlot
  }
  return new Promise((resolve, reject) => {
    const waiter = {
      grant: () => resolve(releaseOwnerTurnSlot),
      reject,
      timer: setTimeout(() => {
        const index = ownerTurnWaiters.indexOf(waiter)
        if (index >= 0) ownerTurnWaiters.splice(index, 1)
        reject(new Error('conversation capacity is busy'))
      }, 30_000),
    }
    ownerTurnWaiters.push(waiter)
  })
}

function releaseOwnerTurnSlot(): void {
  const next = ownerTurnWaiters.shift()
  if (next) {
    clearTimeout(next.timer)
    next.grant()
    return
  }
  activeOwnerTurns = Math.max(0, activeOwnerTurns - 1)
}

function boundedLabel(value: string, name: string, max: number): string {
  const clean = value.trim()
  if (!clean || clean.length > max || /[\u0000-\u001f]/.test(clean)) {
    throw new Error(`${name} is invalid`)
  }
  return clean
}

function mapRow(row: any): ConversationMessage {
  return {
    id: String(row.id),
    telegramId: String(row.telegram_id),
    channel: row.channel as ConversationChannel,
    externalId: String(row.external_id),
    role: row.role as ConversationRole,
    content: String(row.content),
    metadata:
      row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    createdAt: new Date(row.created_at).toISOString(),
  }
}

export async function ensureConversationSchema(
  pool: ConversationPool
): Promise<void> {
  if (schemaReady.has(pool as object)) return
  await pool.query(
    `SELECT id, telegram_id, channel, external_id, role, content,
            metadata, created_at
       FROM agent_conversation_messages
      LIMIT 0`
  )
  await pool.query(
    `SELECT telegram_id, epoch, cleared_at
       FROM agent_conversation_state
      LIMIT 0`
  )
  schemaReady.add(pool as object)
}

export async function appendConversationMessage(
  pool: ConversationPool,
  input: AppendConversationMessage
): Promise<{ inserted: boolean; message: ConversationMessage | null }> {
  const telegramId = boundedLabel(input.telegramId, 'telegramId', 128)
  const externalId = boundedLabel(input.externalId, 'externalId', 200)
  if (input.channel !== 'mini_app' && input.channel !== 'telegram') {
    throw new Error('channel is invalid')
  }
  if (input.role !== 'user' && input.role !== 'assistant') {
    throw new Error('role is invalid')
  }
  if (!input.content.trim() || input.content.length > 50_000) {
    throw new Error('content is invalid')
  }
  const metadata = input.metadata ?? {}
  if (JSON.stringify(metadata).length > 12_000) {
    throw new Error('metadata is invalid')
  }

  await ensureConversationSchema(pool)
  const result = await pool.query(
    `INSERT INTO agent_conversation_messages
       (telegram_id, channel, external_id, role, content, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (telegram_id, channel, external_id) DO NOTHING
     RETURNING id, telegram_id, channel, external_id, role, content,
               metadata, created_at`,
    [telegramId, input.channel, externalId, input.role, input.content, metadata]
  )
  const row = result.rows[0]
  return { inserted: !!row, message: row ? mapRow(row) : null }
}

export async function findConversationMessage(
  pool: ConversationPool,
  telegramIdInput: string,
  channel: ConversationChannel,
  externalIdInput: string
): Promise<ConversationMessage | null> {
  const telegramId = boundedLabel(telegramIdInput, 'telegramId', 128)
  const externalId = boundedLabel(externalIdInput, 'externalId', 200)
  await ensureConversationSchema(pool)
  const result = await pool.query(
    `SELECT id, telegram_id, channel, external_id, role, content,
            metadata, created_at
       FROM agent_conversation_messages
      WHERE telegram_id = $1 AND channel = $2 AND external_id = $3
      LIMIT 1`,
    [telegramId, channel, externalId]
  )
  return result.rows[0] ? mapRow(result.rows[0]) : null
}

export async function replaceConversationMessageMetadata(
  pool: ConversationPool,
  telegramIdInput: string,
  channel: ConversationChannel,
  externalIdInput: string,
  metadata: Record<string, unknown>
): Promise<void> {
  const telegramId = boundedLabel(telegramIdInput, 'telegramId', 128)
  const externalId = boundedLabel(externalIdInput, 'externalId', 200)
  if (JSON.stringify(metadata).length > 12_000) {
    throw new Error('metadata is invalid')
  }
  await ensureConversationSchema(pool)
  await pool.query(
    `UPDATE agent_conversation_messages
        SET metadata = $4
      WHERE telegram_id = $1 AND channel = $2 AND external_id = $3`,
    [telegramId, channel, externalId, metadata]
  )
}

/** Serialize all model/tool mutations for one verified owner. */
export async function withConversationOwnerLock<T>(
  pool: ConversationPool,
  telegramIdInput: string,
  work: (connection: ConversationPool) => Promise<T>
): Promise<T> {
  const telegramId = boundedLabel(telegramIdInput, 'telegramId', 128)
  if (!pool.connect) return work(pool)
  const releaseSlot = await acquireOwnerTurnSlot()
  let client: Awaited<
    ReturnType<NonNullable<ConversationPool['connect']>>
  > | null = null
  let locked = false
  try {
    client = await pool.connect()
    const deadline = Date.now() + 30_000
    while (!locked && Date.now() < deadline) {
      const result = await client.query(
        `SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired`,
        [`trinity-agent:${telegramId}`]
      )
      locked = result.rows[0]?.acquired === true
      if (!locked) await new Promise(resolve => setTimeout(resolve, 50))
    }
    if (!locked) throw new Error('conversation owner is busy')
    return await work(client)
  } finally {
    if (locked && client) {
      await client
        .query(`SELECT pg_advisory_unlock(hashtextextended($1, 0))`, [
          `trinity-agent:${telegramId}`,
        ])
        .catch(() => undefined)
    }
    client?.release()
    releaseSlot()
  }
}

export async function loadConversationHistory(
  pool: ConversationPool,
  telegramIdInput: string,
  limitInput = 100
): Promise<ConversationMessage[]> {
  const telegramId = boundedLabel(telegramIdInput, 'telegramId', 128)
  const limit = Math.max(1, Math.min(100, Math.trunc(limitInput || 100)))
  await ensureConversationSchema(pool)
  const result = await pool.query(
    `SELECT id, telegram_id, channel, external_id, role, content,
            metadata, created_at
       FROM (
         SELECT m.id, m.telegram_id, m.channel, m.external_id, m.role,
                m.content, m.metadata, m.created_at
           FROM agent_conversation_messages m
           LEFT JOIN agent_conversation_state s
             ON s.telegram_id = m.telegram_id
          WHERE m.telegram_id = $1
            AND (s.cleared_at IS NULL OR m.created_at > s.cleared_at)
          ORDER BY id DESC
          LIMIT $2
       ) recent
      ORDER BY id ASC`,
    [telegramId, limit]
  )
  return result.rows.map(mapRow)
}

export async function clearConversationHistory(
  pool: ConversationPool,
  telegramIdInput: string
): Promise<void> {
  const telegramId = boundedLabel(telegramIdInput, 'telegramId', 128)
  await ensureConversationSchema(pool)
  await pool.query(
    `INSERT INTO agent_conversation_state (telegram_id, epoch, cleared_at)
     VALUES ($1, 1, now())
     ON CONFLICT (telegram_id) DO UPDATE
       SET epoch = agent_conversation_state.epoch + 1,
           cleared_at = now()`,
    [telegramId]
  )
}
