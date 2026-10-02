/**
 * A TOOL'S REFUSAL WITH A NAME, NOT ONLY A RUSSIAN SENTENCE.
 *
 * Tool messages are written for a model in Russian, and `/mcp` hands them to
 * the CRM screen as the JSON-RPC `error.message`. An English screen printed
 * them as they came. The shared gates every CRM tool passes through -- who is
 * asking, whose bots, whose Telegram session, whose lead -- now throw this
 * instead of a bare Error, and routes.ts puts the name in `error.data.code`.
 * The message is untouched: the agent reads the same words as before, and
 * `String(e)` still starts with "Error:" because `name` is not overridden.
 *
 * The set is closed on purpose: `crm-tool-codes.test.ts` reads this union and
 * fails until player/src/lib/crmErrorText.ts has a sentence for each member.
 * Anything else a tool throws arrives as `tool_failed`.
 */
export type ToolRefusalCode =
  | 'no_identity'
  | 'no_bots'
  | 'no_seller_session'
  | 'not_your_lead'

export class ToolRefusal extends Error {
  readonly code: ToolRefusalCode
  constructor(code: ToolRefusalCode, message: string) {
    super(message)
    this.code = code
  }
}

/** The name `/mcp` sends for a thrown tool error. */
export const toolFailureCode = (e: unknown): ToolRefusalCode | 'tool_failed' =>
  e instanceof ToolRefusal ? e.code : 'tool_failed'
