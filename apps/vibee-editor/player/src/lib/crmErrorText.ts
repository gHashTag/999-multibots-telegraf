/**
 * WHY A CRM PANEL IS EMPTY, IN THE READER'S LANGUAGE.
 *
 * The CRM screen talks to the agent's tools on `/mcp` (lib/crm.ts). When a
 * call failed, the panels printed whatever `error` held: three Russian
 * phrases `callTool` wrote itself, or the tool's own refusal -- Russian,
 * because tool text is written for a model. On an English screen that was
 * Russian after "Could not load:".
 *
 * Since 2026-10-03 every failure carries a `code`, and every sentence lives in
 * the dictionary (atoms/language.ts), in both languages:
 *   - `callTool`'s own: `http_<status>`, `empty`, `network`, `bad_reply` --
 *     the `crm.error.*` keys;
 *   - the server's, from `error.data.code` -- `crm.error.code.<code>`, the
 *     same pattern as `reasonLine` and `crm.why.<code>` in lib/crm.ts. A code
 *     this screen does not know yet (a newer server), or `refused` (a refusal
 *     that named nothing), shows the server's own text: always for a Russian
 *     reader, and for anyone else only when it is not Russian -- otherwise a
 *     plain "the server refused".
 * Every code the server can send is checked against both dictionaries by
 * `crm-tool-codes.test.ts` in render.
 */
import type { Language } from '@/atoms/language'

/** What `lib/crm.ts` `Reached` carries about a failure. */
export interface CrmFailure {
  error?: string
  code?: string
}

type Translate = (key: string, vars?: Record<string, string | number>) => string

const CYRILLIC = /\p{Script=Cyrillic}/u

/** The sentence for a failed tool call; '' when nothing failed. */
export function crmErrorText(
  failure: CrmFailure,
  lang: Language,
  t: Translate
): string {
  const { code } = failure
  const text = String(failure.error ?? '').trim()
  if (!code) return text
  const http = /^http_(\d{3})$/.exec(code)
  if (http) return t('crm.error.http', { status: http[1]! })
  if (code === 'empty') return t('crm.error.empty')
  if (code === 'network') return t('crm.error.network')
  if (code === 'bad_reply') return t('crm.error.badReply')
  // The server spoke: its code, or `refused` when it named nothing.
  const key = `crm.error.code.${code}`
  const line = t(key)
  if (line !== key) return line
  if (text && (lang === 'ru' || !CYRILLIC.test(text))) return text
  return t('crm.error.refused')
}
