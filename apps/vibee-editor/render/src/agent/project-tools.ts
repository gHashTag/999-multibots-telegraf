import {
  ensureProjectsTable,
  projectIdIsValid,
  PROJECT_LIMITS,
} from '../../project-routes'
import type { AgentTool, ToolContext } from './tools'

const idSchema = {
  type: 'string',
  minLength: 1,
  maxLength: 64,
  pattern: '^[A-Za-z0-9_-]+$',
}

const requireId = (value: unknown): string => {
  const id = String(value ?? '')
  if (!projectIdIsValid(id)) throw new Error('project_id is invalid')
  return id
}

const requireComposition = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('composition must be a JSON object')
  }
  return value as Record<string, unknown>
}

async function ready(ctx: ToolContext): Promise<void> {
  await ensureProjectsTable(ctx.pool)
}

export const PROJECT_TOOLS: AgentTool[] = [
  {
    name: 'projects_list',
    description:
      "List the owner's private editing projects, newest first. Metadata only; no publishing or spending.",
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async handler(_args, ctx) {
      await ready(ctx)
      const result = await ctx.pool.query(
        `SELECT id, name, updated_at::text
           FROM projects WHERE telegram_id = $1
           ORDER BY updated_at DESC LIMIT ${PROJECT_LIMITS.LIST}`,
        [ctx.telegramId]
      )
      return { projects: result.rows }
    },
  },
  {
    name: 'project_get',
    description:
      'Read one private draft project owned by the caller. A foreign id is reported as missing.',
    parameters: {
      type: 'object',
      properties: { project_id: idSchema },
      required: ['project_id'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      const id = requireId(args.project_id)
      await ready(ctx)
      const result = await ctx.pool.query(
        `SELECT id, name, composition::text AS composition, updated_at::text
           FROM projects WHERE id = $1 AND telegram_id = $2`,
        [id, ctx.telegramId]
      )
      const row = result.rows[0]
      if (!row) return { found: false }
      return {
        found: true,
        id: String(row.id),
        name: String(row.name ?? ''),
        composition: JSON.parse(String(row.composition)),
        updated_at: String(row.updated_at),
        draft: true,
      }
    },
  },
  {
    name: 'project_save',
    description:
      "Create or update the caller's private draft project. Does not render, publish, generate, or spend credits.",
    parameters: {
      type: 'object',
      properties: {
        project_id: idSchema,
        name: { type: 'string', maxLength: PROJECT_LIMITS.NAME_CHARS },
        composition: { type: 'object' },
      },
      required: ['project_id', 'name', 'composition'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      const id = requireId(args.project_id)
      const composition = requireComposition(args.composition)
      const name = String(args.name ?? '').slice(0, PROJECT_LIMITS.NAME_CHARS)
      await ready(ctx)
      const result = await ctx.pool.query(
        `INSERT INTO projects (id, telegram_id, name, composition, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, now())
         ON CONFLICT (id) DO UPDATE
            SET name = EXCLUDED.name,
                composition = EXCLUDED.composition,
                updated_at = now()
          WHERE projects.telegram_id = $2
         RETURNING id, name, updated_at::text`,
        [id, ctx.telegramId, name, JSON.stringify(composition)]
      )
      const row = result.rows[0]
      if (!row) return { saved: false, reason: 'project not found' }
      return {
        saved: true,
        draft: true,
        id: String(row.id),
        name: String(row.name ?? ''),
        updated_at: String(row.updated_at),
      }
    },
  },
]
