/**
 * THE t27 TOOLS LIVE IN THIS REGISTRY, NOT BEHIND A SECOND SERVER.
 *
 * Spec of record: specs/t27mcp/service.t27 (gHashTag/t27#10484). Owner,
 * 2026-10-18: TRI CLAW and the t27 MCP are one service. The t27-mcp package
 * exports its tools as a library; this file mounts every one the spec admits
 * (`admit(name, H_T27) === A_MOUNT`) into TOOLS, so the same /mcp that serves
 * the CRM, the board and the feed serves the .t27 corpus too.
 *
 * The rule has one home: t27-mcp/service runs service.wasm, compiled from the
 * spec. This file decides nothing; it only adapts a t27 tool to AgentTool.
 *
 * A t27 tool answers text. JSON text becomes the object, so /mcp returns it as
 * structuredContent like every other tool; anything else is `{ text }`.
 */
import { tools, call } from 't27-mcp'
import {
  admit,
  homeOf,
  t27Visible,
  A_MOUNT,
  ADMIT_TEXT,
  CODER_TOOLS,
  H_T27,
  H_TRI_CLAW,
  S_EDITORIAL,
  S_GAME,
  S_OWNER,
} from 't27-mcp/service'
import type { AgentTool } from './tools'

export { admit, homeOf, t27Visible, A_MOUNT, ADMIT_TEXT, H_T27, H_TRI_CLAW }

const asObject = (text: string): Record<string, unknown> => {
  try {
    const v = JSON.parse(text)
    return v && typeof v === 'object' && !Array.isArray(v) ? v : { result: v }
  } catch {
    return { text }
  }
}

export const T27_TOOLS: AgentTool[] = tools
  .filter(t => admit(t.name, H_T27) === A_MOUNT)
  .map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.inputSchema,
    handler: async args => asObject(await call(t.name, args)),
  }))

/**
 * What a model turn is offered from the t27 home: the coder persona's tools
 * (service.t27 CODER_TOOLS) and the corpus filter. The other t27 tools stay on
 * /mcp, called on purpose; offering all nineteen on every turn costs tokens
 * and buys nothing a person asked for.
 */
export const T27_TURN_TOOLS: ReadonlySet<string> = new Set([
  ...CODER_TOOLS,
  't27_specs',
])

/** The spec's scope for a /mcp identity: 'full' is the owner scope. */
export const scopeOf = (scope: string, game: boolean): number =>
  game ? S_GAME : scope === 'leela-editorial' ? S_EDITORIAL : S_OWNER

/** Is this tool hidden from a caller of this scope? */
export const t27Hidden = (name: string, scope: number): boolean =>
  homeOf(name) === H_T27 && !t27Visible(scope)
