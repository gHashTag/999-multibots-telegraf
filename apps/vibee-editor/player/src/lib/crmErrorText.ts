/**
 * WHY A CRM PANEL IS EMPTY, IN THE READER'S LANGUAGE.
 *
 * The CRM screen talks to the agent's tools on `/mcp` (lib/crm.ts). When a
 * call failed, the panels printed whatever `error` held: three Russian
 * phrases `callTool` wrote itself, or the tool's own refusal -- Russian,
 * because tool text is written for a model. On an English screen that was
 * Russian after "Could not load:".
 *
 * Since 2026-10-03 every failure carries a `code`:
 *   - `callTool`'s own: `http_<status>`, `empty`, `network`, `bad_reply` --
 *     worded by the dictionary (atoms/language.ts) in both languages;
 *   - the server's, from `error.data.code` -- a Russian reader keeps the
 *     server's words, which are the most precise; an English one gets the
 *     sentence below. An unknown code (an older or newer server), or `refused`
 *     (a refusal that named nothing), shows the server's text only when it is
 *     not Russian, and otherwise a plain "the server refused".
 * The server's codes are checked against this file by
 * `crm-tool-codes.test.ts` in render.
 */
import type { Language } from '@/atoms/language'

/** What each server `error.data.code` means, for a reader who is not Russian. */
export const CRM_TOOL_CODES: Record<string, string> = {
  tool_failed: 'the server hit an error — try again in a minute',
  no_identity:
    'the server does not know who you are — open the app from Telegram',
  no_bots:
    'the CRM shows the audience of your bots, and no bot is registered to you',
  no_seller_session:
    'connect your Telegram account in the app — the CRM works from your own account',
  not_your_lead: 'no such person: you have not written to each other',
  unknown_tool:
    'the server does not have this yet — try again after the update',
  bad_tool_name: 'the request was damaged on the way — try again',
  unknown_method: 'the server did not understand the request',
  editorial_scope: 'this key may not open the CRM',
  game_token_scope:
    'the game sign-in does not open the CRM — open the app from Telegram',
}

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
  if (lang === 'ru') return text || t('crm.error.refused')
  const known = Object.prototype.hasOwnProperty.call(CRM_TOOL_CODES, code)
    ? CRM_TOOL_CODES[code]
    : undefined
  if (known) return known
  if (text && !CYRILLIC.test(text)) return text
  return t('crm.error.refused')
}
