/**
 * THE MEMORY STARTS THE MOMENT THE ACCOUNT IS CONNECTED.
 *
 * Until now the correspondence reached the memory only when somebody asked
 * for an ingest or the half-hour sweep ran. An owner who had just connected
 * their Telegram and opened a client's DM was answered by an agent that knew
 * nothing of a year of conversation. So the ingest runs by itself, right
 * after the session is saved: every dialog, deep, into Postgres and Zep.
 *
 * Fire-and-forget: the connect route answers at once; the walk over dozens
 * of dialogs takes minutes and its failure is logged, not shown -- the
 * session is saved either way, and the sweep will try again.
 */

type Pool = { query: (sql: string, params?: unknown[]) => Promise<unknown> }

export interface IngestReport {
  people?: number
  messages_new?: number
  zep_mirrored?: number
  stopped?: string | null
}

async function runIngest(
  pool: Pool,
  telegramId: string
): Promise<IngestReport> {
  const { CRM_MEMORY_TOOLS } = await import('./crm-memory-tools')
  const tool = CRM_MEMORY_TOOLS.find(t => t.name === 'crm_ingest_chats')
  if (!tool) throw new Error('crm_ingest_chats is not registered')
  return (await tool.handler({ limit: 100, depth: 200 }, {
    telegramId,
    pool,
    surface: 'bot',
    turn: 'connect',
  } as never)) as IngestReport
}

export async function ingestAfterConnect(
  pool: Pool,
  telegramId: string,
  run: (pool: Pool, telegramId: string) => Promise<IngestReport> = runIngest
): Promise<IngestReport | null> {
  try {
    const r = await run(pool, telegramId)
    console.log(
      `[crm] ingest after connect for ${telegramId}: people=${r.people ?? '?'} new=${r.messages_new ?? '?'} zep=${r.zep_mirrored ?? '?'}${r.stopped ? ' stopped=' + r.stopped : ''}`
    )
    return r
  } catch (e) {
    console.warn(
      `[crm] ingest after connect failed for ${telegramId}: ${String(e).slice(0, 160)}`
    )
    return null
  }
}
