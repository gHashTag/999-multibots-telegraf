/**
 * THE QUEEN, BESIDE A CLIENT CONVERSATION.
 *
 * Owner, 2026-09-24: "on the left the dashboard, in the centre the chat with
 * the agent, on the right a chat with the Queen supervisor: she has the
 * client card and history in context and can set the agent a task directly".
 *
 * Her turns go to the same /api/agent/chat with `role: 'supervisor'`: the
 * server opens her own thread (client:<id>:queen), gives her the client's
 * brief plus the agent's recent work, and NO tools. Her own stream, not the
 * agent's (lib/agentStream.ts): talking to her must not wait for the agent,
 * and the agent must not wait for her.
 *
 * What makes her useful is `[[task: ...]]`: a line the app turns into a
 * task for the agent, sent into the centre chat through its queue. A task
 * reaches the AGENT only; anything for the client still becomes a send card
 * the owner presses.
 */
import { atom } from 'jotai'
import { editorStore } from '@/atoms/Provider'
import { queenMessagesAtomFor, type Message } from '@/atoms/agentChat'
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'
import {
  adoptHistory,
  shouldAdoptHistory,
  turnsFromResponse,
} from '@/lib/agentHistory'

/** Which clients have a Queen answer streaming right now. */
export const queenBusyAtom = atom<Record<string, boolean>>({})

const TASK_RE = /\[\[task:\s*([\s\S]*?)\]\]/g

/** The tasks in one answer, in order, trimmed, without duplicates. */
export function tasksIn(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(TASK_RE)) {
    const t = m[1].replace(/\s+/g, ' ').trim()
    if (t && !out.includes(t)) out.push(t)
  }
  return out.slice(0, 3)
}

/** The answer with the markers taken out, for reading. */
export function withoutTasks(text: string): string {
  return text
    .replace(TASK_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

let seq = 0
const newId = (p: string) => `${p}${Date.now()}-${++seq}`

/**
 * Ask the Queen. Resolves to her answer's id and whole text (markers
 * included) when the stream ends, so the caller can hand the tasks to the
 * agent and mark them given on the right message.
 */
export async function askQueen(
  client: string,
  text: string,
  doFetch: typeof fetch = fetch
): Promise<{ id: string; text: string }> {
  const thread = queenMessagesAtomFor(client)
  const trimmed = text.trim()
  if (!trimmed) return { id: '', text: '' }
  const userMsg: Message = { id: newId('qu'), role: 'user', text: trimmed }
  const answerId = newId('qa')
  editorStore.set(thread, prev => [
    ...prev,
    userMsg,
    { id: answerId, role: 'assistant', text: '' },
  ])
  editorStore.set(queenBusyAtom, b => ({ ...b, [client]: true }))
  const patch = (fn: (m: Message) => Message) =>
    editorStore.set(thread, prev =>
      prev.map(m => (m.id === answerId ? fn(m) : m))
    )
  let full = ''
  try {
    const history = editorStore
      .get(thread)
      .filter(m => m.id !== answerId && m.text)
      .slice(-20)
      .map(m => ({ role: m.role, content: m.text }))
    const r = await doFetch(`${API_BASE}/api/agent/chat`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        messages: history,
        surface: 'miniapp',
        client,
        role: 'supervisor',
      }),
    })
    if (!r.ok || !r.body) {
      const j = (await r.json().catch(() => ({}))) as { error?: string }
      throw new Error(j.error || `HTTP ${r.status}`)
    }
    const reader = r.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line) continue
        let ev: Record<string, unknown>
        try {
          ev = JSON.parse(line)
        } catch {
          continue
        }
        const kind = String(ev['тип'] ?? ev['type'] ?? '') // cyrillic-ok: the stream's own field name
        if (kind === 'текст' || kind === 'text') {
          // cyrillic-ok: the stream's own event name
          const chunk = String(ev['текст'] ?? ev['text'] ?? '') // cyrillic-ok: the stream's own field name
          full += chunk
          patch(m => ({ ...m, text: m.text + chunk }))
        } else if (kind === 'ошибка') {
          // cyrillic-ok: the stream's own event name
          const e = String(ev['текст'] ?? '') // cyrillic-ok: the stream's own field name
          patch(m => ({ ...m, text: `${m.text}\n\n⚠️ ${e}` }))
        }
      }
    }
    if (!full.trim()) patch(m => ({ ...m, text: m.text || '…' }))
  } catch (e) {
    const why = String((e as Error)?.message ?? e).slice(0, 200)
    patch(m => ({ ...m, text: `${m.text}\n\n⚠️ ${why}`.trim() }))
  } finally {
    editorStore.set(queenBusyAtom, b => ({ ...b, [client]: false }))
  }
  return { id: answerId, text: full }
}

/**
 * HER CONVERSATION COMES BACK FROM THE SERVER, NOT ONLY FROM THIS BROWSER.
 *
 * Owner, 2026-09-27: "the chat is not kept in the CRM between clients". The
 * centre chat has read its thread back from the server since #2980; the
 * Queen's never did -- her panel drew whatever this browser's storage held.
 * The server has kept her thread (client:<id>:queen) all along, so a webview
 * whose storage does not survive a restart (Telegram on a Mac), another
 * device, or a cleared browser showed her as a stranger to every client.
 *
 * The same merge rule as the centre chat (lib/agentHistory.ts): an empty or
 * shorter server answer never wipes what is on screen, and nothing is
 * replaced while her answer is streaming.
 */
export async function loadQueenHistory(
  client: string,
  doFetch: typeof fetch = fetch
): Promise<boolean> {
  try {
    const r = await doFetch(
      `${API_BASE}/api/agent/history?limit=100&client=${encodeURIComponent(client)}&role=supervisor`,
      { headers: authHeaders() }
    )
    if (!r.ok) return false
    const server = turnsFromResponse(await r.json().catch(() => null))
    const thread = queenMessagesAtomFor(client)
    const busy = editorStore.get(queenBusyAtom)[client] === true
    const local = editorStore.get(thread)
    if (!shouldAdoptHistory({ server, local, busy })) return false
    editorStore.set(thread, adoptHistory(server))
    return true
  } catch {
    // Unreachable history costs the old turns, never the panel.
    return false
  }
}

/** Start the Queen's conversation about this client over. */
export async function clearQueen(client: string): Promise<void> {
  editorStore.set(queenMessagesAtomFor(client), [])
  await fetch(
    `${API_BASE}/api/agent/history?client=${encodeURIComponent(client)}&role=supervisor`,
    { method: 'DELETE', headers: authHeaders() }
  ).catch(() => undefined)
}
