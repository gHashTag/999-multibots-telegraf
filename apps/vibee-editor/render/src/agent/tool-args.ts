/**
 * A CALL MISSING ITS ARGUMENTS IS REFUSED, NOT ANSWERED WITH NOTHING.
 *
 * 2026-09-22: `browser_evaluate {expression: …}` -- the field is `code` --
 * came back `{}`, and `browser_close_tab {}` came back `{closed:
 * "undefined"}` having closed nothing. Both look like success to the caller.
 * Every tool publishes a JSON Schema (tools.ts AgentTool.parameters, the same
 * one MCP tools/list sends out), so each dispatcher -- chat, /mcp, A2A --
 * checks the call against it first: a missing required field, or a field the
 * schema does not know, is an error that names the fields the tool takes.
 */
export function argsProblem(
  tool: { name: string; parameters: Record<string, unknown> },
  args: unknown
): string | null {
  const schema = tool.parameters as {
    properties?: Record<string, unknown>
    required?: string[]
    additionalProperties?: boolean
  }
  const given =
    args && typeof args === 'object' && !Array.isArray(args)
      ? (args as Record<string, unknown>)
      : {}
  const known = Object.keys(schema.properties ?? {})
  const missing = (schema.required ?? []).filter(
    k => given[k] === undefined || given[k] === null
  )
  const unknown =
    schema.additionalProperties === false
      ? Object.keys(given).filter(k => !known.includes(k))
      : []
  if (!missing.length && !unknown.length) return null
  const parts: string[] = []
  if (missing.length) parts.push(`missing ${missing.join(', ')}`)
  if (unknown.length) parts.push(`unknown ${unknown.join(', ')}`)
  return `${tool.name}: ${parts.join('; ')}. It takes: ${known.join(', ') || 'no arguments'}`
}

/** Throws the problem, for dispatchers whose errors already become answers. */
export function assertArgs(
  tool: { name: string; parameters: Record<string, unknown> },
  args: unknown
): void {
  const problem = argsProblem(tool, args)
  if (problem) throw new Error(problem)
}
